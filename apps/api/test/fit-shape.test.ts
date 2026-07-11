import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildMcpServer } from "../src/mcp";

// C③：fit はどの target/引数でも generate と同じ items 形 {items:[{kind,content}]} で返す
//（web の chat-stream は payload.items を前提にカード化＝形が崩れると候補が描画されない）。
// C④：drums(rhythm) は beatsPerStep を持ち step↔拍 が自己記述になっている。

async function connect() {
  const core = new Core(openDb(":memory:"));
  const server = buildMcpServer(core);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client };
}
const payload = (res: unknown) =>
  JSON.parse((res as { content: { text: string }[] }).content[0]!.text);

const CHORDS = [
  { root: 0, quality: "", start: 0, dur: 4 },
  { root: 7, quality: "", start: 4, dur: 4 },
];
const MELODY = [
  { pitch: 60, start: 0, dur: 1 },
  { pitch: 61, start: 1, dur: 1 }, // C#=外し音（補正対象になりうる）
  { pitch: 67, start: 4, dur: 1 },
];

describe("C③ fit は全 target で items 形に統一", () => {
  it("target=melody・既存メロ補正：items[0].content.notes＋meta.before/after", async () => {
    const { client } = await connect();
    const p = payload(await client.callTool({ name: "fit", arguments: { target: "melody", frame: { meter: "4/4" }, chords: CHORDS, melody: MELODY } }));
    expect(Array.isArray(p.items), "items 配列").toBe(true);
    expect(p.items[0].kind).toBe("melody");
    expect(Array.isArray(p.items[0].content.notes)).toBe(true);
    expect(p.meta).toHaveProperty("before");
    expect(p.meta).toHaveProperty("after");
  });

  it("target=melody・新規メロ：items 形", async () => {
    const { client } = await connect();
    const p = payload(await client.callTool({ name: "fit", arguments: { target: "melody", frame: { meter: "4/4", bars: 2 }, chords: CHORDS } }));
    expect(Array.isArray(p.items)).toBe(true);
    expect(p.items[0].content.notes.length).toBeGreaterThan(0);
  });

  it("target=melody・新規メロは V2 本線に乗る（J2c 2026-07-11＝useV2 無しで旧経路③④に落ちていた是正）", async () => {
    const { client } = await connect();
    const args = { target: "melody", frame: { meter: "4/4", bars: 2 }, chords: CHORDS, seed: 7 };
    const p = payload(await client.callTool({ name: "fit", arguments: args }));
    // gen_melody（常に useV2:true）と同一 seed・同一入力で同一ノートになる＝同じ本線を通っている証拠。
    const g = payload(await client.callTool({ name: "gen_melody", arguments: { frame: { meter: "4/4", bars: 2 }, chords: CHORDS, seed: 7 } }));
    expect(JSON.stringify(p.items[0].content.notes)).toBe(JSON.stringify(g.items[0].content.notes));
  });

  it("target=bass：items 形", async () => {
    const { client } = await connect();
    const p = payload(await client.callTool({ name: "fit", arguments: { target: "bass", frame: { meter: "4/4", bars: 2 }, chords: CHORDS } }));
    expect(Array.isArray(p.items)).toBe(true);
    expect(p.items[0].kind).toBe("bass");
  });

  it("target=chords・ハモ付け：items[0].content.chords＋meta.bars に代替候補", async () => {
    const { client } = await connect();
    const p = payload(await client.callTool({ name: "fit", arguments: { target: "chords", frame: { meter: "4/4" }, melody: MELODY, key: 0 } }));
    expect(Array.isArray(p.items)).toBe(true);
    expect(p.items[0].kind).toBe("chord_progression");
    expect(Array.isArray(p.items[0].content.chords)).toBe(true);
    expect(Array.isArray(p.meta.bars)).toBe(true);
  });
});

describe("C④ drums は beatsPerStep で step↔拍 が自己記述", () => {
  it("4/4 は16step・beatsPerStep=0.25、6/8 は12step・beatsPerStep=0.25", async () => {
    const { client } = await connect();
    const p44 = payload(await client.callTool({ name: "gen_drums", arguments: { frame: { meter: "4/4" } } }));
    const r44 = p44.items[0].content.rhythm;
    expect(r44.steps).toBe(16);
    expect(r44.beatsPerStep).toBeCloseTo(0.25, 6);
    const p68 = payload(await client.callTool({ name: "gen_drums", arguments: { frame: { meter: "6/8" } } }));
    const r68 = p68.items[0].content.rhythm;
    expect(r68.steps).toBe(12);
    expect(r68.beatsPerStep).toBeCloseTo(0.25, 6);
  });
});
