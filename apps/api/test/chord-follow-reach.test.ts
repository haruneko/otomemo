// 到達口の監査（M3-3b・計画 §11-3 の 7／design.md 追補 (k)「作ったのに触れないノブは硬化する」）。
// `chordFollow` が **4口すべて** から届くこと＝関数に生えていても外から渡せなければ無いのと同じ。
//   ①`/music/gen_bass`（HTTP）②MCP `gen_bass`（inputSchema）③`/gen/section`（body.bass 素通し）④web（別ファイル）
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";
import { genBass, genDrums, type DrumsInput } from "../src/music/generate";

type Note = { pitch: number; start: number; dur: number };
const FRAME = { bars: 2, meter: "4/4", key: 0 };
const CHORDS = [{ root: 9, quality: "min", start: 0, dur: 4 }, { root: 5, quality: "", start: 4, dur: 4 }];
const DR: DrumsInput = { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [
  { name: "Kick", midi: 36, hits: [0, 5, 9, 13] }, { name: "Snare", midi: 38, hits: [4, 12] },
] } };
// 期待＝生成器を直に呼んだ結果（結線の実体）。
const direct = (o: object) => (genBass(FRAME, CHORDS, 42, DR, o).items[0]!.content as { notes: Note[]; engine?: { version: string } });

describe("到達口①＝/music/gen_bass（HTTP）", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });

  it("chordFollow:true が届く（engine が刻まれ、生成器直呼びと列一致）", async () => {
    const r = await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: FRAME, chords: CHORDS, seed: 42, drums: DR, style: "CP-WALK", chordFollow: true } });
    expect(r.statusCode).toBe(200);
    const c = (r.json() as { items: { content: { notes: Note[]; engine?: { version: string } } }[] }).items[0]!.content;
    expect(c.engine?.version).toMatch(/^pm-/);
    expect(c.notes).toEqual(direct({ style: "CP-WALK", chordFollow: true }).notes);
    // 値が本当に届いている（OFF とは違う列になる）
    expect(c.notes).not.toEqual(direct({ style: "CP-WALK" }).notes);
  });

  it("chordFollow 未指定＝従来経路（engine キー無し）＝回帰", async () => {
    const r = await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: FRAME, chords: CHORDS, seed: 42, drums: DR } });
    const c = (r.json() as { items: { content: Record<string, unknown> }[] }).items[0]!.content;
    expect("engine" in c).toBe(false);
  });

  it("経路が立たない時は **meta.warnings** で HTTP 応答に届く（web が読む口・独自キーは無言）", async () => {
    const r = await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: FRAME, seed: 42, drums: DR, chordFollow: true } });
    const j = r.json() as { meta?: { warnings?: string[] }; chordFollowFallback?: string };
    expect((j.meta?.warnings ?? []).join("|")).toMatch(/コードが無い/);
    expect("chordFollowFallback" in j).toBe(false);
  });

  it("**最終出力（HTTP 応答の content）に対して**5ガードが成り立つ（純関数の出口だけで満足しない）", async () => {
    // fill/land/skeleton など後段の上書きがあっても①②が破れないこと＝監査の指摘（轍2）への実測。
    const payload = { frame: { ...FRAME, bars: 4, section: { role: "chorus", cues: [{ kind: "land", bar: 0 }] } }, chords: [
      { root: 9, quality: "min", start: 0, dur: 4 }, { root: 5, quality: "maj", start: 4, dur: 4 },
      { root: 7, quality: "7", start: 8, dur: 4 }, { root: 2, quality: "m7", start: 12, dur: 4 },
    ], seed: 42, drums: DR, style: "CP-WALK", fill: 0.8, chordFollow: true };
    const r = await app.inject({ method: "POST", url: "/music/gen_bass", payload });
    const notes = (r.json() as { items: { content: { notes: Note[] } }[] }).items[0]!.content.notes;
    const TONES: Record<string, number[]> = { min: [0, 3, 7], maj: [0, 4, 7], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10] };
    const SCALE: Record<string, number[]> = { min: [0, 2, 3, 5, 7, 8, 10], maj: [0, 2, 4, 5, 7, 9, 11], "7": [0, 2, 4, 5, 7, 9, 10], m7: [0, 2, 3, 5, 7, 8, 10] };
    const chOf = (t: number) => payload.chords.find((c) => c.start <= t + 1e-9 && t < c.start + c.dur)!;
    const pc = (p: number) => ((p % 12) + 12) % 12;
    let heads = 0, unresolved = 0;
    notes.forEach((n, i) => {
      const c = chOf(n.start);
      const tone = TONES[c.quality]!.some((t) => pc(c.root + t) === pc(n.pitch));
      if (Math.abs(n.start - Math.round(n.start)) < 1e-9) { heads++; expect(tone, `head@${n.start} pitch=${n.pitch} ${c.quality}`).toBe(true); } // ①
      const inScale = tone || SCALE[c.quality]!.some((t) => pc(c.root + t) === pc(n.pitch));
      const nxt = notes[i + 1];
      if (!inScale && !(nxt && Math.abs(n.pitch - nxt.pitch) === 1)) unresolved++;                                                             // ②
      expect(n.pitch).toBeGreaterThanOrEqual(33);                                                                                              // ④
      expect(n.pitch).toBeLessThanOrEqual(48);
    });
    expect(heads).toBeGreaterThan(8); // 分母が空でない
    expect(unresolved).toBe(0);
  });
});

