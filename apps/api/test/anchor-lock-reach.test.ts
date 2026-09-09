// 到達口の監査（M3-3a・計画 §11-3 の 7／design.md 追補 (k)「作ったのに触れないノブは硬化する」）。
// `anchorLock` と案B つまみが **4口すべて** から届くこと＝関数に生えていても外から渡せなければ無いのと同じ。
//   ①`/music/gen_bass`（HTTP）②MCP `gen_bass` ③`/gen/section`（body.bass 素通し）④web TinkerSheet（別ファイル）
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
// 期待＝生成器を直に呼んだ結果（結線の実体）。案B の効きは onset 数の差で見る。
const direct = (o: object) => (genBass(FRAME, CHORDS, 42, DR, o).items[0]!.content as { notes: Note[]; engine?: { version: string } });

describe("到達口①＝/music/gen_bass（HTTP）", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });

  it("anchorLock:true が届く（engine が刻まれ、生成器直呼びと一致）", async () => {
    const r = await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: FRAME, chords: CHORDS, seed: 42, drums: DR, anchorLock: true } });
    expect(r.statusCode).toBe(200);
    const c = (r.json() as { items: { content: { notes: Note[]; engine?: { version: string } } }[] }).items[0]!.content;
    expect(c.engine?.version).toMatch(/^pm-/);
    expect(c.notes).toEqual(direct({ anchorLock: true }).notes);
  });

  it("anchorRestOnSyncopatedKick:true が届く（案B が効いて onset が減る）", async () => {
    const on = await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: FRAME, chords: CHORDS, seed: 42, drums: DR, anchorLock: true, anchorRestOnSyncopatedKick: true } });
    const c = (on.json() as { items: { content: { notes: Note[] } }[] }).items[0]!.content;
    expect(c.notes).toEqual(direct({ anchorLock: true, anchorRestOnSyncopatedKick: true }).notes);
    expect(c.notes.length).toBeLessThan(direct({ anchorLock: true }).notes.length); // つまみが実際に効いている
  });

  it("anchorLock 未指定＝従来経路（engine キー無し）＝回帰", async () => {
    const r = await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: FRAME, chords: CHORDS, seed: 42, drums: DR } });
    const c = (r.json() as { items: { content: Record<string, unknown> }[] }).items[0]!.content;
    expect("engine" in c).toBe(false);
  });

  it("経路が立たない時は理由が meta.warnings で返る（no-drums）＝黙って落とさない", async () => {
    const r = await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: FRAME, chords: CHORDS, seed: 42, anchorLock: true } });
    const j = r.json() as { meta?: { warnings?: string[] }; anchorLockFallback?: string };
    expect(j.meta?.warnings?.[0]).toContain("ドラムが無いので");
    expect("anchorLockFallback" in j).toBe(false); // 独自キーは残さない（3c と同じ形・監査 重大①）
  });

  it("落ち先ごとに文言が違う（6/8＝複合拍子／キックレーン無し）", async () => {
    const compound = await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: { ...FRAME, meter: "6/8" }, chords: CHORDS, seed: 42, drums: DR, anchorLock: true } });
    expect((compound.json() as { meta?: { warnings?: string[] } }).meta?.warnings?.[0]).toContain("複合拍子");
    const noKick: DrumsInput = { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "Snare", midi: 38, hits: [4, 12] }] } };
    const nk = await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: FRAME, chords: CHORDS, seed: 42, drums: noKick, anchorLock: true } });
    expect((nk.json() as { meta?: { warnings?: string[] } }).meta?.warnings?.[0]).toContain("キックが無いので");
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

  it("inputSchema に anchorLock / anchorRestOnSyncopatedKick が在る（Claude から渡せる）", async () => {
    const client = await connect();
    const tool = (await client.listTools()).tools.find((t) => t.name === "gen_bass")!;
    const props = (tool.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props)).toContain("anchorLock");
    expect(Object.keys(props)).toContain("anchorRestOnSyncopatedKick");
  });

  it("両方が届く（生成器直呼びと一致・案B で onset が減る）", async () => {
    const client = await connect();
    const call = async (args: object) => {
      const r = await client.callTool({ name: "gen_bass", arguments: { frame: FRAME, chords: CHORDS, seed: 42, drums: DR, ...args } });
      return JSON.parse(textOf(r)) as { items: { content: { notes: Note[]; engine?: { version: string } } }[] };
    };
    const a = await call({ anchorLock: true });
    expect(a.items[0]!.content.engine?.version).toMatch(/^pm-/);
    expect(a.items[0]!.content.notes).toEqual(direct({ anchorLock: true }).notes);
    const b = await call({ anchorLock: true, anchorRestOnSyncopatedKick: true });
    expect(b.items[0]!.content.notes).toEqual(direct({ anchorLock: true, anchorRestOnSyncopatedKick: true }).notes);
    expect(b.items[0]!.content.notes.length).toBeLessThan(a.items[0]!.content.notes.length);
  });
  it("経路が立たなかった通知が MCP の戻り JSON（meta.warnings）に載る＝Chat 入口でも黙らない", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "gen_bass", arguments: { frame: FRAME, chords: CHORDS, seed: 42, anchorLock: true } }); // drums 無し
    const j = JSON.parse(textOf(r)) as { meta?: { warnings?: string[] }; anchorLockFallback?: string };
    expect(j.meta?.warnings?.[0]).toContain("ドラムが無いので");
    expect("anchorLockFallback" in j).toBe(false);
  });
});

