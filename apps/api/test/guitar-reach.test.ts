// M5 ギター型の到達口と受け入れ（計画 §5-2 M5）。
// **不変条件は純関数の出口でなく、到達口から実際に返る content に対して assert する**（2026-09-10 監査の教訓）。
//   ①`/music/gen_chord_pattern`（HTTP）②MCP `gen_chord_pattern`（**進行と drums を受けられるか**＝R1 の穴）
//   ③`/gen/section`（body.chord）④web（apps/web/test 側）
// oracle（§6-4 #2 自己参照禁止）＝コードトーン/スケールは生成器の表でなく phrase_maker の py-parity ダンプ
//   `tools/py-parity/cases-guitar/chordtheory.json` から引く。
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { realizeGuitarRiff, fretboardGate, pcMembershipGate, allowedPcFraction, assertCoverage, TUNING_GUITAR6, type GtrRealizeHit } from "@cm/music-core";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";
import { genChordPattern, type DrumsInput } from "../src/music/generate";

type Chord = { root: number; quality: string; start: number; dur: number; bass?: number };
type Hit = GtrRealizeHit & { riff: { anchor: boolean; kind: string } };
type GtrContent = { mode: string; steps: number; hits: Hit[]; guitarRiff?: { grammar: string; pitch: string; anchorLock?: true; seed?: number }; engine?: { version: string } };
type Res = { items: { content: GtrContent; label?: string }[]; meta?: { warnings?: string[] } };

const FRAME = { bars: 4, meter: "4/4", key: 9, tempo: 140 };
const CHORDS: Chord[] = [
  { root: 9, quality: "m", start: 0, dur: 4 }, { root: 5, quality: "", start: 4, dur: 4 },
  { root: 0, quality: "", start: 8, dur: 2 }, { root: 7, quality: "7", start: 10, dur: 2 }, { root: 11, quality: "dim", start: 12, dur: 4 },
];
const KICK = [0, 6, 10, 14];
const DR: DrumsInput = { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "Kick", midi: 36, hits: KICK }, { name: "Snare", midi: 38, hits: [4, 12] }] } };

// ── oracle（phrase_maker の表） ──
const PY = (JSON.parse(readFileSync(fileURLToPath(new URL("../../../tools/py-parity/cases-guitar/chordtheory.json", import.meta.url)), "utf8")) as { chords: { name: string; tone_pcs: number[]; scale_pcs: number[] }[] }).chords;
const PY_Q: Record<string, string> = { "": "C", m: "Cm", "7": "C7", dim: "Cdim", maj7: "Cmaj7", m7: "Cm7" };
function oracle(ch: Chord): { tones: Set<number>; scale: Set<number> } {
  const row = PY.find((r) => r.name === PY_Q[ch.quality])!;
  const sh = (xs: number[]) => new Set(xs.map((x) => (x + ch.root) % 12));
  return { tones: sh(row.tone_pcs), scale: sh(row.scale_pcs) };
}
const chordAtBeat = (beat: number): Chord => CHORDS.find((c) => c.start <= beat + 1e-9 && beat < c.start + c.dur - 1e-9) ?? CHORDS[CHORDS.length - 1]!;
const realize = (c: GtrContent, seed = 5) => realizeGuitarRiff(c.hits, {
  chordAtStep: (s) => chordAtBeat(s * 0.25), keyPc: 9, tempo: 140, engine: c.guitarRiff?.pitch === "handshape" ? "handshape" : "chordfollow", seed: c.guitarRiff?.seed ?? seed,
});

/** 受け入れのゲート一式（content → 実音 → gate）。 */
function gates(c: GtrContent, notesOverride?: { pitch: number; start: number }[]) {
  const notes = notesOverride ?? realize(c).notes;
  const strongCT = pcMembershipGate("strong_beat_chord_tone", notes, (e) => oracle(chordAtBeat(e.start)).tones, (e) => Math.abs(e.start - Math.round(e.start)) < 1e-9, "phrase_maker chordfollow.py:7-12 (strong beats land on a chord tone)");
  const scale = pcMembershipGate("non_integrated_zero", notes, (e) => oracle(chordAtBeat(e.start)).scale, () => true, "phrase_maker chordfollow.py:13-16 (weak beats take a chord-scale tone)");
  const fret = fretboardGate(notes.map((n) => n.pitch), TUNING_GUITAR6);
  return { strongCT, scale, fret, frac: allowedPcFraction(notes, (e) => oracle(chordAtBeat(e.start)).scale, "oracle") };
}
/** byConstruction＝全小節の全キック step に錨の POWER 形（被覆率）。 */
function anchorCoverage(c: GtrContent, bars: number, kick: number[]) {
  let applied = 0;
  const total = bars * kick.length;
  for (let b = 0; b < bars; b++) for (const k of kick) {
    const h = c.hits.find((x) => x.step === b * 16 + k);
    if (h && h.riff.anchor && h.voice !== "mono") applied++;
  }
  return { applied, total, frac: applied / total };
}

