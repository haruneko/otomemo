// M6a-6a 鍵盤の隙間刺しの到達口と受け入れ（計画 §5-2 M6a）。
// **不変条件は到達口から実際に返る content に対して assert**（2026-09-10 監査の教訓）。
//   ①/music/gen_chord_pattern（HTTP）②MCP gen_chord_pattern ③/gen/section（body.chord.keyStab）④web（apps/web/test 側）
// oracle（§6-4 #2 自己参照禁止）＝刺す位置は生成器の keyStabSlots を使わず、ドラムの lanes から直接数える。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";
import { genChordPattern, type DrumsInput } from "../src/music/generate";

type Hit = { step: number; dur: number; vel?: number };
type KsContent = { mode: string; steps: number; hits: Hit[]; voicing: { top?: number }; keyStab?: { fallback?: true }; engine?: { version: string } };
type Res = { items: { content: KsContent; label?: string }[]; meta?: { warnings?: string[] } };

const FRAME = { bars: 4, meter: "4/4", key: 0, tempo: 120 };
const KICK = [0, 6, 10];
const SNARE = [4, 12];
const DR: DrumsInput = { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "Kick", midi: 36, hits: KICK }, { name: "Snare", midi: 38, hits: SNARE }, { name: "HiHat", midi: 42, hits: [0, 2, 4, 6, 8, 10, 12, 14] }] } };

/** oracle：ドラムの lanes から「刺すべき位置」（キック∪スネア − キック）を直接数える。 */
function oracleSlots(d: DrumsInput): { kick: number[]; want: number[] } {
  const lanes = d.rhythm!.lanes!;
  const scale = 16 / d.rhythm!.steps!;
  const kick = (lanes.find((l) => l.midi === 36)?.hits ?? []).map((k) => k * scale);
  const snare = (lanes.find((l) => l.midi === 38)?.hits ?? []).map((k) => k * scale);
  const want = [...new Set(snare)].filter((s) => !kick.includes(s)).sort((a, b) => a - b);
  return { kick, want: want.length ? want : [6, 14] };
}
/** 受け入れゲート（返った content に）：(I1) キックに重ならない (I2) 刺すべき位置の被覆率 (I3) 譜の外に刺さない。 */
function gates(c: KsContent, bars: number, d: DrumsInput) {
  const { kick, want } = oracleSlots(d);
  const onKick = c.hits.filter((h) => kick.includes(h.step % 16)).length;
  let covered = 0;
  for (let b = 0; b < bars; b++) for (const s of want) if (c.hits.some((h) => h.step === b * 16 + s)) covered++;
  const outside = c.hits.filter((h) => !want.includes(h.step % 16)).length;
  return { onKick, coverage: covered / (bars * want.length), outside, total: c.hits.length };
}

const post = async (app: FastifyInstance, payload: object) => (await app.inject({ method: "POST", url: "/music/gen_chord_pattern", payload })).json() as Res;

describe("既定の出音は 1bit も変えない（keyStab 未指定＝従来）", () => {
  it("keyStab undefined／false は従来と deepStrictEqual（素/型ID/ジャンル×variety/ギター型）", () => {
    for (const o of [{}, { pattern: "CP-SYNC16" }, { pattern: "rock", variety: 3 }, { guitarRiff: "power_chug", drums: DR }]) {
      expect(genChordPattern(FRAME, 3, { ...o, keyStab: undefined })).toStrictEqual(genChordPattern(FRAME, 3, o));
      expect(genChordPattern(FRAME, 3, { ...o, keyStab: false })).toStrictEqual(genChordPattern(FRAME, 3, o));
    }
    expect("keyStab" in genChordPattern(FRAME, 3).items[0]!.content).toBe(false);
  });
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });
  it("HTTP：drums を送っても keyStab が無ければ従来／/gen/section の body.chord 無しも従来", async () => {
    expect(await post(app, { frame: FRAME, seed: 3, drums: DR })).toStrictEqual(JSON.parse(JSON.stringify(genChordPattern(FRAME, 3))));
    expect(await post(app, { frame: FRAME, seed: 3, keyStab: false, drums: DR })).toStrictEqual(JSON.parse(JSON.stringify(genChordPattern(FRAME, 3))));
    const r = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: FRAME, seed: 11, parts: ["chord_pattern", "rhythm"] } })).json() as { composition: unknown; warnings?: string[] };
    expect(findKind(r.composition, "chord_pattern")).toStrictEqual(JSON.parse(JSON.stringify(genChordPattern(FRAME, 11, undefined).items[0]!.content)));
  });
});

