import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildMcpServer } from "../src/mcp";

async function connect() {
  const core = new Core(openDb(":memory:"));
  const server = buildMcpServer(core);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, core };
}
const textOf = (res: unknown) => (res as { content: { text: string }[] }).content[0]!.text;

const frame = { key: 0, mode: "major", meter: "4/4", bars: 4 };
const chords = [
  { root: 0, quality: "", start: 0, dur: 4 },
  { root: 5, quality: "", start: 4, dur: 4 },
  { root: 7, quality: "", start: 8, dur: 4 },
  { root: 0, quality: "", start: 12, dur: 4 },
];

describe("mcp gen_skeleton / gen_melody skeleton injection (design #20)", () => {
  it("exposes gen_skeleton", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("gen_skeleton");
  });

  it("gen_skeleton returns kind=skeleton candidates", async () => {
    const { client } = await connect();
    const res = await client.callTool({ name: "gen_skeleton", arguments: { frame, chords, seed: 3 } });
    const out = JSON.parse(textOf(res));
    expect(out.items.length).toBe(1);
    expect(out.items[0].kind).toBe("skeleton");
    expect(out.items[0].content.bars).toBe(4);
    expect(out.items[0].content.tones.length).toBeGreaterThan(0);
  });

  it("gen_melody(skeletonNetaId) injects a captured skeleton and echoes the id for linking", async () => {
    const { client, core } = await connect();
    // 骨格を生成→capture
    const skelRes = JSON.parse(textOf(await client.callTool({ name: "gen_skeleton", arguments: { frame, chords, seed: 3 } })));
    const captured = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "skeleton", content: skelRes.items[0].content } })));
    expect(captured.id).toBeTruthy();
    // 骨格注入でメロ生成
    const mel = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 5, skeletonNetaId: captured.id } })));
    expect(mel.skeletonNetaId).toBe(captured.id);
    expect(mel.items[0].content.notes.length).toBeGreaterThan(0);
    // capture 後に realized_from を張れる（gen_melody は候補返しで neta 化しないため link は呼び出し側）
    const melNeta = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "melody", content: mel.items[0].content } })));
    await client.callTool({ name: "link", arguments: { from: melNeta.id, to: captured.id, type: "realized_from" } });
    const rels = core.getRelations(melNeta.id);
    expect(rels.some((r) => r.type === "realized_from" && r.to === captured.id)).toBe(true);
    // 骨格側からは逆引き（getBacklinks）で表面化済みメロへ辿れる（design #20 見える化・双方向）。
    const back = core.getBacklinks(captured.id, "realized_from");
    expect(back.some((r) => r.type === "realized_from" && r.from === melNeta.id)).toBe(true);
    // 骨格は realized_from の outgoing を持たない（メロ→骨格向きに張るため）。
    expect(core.getRelations(captured.id).some((r) => r.type === "realized_from")).toBe(false);
  });

  it("gen_melody(skeletonNetaId) errors on a non-skeleton neta", async () => {
    const { client } = await connect();
    const mel = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } } })));
    const res = (await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 5, skeletonNetaId: mel.id } })) as { isError?: boolean };
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("not skeleton");
  });
});