const post = async (app: FastifyInstance, payload: object) => (await app.inject({ method: "POST", url: "/music/gen_chord_pattern", payload })).json() as Res;

describe("既定の出音は 1bit も変えない（新キー未指定＝従来）", () => {
  it("新しい opts が全部 undefined でも従来と deepStrictEqual（pattern/ジャンル/素の3経路）", () => {
    const off = { guitarRiff: undefined, anchorLock: undefined, guitarShape: undefined, drums: undefined, chords: undefined };
    expect(genChordPattern(FRAME, 3, { ...off })).toStrictEqual(genChordPattern(FRAME, 3, {}));
    expect(genChordPattern(FRAME, 3, { pattern: "GT-POWER16", ...off })).toStrictEqual(genChordPattern(FRAME, 3, { pattern: "GT-POWER16" }));
    expect(genChordPattern(FRAME, 3, { pattern: "rock", variety: 3, ...off })).toStrictEqual(genChordPattern(FRAME, 3, { pattern: "rock", variety: 3 }));
    expect("meta" in genChordPattern(FRAME, 3)).toBe(false);
  });
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });
  it("HTTP：chords/drums を送っても guitarRiff 系が無ければ従来（chords は gen_chord_pattern の既定経路で読まれない）", async () => {
    expect(await post(app, { frame: FRAME, seed: 3, chords: CHORDS, drums: DR })).toStrictEqual(JSON.parse(JSON.stringify(genChordPattern(FRAME, 3))));
    expect(await post(app, { frame: FRAME, seed: 3, pattern: "GT-DOWN8" })).toStrictEqual(JSON.parse(JSON.stringify(genChordPattern(FRAME, 3, { pattern: "GT-DOWN8" }))));
  });
  it("/gen/section：body.chord 未指定の chord_pattern は従来の呼び出しと一致・warnings キーも生えない", async () => {
    const r = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: FRAME, seed: 11, parts: ["chord_pattern", "rhythm"] } })).json() as { composition: unknown; warnings?: string[] };
    const cp = findKind(r.composition, "chord_pattern") as GtrContent;
    expect(cp).toStrictEqual(JSON.parse(JSON.stringify(genChordPattern(FRAME, 11, undefined).items[0]!.content)));
    expect("guitarRiff" in cp).toBe(false);
    expect(r.warnings).toBeUndefined();
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

  for (const grammar of ["power_chug", "pedal_answer", "gallop"]) {
    for (const shape of [false, true]) {
      it(`${grammar}${shape ? "＋手の形" : ""}＋錨：直呼びと一致・engine・強拍CT/非整合0/指板 gate・錨の被覆率 1.0`, async () => {
        const payload = { frame: FRAME, seed: 21, chords: CHORDS, drums: DR, guitarRiff: grammar, anchorLock: true, ...(shape ? { guitarShape: true } : {}) };
        const j = await post(app, payload);
        const c = j.items[0]!.content;
        expect(c).toStrictEqual(JSON.parse(JSON.stringify(genChordPattern(FRAME, 21, { guitarRiff: grammar, anchorLock: true, guitarShape: shape || undefined, drums: DR, chords: CHORDS }).items[0]!.content)));
        expect(c.engine?.version).toMatch(/^pm-/);
        expect(c.guitarRiff).toMatchObject({ grammar, pitch: shape ? "handshape" : "chordfollow", anchorLock: true });
        expect(c.hits.every((h) => typeof h.voice === "string" && h.riff != null)).toBe(true);
        const g = gates(c);
        expect(g.strongCT.pass, g.strongCT.problems.join("\n")).toBe(true);
        expect(g.scale.pass, g.scale.problems.join("\n")).toBe(true);
        expect(g.fret.pass).toBe(true);
        assertCoverage(g.strongCT, 0.2); // 拍頭の音が一定割合ある＝空虚でない
        assertCoverage(g.scale, 1);
        expect(g.frac.value).toBeLessThan(0.75); // 許容 pc は 12 音の 3/4 未満（§6-4 #3）
        const cov = anchorCoverage(c, 4, KICK);
        expect(cov.frac).toBe(1);
        // MONO→POWER8 のヒット単位切替が実際に起きている（pedal_answer/gallop は全部 MONO の文法）
        if (grammar !== "power_chug") expect(c.hits.some((h) => h.voice === "power8") && c.hits.some((h) => h.voice === "mono")).toBe(true);
      });
    }
  }

  it("変異検査（出力に注入）：各変異で落ちる不変条件が1つ以上", async () => {
    const c = (await post(app, { frame: FRAME, seed: 21, chords: CHORDS, drums: DR, guitarRiff: "pedal_answer", anchorLock: true })).items[0]!.content;
    const notes = realize(c).notes;
    // (m2) 音高を1半音ずらす → 強拍CT か 非整合0 が落ちる
    const m2 = gates(c, notes.map((n) => ({ ...n, pitch: n.pitch + 1 })));
    expect(!m2.strongCT.pass || !m2.scale.pass).toBe(true);
    // (m4) 錨を1つ削る → 被覆率が 1 を割る
    const firstKick = c.hits.findIndex((h) => h.step === KICK[1]);
    const m4 = { ...c, hits: c.hits.filter((_, i) => i !== firstKick) };
    expect(anchorCoverage(m4, 4, KICK).frac).toBeLessThan(1);
    // (m4') 錨を MONO に戻す（ヒット単位ボイシングの消失）→ 被覆率が落ちる
    const m4b = { ...c, hits: c.hits.map((h) => (h.step === KICK[1] ? { ...h, voice: "mono" as const } : h)) };
    expect(anchorCoverage(m4b, 4, KICK).frac).toBeLessThan(1);
    // (m3 相当) 低すぎる音＝指板の外 → fretboardGate が落ちる
    expect(fretboardGate(notes.map((n, i) => (i === 0 ? n.pitch - 24 : n.pitch)), TUNING_GUITAR6).pass).toBe(false);
  });

  it("5f：落ち先ごとに文言が違う（ドラム無し／キック無し／6/8／知らない文法／文法なしのノブ／表に無いコード）", async () => {
    const w = async (p: object) => (await post(app, { frame: FRAME, seed: 1, ...p })).meta?.warnings ?? [];
    const noDrums = await w({ guitarRiff: "power_chug", anchorLock: true });
    expect(noDrums[0]).toContain("ドラムが無いので");
    const noKick = await w({ guitarRiff: "power_chug", anchorLock: true, drums: { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "Snare", midi: 38, hits: [4] }] } } });
    expect(noKick[0]).toContain("キックが無いので");
    const compound = await w({ frame: { ...FRAME, meter: "6/8" }, guitarRiff: "gallop" });
    expect(compound[0]).toContain("4/4 のみ");
    const unknown = await w({ guitarRiff: "djent" });
    expect(unknown[0]).toContain("知らないギターのリフ文法");
    const knobOnly = await w({ anchorLock: true, drums: DR });
    expect(knobOnly[0]).toContain("リフ文法を選んだ時だけ");
    const layerB = await w({ guitarRiff: "pedal_answer", chords: [{ root: 0, quality: "maj9", start: 0, dur: 16 }] });
    expect(layerB.some((x) => x.includes("maj9") && x.includes("教科書スケール"))).toBe(true);
    expect(new Set([noDrums[0], noKick[0], compound[0], unknown[0], knobOnly[0]]).size).toBe(5);
    // 独自キーは生やさない（通知は meta.warnings だけ）
    const j = await post(app, { frame: FRAME, seed: 1, guitarRiff: "power_chug", anchorLock: true }) as Record<string, unknown>;
    expect(Object.keys(j).sort()).toEqual(["edges", "items", "meta"]);
  });
});