function findKind(node: unknown, kind: string): unknown {
  if (!node || typeof node !== "object") return undefined;
  const o = node as { neta?: { kind?: string; content?: unknown }; node?: unknown; children?: unknown[] };
  if (o.neta?.kind === kind) return o.neta.content;
  for (const x of [o.node, ...(o.children ?? [])]) { const f = findKind(x, kind); if (f !== undefined) return f; }
  return undefined;
}

describe("到達口①＝/music/gen_chord_pattern（HTTP）＋受け入れゲートを返った content に", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });

  it("キック [0,6,10]・スネア [4,12]：直呼びと一致・engine・キック重なり0・被覆率1.0・譜の外0（ハットは譜に入れない）", async () => {
    const j = await post(app, { frame: FRAME, seed: 21, drums: DR, keyStab: true });
    const c = j.items[0]!.content;
    expect(c).toStrictEqual(JSON.parse(JSON.stringify(genChordPattern(FRAME, 21, { keyStab: true, drums: DR }).items[0]!.content)));
    expect(c.engine?.version).toMatch(/^pm-/);
    expect(c.mode).toBe("strum");
    expect(c.voicing.top).toBe(72);
    const g = gates(c, 4, DR);
    expect(g.total).toBe(8); // 空虚でない（4小節×2）
    expect(g.onKick).toBe(0);
    expect(g.coverage).toBe(1);
    expect(g.outside).toBe(0);
    expect(j.meta).toBeUndefined();
  });

  it("キックしか無い（スネア無し）＝2拍裏・4拍裏に刺し、落ち先を告げる", async () => {
    const onlyKick: DrumsInput = { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "Kick", midi: 36, hits: [0, 8] }] } };
    const j = await post(app, { frame: FRAME, seed: 21, drums: onlyKick, keyStab: true });
    const c = j.items[0]!.content;
    expect(c.keyStab).toEqual({ fallback: true });
    const g = gates(c, 4, onlyKick);
    expect(g.coverage).toBe(1);
    expect(g.outside).toBe(0);
    expect(j.meta?.warnings?.[0]).toContain("2拍裏と4拍裏");
  });

  it("8分刻みのドラム（steps=8）も16分格子へ写して刺す", async () => {
    const d8: DrumsInput = { rhythm: { steps: 8, bars: 1, beatsPerStep: 0.5, lanes: [{ name: "Kick", midi: 36, hits: [0, 3, 5] }, { name: "Snare", midi: 38, hits: [2, 6] }] } };
    const c = (await post(app, { frame: FRAME, seed: 2, drums: d8, keyStab: true })).items[0]!.content;
    const g = gates(c, 4, d8);
    expect(g.onKick + g.outside).toBe(0);
    expect(g.coverage).toBe(1);
  });

  it("変異検査（出力に注入）：各変異で落ちる不変条件が1つ以上", async () => {
    const c = (await post(app, { frame: FRAME, seed: 21, drums: DR, keyStab: true })).items[0]!.content;
    // (m1) 1つをキックの位置へずらす → キック重なりが出る
    const m1 = { ...c, hits: c.hits.map((h, i) => (i === 0 ? { ...h, step: h.step + 2 } : h)) }; // 4→6（キック）
    expect(gates(m1, 4, DR).onKick).toBeGreaterThan(0);
    // (m2) 刺しを1つ削る → 被覆率が 1 を割る
    expect(gates({ ...c, hits: c.hits.slice(1) }, 4, DR).coverage).toBeLessThan(1);
    // (m3) 8分裏（ハットだけの位置）へずらす → 譜の外が出る
    const m3 = { ...c, hits: c.hits.map((h, i) => (i === 1 ? { ...h, step: h.step + 2 } : h)) }; // 12→14
    expect(gates(m3, 4, DR).outside).toBeGreaterThan(0);
  });

  it("落ち先ごとに文言が違う（ドラム無し／6/8／1小節長の不一致／格子不一致／ギターが勝つ）・独自キーは生やさない", async () => {
    const w = async (p: object) => (await post(app, { frame: FRAME, seed: 1, ...p })).meta?.warnings ?? [];
    const noDrums = await w({ keyStab: true });
    expect(noDrums[0]).toContain("ドラムが無いので");
    const compound = await w({ frame: { ...FRAME, meter: "6/8" }, keyStab: true, drums: DR });
    expect(compound[0]).toContain("4/4 のみ");
    const barLen = await w({ keyStab: true, drums: { rhythm: { steps: 12, bars: 1, beatsPerStep: 0.25, lanes: [{ midi: 36, hits: [0] }, { midi: 38, hits: [4] }] } } });
    expect(barLen[0]).toContain("1小節の長さ");
    const grid = await w({ keyStab: true, drums: { rhythm: { steps: 12, bars: 1, beatsPerStep: 1 / 3, lanes: [{ midi: 36, hits: [0] }, { midi: 38, hits: [3] }] } } });
    expect(grid[0]).toContain("16分の格子");
    const gtr = await w({ keyStab: true, guitarRiff: "power_chug", drums: DR });
    expect(gtr[0]).toContain("ギターのリフ文法を選んでいるので");
    expect(new Set([noDrums[0], compound[0], barLen[0], grid[0], gtr[0]]).size).toBe(5);
    // 落ちた時は従来の content（keyStab キーも engine も無い）
    const fell = (await post(app, { frame: FRAME, seed: 1, keyStab: true })).items[0]!.content;
    expect("keyStab" in fell || "engine" in fell).toBe(false);
    const j = await post(app, { frame: FRAME, seed: 1, keyStab: true }) as Record<string, unknown>;
    expect(Object.keys(j).sort()).toEqual(["edges", "items", "meta"]);
  });
});