describe("到達口②＝MCP gen_bass", () => {
  async function connect() {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(st), client.connect(ct)]);
    return client;
  }
  const textOf = (res: unknown) => (res as { content: { text: string }[] }).content[0]!.text;

  it("inputSchema に chordFollow が在る（Claude から渡せる）＋説明が排他を書いている", async () => {
    const client = await connect();
    const tool = (await client.listTools()).tools.find((t) => t.name === "gen_bass")!;
    const props = (tool.inputSchema as { properties: Record<string, { description?: string }> }).properties;
    expect(Object.keys(props)).toContain("chordFollow");
    expect(props.chordFollow!.description).toMatch(/approach/); // 上位互換＝排他が説明に在る（型と実態がずれない）
  });

  it("届く（生成器直呼びと列一致・OFF とは別物）", async () => {
    const client = await connect();
    const call = async (args: object) => {
      const r = await client.callTool({ name: "gen_bass", arguments: { frame: FRAME, chords: CHORDS, seed: 42, drums: DR, style: "CP-WALK", ...args } });
      return JSON.parse(textOf(r)) as { items: { content: { notes: Note[]; engine?: { version: string } } }[] };
    };
    const on = await call({ chordFollow: true });
    expect(on.items[0]!.content.engine?.version).toMatch(/^pm-/);
    expect(on.items[0]!.content.notes).toEqual(direct({ style: "CP-WALK", chordFollow: true }).notes);
    const off = await call({});
    expect(off.items[0]!.content.notes).not.toEqual(on.items[0]!.content.notes);
  });
});

describe("到達口③＝/gen/section（body.bass 素通し）", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });

  it("bass.chordFollow が genBass まで届く（直呼びと列一致）", async () => {
    const frame = { bars: 2, meter: "4/4", key: 0 };
    const seed = 42;
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { frame, seed, parts: ["chords", "bass", "drums"], bass: { chordFollow: true } } });
    expect(r.statusCode).toBe(200);
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] } };
    const bass = comp.composition.children.find((c) => c.node.neta.kind === "bass")!.node.neta.content as { notes: Note[]; engine?: { version: string } };
    expect(bass.engine?.version).toMatch(/^pm-/); // 新経路が実際に立った証拠
    const drums = genDrums(frame, seed).items[0]!.content as DrumsInput;
    const chords = (comp.composition.children.find((c) => c.node.neta.kind === "chord_progression")!.node.neta.content as { chords: { root: number; quality: string; start: number; dur: number }[] }).chords;
    expect(bass.notes).toEqual((genBass(frame, chords, seed, drums, { chordFollow: true }).items[0]!.content as { notes: Note[] }).notes);
  });

  it("bass ノブ未指定は従来と bit 一致（engine キーも生えない）", async () => {
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { frame: { bars: 2, meter: "4/4", key: 0 }, seed: 7, parts: ["chords", "bass", "drums"] } });
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: Record<string, unknown> } } }[] } };
    const bass = comp.composition.children.find((c) => c.node.neta.kind === "bass")!.node.neta.content;
    expect("engine" in bass).toBe(false);
  });
});