describe("到達口②＝MCP gen_chord_pattern（R1 の穴＝進行とドラムを受けられるか）", () => {
  async function client() {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const cl = new Client({ name: "t", version: "0" });
    await cl.connect(ct);
    return cl;
  }
  it("inputSchema に chords・drums・guitarRiff（辞書由来の enum）・anchorLock・guitarShape が在る", async () => {
    const cl = await client();
    const tool = (await cl.listTools()).tools.find((t) => t.name === "gen_chord_pattern")!;
    const props = (tool.inputSchema as { properties: Record<string, { enum?: string[] }> }).properties;
    for (const k of ["chords", "drums", "guitarRiff", "anchorLock", "guitarShape"]) expect(props[k], k).toBeDefined();
    expect(props.guitarRiff!.enum).toEqual(["power_chug", "pedal_answer", "gallop"]);
  });
  it("callTool で進行とドラムが実際に届く（直呼びと一致・進行の中身が通知に効く＝渡したつもりで捨てられていない）", async () => {
    const cl = await client();
    const r = await cl.callTool({ name: "gen_chord_pattern", arguments: { frame: FRAME, seed: 21, chords: CHORDS, drums: DR, guitarRiff: "gallop", anchorLock: true } });
    const j = JSON.parse((r.content as { text: string }[])[0]!.text) as Res;
    expect(j.items[0]!.content).toStrictEqual(JSON.parse(JSON.stringify(genChordPattern(FRAME, 21, { guitarRiff: "gallop", anchorLock: true, drums: DR, chords: CHORDS }).items[0]!.content)));
    expect(anchorCoverage(j.items[0]!.content, 4, KICK).frac).toBe(1); // drums が届いた証拠（キック [0,6,10,14] に錨）
    const g = gates(j.items[0]!.content);
    expect(g.strongCT.pass && g.scale.pass && g.fret.pass).toBe(true);
    const r2 = await cl.callTool({ name: "gen_chord_pattern", arguments: { frame: FRAME, seed: 21, chords: [{ root: 0, quality: "maj9", start: 0, dur: 16 }], guitarRiff: "gallop" } });
    const j2 = JSON.parse((r2.content as { text: string }[])[0]!.text) as Res;
    expect(j2.meta?.warnings?.some((x) => x.includes("maj9"))).toBe(true); // chords が届いた証拠
  });
});

