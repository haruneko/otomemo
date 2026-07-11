import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildMcpServer } from "../src/mcp";

// J2a（Task#13）：gen_melody の MCP/HTTP 入口は meter 透過＝3/4 指定でそのまま V2(barLen=3)へ届く e2e 級確認。
async function connect() {
  const core = new Core(openDb(":memory:"));
  const server = buildMcpServer(core);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client };
}
const textOf = (res: unknown) => (res as { content: { text: string }[] }).content[0]!.text;

const ROOTS = [0, 9, 5, 7, 0, 9, 5, 7];
const QUALS = ["maj7", "min7", "maj7", "7", "maj7", "min7", "maj7", "7"];

describe("mcp gen_melody 3/4・6/4（meter 透過＝V2 barLen 拡張）", () => {
  it("gen_melody(meter=3/4) は 1小節3拍のメロを返す（onset < bars*3・16分格子）", async () => {
    const { client } = await connect();
    const frame = { key: 0, mode: "major", meter: "3/4", bars: 8 };
    const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 3, dur: 3 }));
    const out = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 5 } })));
    const notes = out.items[0].content.notes as { start: number }[];
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.start).toBeLessThan(8 * 3 + 1e-6);
      expect(Math.abs(n.start * 4 - Math.round(n.start * 4))).toBeLessThan(1e-6);
    }
    expect(notes.some((n) => n.start >= 12)).toBe(true); // 後半まで展開＝旧経路④の縮退でない
  });

  it("gen_melody(meter=6/4) は 1小節6拍のメロを返す（onset < bars*6）", async () => {
    const { client } = await connect();
    const frame = { key: 0, mode: "major", meter: "6/4", bars: 8 };
    const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 6, dur: 6 }));
    const out = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 5 } })));
    const notes = out.items[0].content.notes as { start: number }[];
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(n.start).toBeLessThan(8 * 6 + 1e-6);
  });
});
