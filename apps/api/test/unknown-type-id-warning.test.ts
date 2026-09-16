// 2026-09-17 黙って落ちる修正（backlog「黙って落ちる・2026-09-16 発見」）：未知の型 ID（pattern/style）は
//   従来経路へ落ちる（出音はそのまま）が、黙らず meta.warnings（/gen/section は warnings）で落ち先を告げる。
//   既知の型ID・ジャンル名・おまかせ番兵・未指定・空文字は通知を生やさない（従来の形のまま）。到達口＝直呼び／HTTP／MCP／/gen/section。
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";
import { genBass, genChordPattern, genDrums } from "../src/music/generate";

const FRAME = { bars: 4, meter: "4/4", key: 0, tempo: 120 };
const CHORDS = [{ root: 9, quality: "m", start: 0, dur: 8 }, { root: 5, quality: "", start: 8, dur: 8 }];
type Res = { items: { content: unknown }[]; meta?: { warnings?: string[] } };
const NF = "が見つからないので";

describe("直呼び：未知の型IDは告げる・出音は従来経路と同じ", () => {
  it("コード楽器 pattern", () => {
    const r = genChordPattern(FRAME, 7, { pattern: "XX-NOPE" }) as Res;
    expect(r.items).toStrictEqual((genChordPattern(FRAME, 7, undefined) as Res).items);
    expect(r.meta?.warnings).toEqual([expect.stringMatching(/^コード楽器の型『XX-NOPE』が見つからないので/)]);
    const rv = genChordPattern(FRAME, 7, { pattern: "XX-NOPE", variety: 4 }) as Res;
    expect(rv.meta?.warnings?.[0]).toContain(NF);
  });
  it("ベース style", () => {
    const r = genBass(FRAME, CHORDS, 7, undefined, { style: "XX-NOPE" }) as Res;
    expect(r.items).toStrictEqual((genBass(FRAME, CHORDS, 7, undefined, {}) as Res).items);
    expect(r.meta?.warnings).toEqual([expect.stringMatching(/^ベースの型『XX-NOPE』が見つからないので/)]);
  });
  it("ドラム style", () => {
    const r = genDrums(FRAME, 7, { style: "XX-NOPE" }) as Res;
    expect(r.items).toStrictEqual((genDrums(FRAME, 7, undefined) as Res).items);
    expect(r.meta?.warnings).toEqual([expect.stringMatching(/^ドラムの型『XX-NOPE』が見つからないので/)]);
  });
  it("未知ではない指定（型ID・ジャンル名・別名・おまかせ番兵・空文字・JZ-WALK）は通知しない", () => {
    for (const p of ["DN-OFFBEAT", "dance", "edm", "omakase", "any", "all", ""]) {
      for (const variety of [undefined, 4]) expect((genChordPattern(FRAME, 7, { pattern: p, variety }) as Res).meta?.warnings ?? [], p).not.toContainEqual(expect.stringContaining(NF));
    }
    for (const s of ["ED-PULSE", "rock", "vocaloid", "JZ-WALK", ""]) expect((genBass(FRAME, CHORDS, 7, undefined, { style: s }) as Res).meta?.warnings ?? [], s).not.toContainEqual(expect.stringContaining(NF));
    for (const s of ["four.rock", "jpop", "pop", ""]) expect((genDrums(FRAME, 7, { style: s }) as Res).meta?.warnings ?? [], s).not.toContainEqual(expect.stringContaining(NF));
  });
});

describe("到達口", () => {
  it("HTTP", async () => {
    const app = buildHttp(new Core(openDb(":memory:"))); await app.ready();
    const post = async (op: string, p: object) => (await app.inject({ method: "POST", url: `/music/${op}`, payload: p })).json() as Res;
    expect((await post("gen_chord_pattern", { frame: FRAME, seed: 7, pattern: "XX-NOPE" })).meta?.warnings?.[0]).toContain(NF);
    expect((await post("gen_bass", { frame: FRAME, chords: CHORDS, seed: 7, style: "XX-NOPE" })).meta?.warnings?.[0]).toContain(NF);
    expect((await post("gen_drums", { frame: FRAME, seed: 7, style: "XX-NOPE" })).meta?.warnings?.[0]).toContain(NF);
    expect("meta" in (await post("gen_chord_pattern", { frame: FRAME, seed: 7, pattern: "omakase", variety: 4 }))).toBe(false);
  });
  it("/gen/section：ベース・ドラムの未知 style を告げる／既知なら warnings は生えない", async () => {
    const app = buildHttp(new Core(openDb(":memory:"))); await app.ready();
    const sec = async (p: object) => (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: FRAME, seed: 11, parts: ["chord_pattern", "bass", "rhythm"], ...p } })).json() as { warnings?: string[] };
    const bad = await sec({ bass: { style: "XX-B" }, drums: { style: "XX-D" } });
    expect(bad.warnings).toEqual(expect.arrayContaining([expect.stringContaining("ベースの型『XX-B』"), expect.stringContaining("ドラムの型『XX-D』")]));
    expect((await sec({ bass: { style: "rock" }, drums: { style: "rock" } })).warnings).toBeUndefined();
  });
  it("MCP（style/pattern は z.string＝スキーマで弾かれず素通り→meta.warnings で告げる）", async () => {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [a, b] = InMemoryTransport.createLinkedPair();
    const cl = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(a), cl.connect(b)]);
    const call = async (name: string, args: Record<string, unknown>): Promise<Res> =>
      JSON.parse(((await cl.callTool({ name, arguments: args })).content as { text: string }[])[0]!.text) as Res;
    expect((await call("gen_chord_pattern", { frame: FRAME, seed: 7, pattern: "XX-NOPE" })).meta?.warnings?.[0]).toContain(NF);
    expect((await call("gen_bass", { frame: FRAME, chords: CHORDS, seed: 7, style: "XX-NOPE" })).meta?.warnings?.[0]).toContain(NF);
    expect((await call("gen_drums", { frame: FRAME, seed: 7, style: "XX-NOPE" })).meta?.warnings?.[0]).toContain(NF);
  });
});