describe("到達口③＝/gen/section（body.chord）", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });
  it("生成済みドラムのキック全部に錨・返った content に受け入れゲート・engine が刻まれる", async () => {
    const r = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: FRAME, seed: 11, parts: ["chord_progression", "chord_pattern", "rhythm"], chord: { guitarRiff: "power_chug", anchorLock: true } } })).json() as { composition: unknown; warnings?: string[] };
    const cp = findKind(r.composition, "chord_pattern") as GtrContent;
    const drums = findKind(r.composition, "rhythm") as DrumsInput;
    const prog = (findKind(r.composition, "chord_progression") as { chords: Chord[] }).chords;
    expect(cp.guitarRiff).toMatchObject({ grammar: "power_chug", anchorLock: true });
    expect(cp.engine?.version).toMatch(/^pm-/);
    const lanes = drums.rhythm!.lanes!;
    const kick = lanes.find((l) => l.midi === 36)!.hits!;
    const scale = 16 / drums.rhythm!.steps!;
    expect(anchorCoverage(cp, 4, kick.map((k) => k * scale)).frac).toBe(1);
    // セクションの進行に当てた実音でも指板 gate（この進行は oracle 表に無いクオリティを含み得るので pc ゲートは①②で見る）
    const notes = realizeGuitarRiff(cp.hits, { chordAtStep: (s) => prog.find((c) => c.start <= s * 0.25 && s * 0.25 < c.start + c.dur) ?? prog[prog.length - 1]!, tempo: 140 }).notes;
    expect(fretboardGate(notes.map((n) => n.pitch), TUNING_GUITAR6).pass).toBe(true);
    expect(notes.length).toBeGreaterThan(0);
  });
  it("落ちた理由は /gen/section の warnings に素通しされる", async () => {
    const r = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: FRAME, seed: 11, parts: ["chord_pattern"], chord: { guitarRiff: "power_chug", anchorLock: true } } })).json() as { warnings?: string[] };
    expect(r.warnings?.[0]).toContain("ドラムが無いので");
  });
});