describe("到達口②＝MCP gen_chord_pattern", () => {
  async function client() {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const cl = new Client({ name: "t", version: "0" });
    await cl.connect(ct);
    return cl;
  }
  it("inputSchema に keyStab が在り、callTool で drums が届いて刺さる（直呼びと一致）", async () => {
    const cl = await client();
    const tool = (await cl.listTools()).tools.find((t) => t.name === "gen_chord_pattern")!;
    expect((tool.inputSchema as { properties: Record<string, unknown> }).properties.keyStab).toBeDefined();
    const r = await cl.callTool({ name: "gen_chord_pattern", arguments: { frame: FRAME, seed: 21, drums: DR, keyStab: true } });
    const j = JSON.parse((r.content as { text: string }[])[0]!.text) as Res;
    const c = j.items[0]!.content;
    expect(c).toStrictEqual(JSON.parse(JSON.stringify(genChordPattern(FRAME, 21, { keyStab: true, drums: DR }).items[0]!.content)));
    const g = gates(c, 4, DR);
    expect(g.coverage === 1 && g.onKick === 0 && g.outside === 0).toBe(true);
  });
});

describe("到達口③＝/gen/section（body.chord.keyStab）", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });
  it("生成済みドラムのキックを避けて刺す・返った content にゲート・engine", async () => {
    const r = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: FRAME, seed: 11, parts: ["chord_progression", "chord_pattern", "rhythm"], chord: { keyStab: true } } })).json() as { composition: unknown; warnings?: string[] };
    const cp = findKind(r.composition, "chord_pattern") as KsContent;
    const drums = findKind(r.composition, "rhythm") as DrumsInput;
    expect(cp.engine?.version).toMatch(/^pm-/);
    expect("keyStab" in cp).toBe(true);
    const g = gates(cp, 4, drums);
    expect(g.total).toBeGreaterThan(0);
    expect(g.onKick === 0 || cp.keyStab?.fallback === true).toBe(true);
    expect(g.coverage).toBe(1);
    expect(g.outside).toBe(0);
  });
  it("ドラムを作らない時は落ちた理由が warnings に素通しされる", async () => {
    const r = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: FRAME, seed: 11, parts: ["chord_pattern"], chord: { keyStab: true } } })).json() as { warnings?: string[] };
    expect(r.warnings?.[0]).toContain("ドラムが無いので");
  });
});