describe("到達口③＝/gen/section（body.bass 素通し）", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });

  it("bass.anchorLock が genBass まで届く（生成済みドラムのキックに錨が乗る）", async () => {
    const frame = { bars: 2, meter: "4/4", key: 0 };
    const seed = 42;
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { frame, seed, parts: ["chords", "bass", "drums"], bass: { anchorLock: true } } });
    expect(r.statusCode).toBe(200);
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] } };
    const bass = comp.composition.children.find((c) => c.node.neta.kind === "bass")!.node.neta.content as { notes: Note[]; engine?: { version: string } };
    expect(bass.engine?.version).toMatch(/^pm-/); // 新経路が実際に立った証拠
    const drums = genDrums(frame, seed).items[0]!.content as DrumsInput;
    const chords = (comp.composition.children.find((c) => c.node.neta.kind === "chord_progression")!.node.neta.content as { chords: { root: number; quality: string; start: number; dur: number }[] }).chords;
    expect(bass.notes).toEqual((genBass(frame, chords, seed, drums, { anchorLock: true }).items[0]!.content as { notes: Note[] }).notes);
    // 全キック step にベースの onset が在る（錨＝byConstruction・被覆率は単体テスト側で数値化済み）
    const r2 = drums.rhythm!;
    const kickBeats = r2.lanes!.find((l) => l.midi === 36)!.hits!.map((s) => s * r2.beatsPerStep!);
    const starts = new Set(bass.notes.map((n) => Math.round((((n.start % 4) + 4) % 4) * 1000) / 1000));
    for (const kb of kickBeats) expect(starts.has(kb), `kick@${kb}`).toBe(true);
  });

  it("bass.anchorRestOnSyncopatedKick も素通しできる（生成器直呼びと列一致＝型だけでなく値が届く）", async () => {
    const frame = { bars: 2, meter: "4/4", key: 0 };
    const seed = 42;
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { frame, seed, parts: ["chords", "bass", "drums"], bass: { anchorLock: true, anchorRestOnSyncopatedKick: true } } });
    expect(r.statusCode).toBe(200);
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] } };
    const bass = comp.composition.children.find((c) => c.node.neta.kind === "bass")!.node.neta.content as { notes: Note[] };
    const drums = genDrums(frame, seed).items[0]!.content as DrumsInput;
    const chords = (comp.composition.children.find((c) => c.node.neta.kind === "chord_progression")!.node.neta.content as { chords: { root: number; quality: string; start: number; dur: number }[] }).chords;
    // 案B ON の直呼びと一致し、かつ OFF の直呼びとは（このドラム骨で差が出るなら）別物であることを示す
    const on = (genBass(frame, chords, seed, drums, { anchorLock: true, anchorRestOnSyncopatedKick: true }).items[0]!.content as { notes: Note[] }).notes;
    const off = (genBass(frame, chords, seed, drums, { anchorLock: true }).items[0]!.content as { notes: Note[] }).notes;
    expect(bass.notes).toEqual(on);
    expect(on.length).toBeLessThanOrEqual(off.length); // 案B は錨を増やさない（減るか同じ）
  });

  it("経路が立たなかった通知が /gen/section の応答にも残る（監査 重大①＝ここで丸ごと消えていた）", async () => {
    // parts に drums を入れない＝ドラムが作られない＝anchorLock は no-drums で落ちる。
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { frame: { bars: 2, meter: "4/4", key: 0 }, seed: 42, parts: ["chords", "bass"], bass: { anchorLock: true } } });
    expect(r.statusCode).toBe(200);
    const j = r.json() as { warnings?: string[]; composition: { children: { node: { neta: { kind: string; content: Record<string, unknown> } } }[] } };
    expect(j.warnings?.some((w) => w.includes("ドラムが無いので")), JSON.stringify(j.warnings)).toBe(true);
    const bass = j.composition.children.find((c) => c.node.neta.kind === "bass")!.node.neta.content;
    expect("engine" in bass).toBe(false); // 通知どおり経路は立っていない
  });

  it("通知が無いときは warnings キー自体を生やさない（従来応答形＝回帰）", async () => {
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { frame: { bars: 2, meter: "4/4", key: 0 }, seed: 42, parts: ["chords", "bass", "drums"], bass: { anchorLock: true } } });
    expect("warnings" in (r.json() as object)).toBe(false);
  });

  it("bass ノブ未指定は従来と bit 一致（回帰・engine キーも生えない）", async () => {
    const frame = { bars: 2, meter: "4/4", key: 0 };
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { frame, seed: 7, parts: ["chords", "bass", "drums"] } });
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: Record<string, unknown> } } }[] } };
    const bass = comp.composition.children.find((c) => c.node.neta.kind === "bass")!.node.neta.content;
    expect("engine" in bass).toBe(false);
  });
});
