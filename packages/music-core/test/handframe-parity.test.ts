// ピアノ伴奏（phrase_maker 試作 #1 取り込み S2）＝生成器本体 handFrame.ts の Python 一致（設計書 §5 S2）。
// 参照値＝tools/py-parity/cases-handframe/（tools/py-parity/run_dump_handframe.sh が焼く）。
// ここでの一致は「耳で合格した音を運べた証明」＝診断であって進捗ではない（進捗は耳A）。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateHandFrame, pyCompare, type HandFrameBar, type HandFrameOptions } from "../src/handFrame";
import { phraseSpec, type PhraseSpec } from "../src/phraseArc";

type Case = {
  name: string;
  input: {
    toks: string[]; onsets: number[]; seed: number; accent: number[] | null; arc: Record<string, unknown> | null;
    vds: { rh: number[]; allowed: number[]; deg: Record<string, number>; voicing: number[] | null }[];
    kw: Record<string, unknown>;
  };
  out: { notes: unknown[]; orn: unknown[]; diag: Record<string, unknown> };
};
type Bar = HandFrameBar & { voicing: number[] | null };

const dir = new URL("../../../tools/py-parity/cases-handframe/", import.meta.url);
const meta = JSON.parse(readFileSync(fileURLToPath(new URL("meta.json", dir)), "utf8")) as { cases: string[] };
const loadCase = (n: string): Case => JSON.parse(readFileSync(fileURLToPath(new URL(`${n}.json`, dir)), "utf8"));

const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

function toArgs(c: Case): { toks: string[]; vds: Bar[]; onsets: number[]; seed: number; opts: HandFrameOptions<Bar> } {
  const vds: Bar[] = c.input.vds.map((v) => ({ rh: v.rh, allowed: new Set(v.allowed), deg: v.deg, voicing: v.voicing }));
  const opts: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c.input.kw)) {
    if (k === "colour_allowed" || k === "structure_slots") opts[camel(k)] = v == null ? null : (v as number[][]).map((s) => new Set(s));
    else opts[camel(k)] = v;
  }
  if (vds.some((v) => v.voicing != null)) opts.voicingFn = (vd: Bar) => vd.voicing!;
  const acc = c.input.accent;
  if (acc) opts.accentTable = (slot: number) => acc[slot]!;
  if (c.input.arc) {
    const a = c.input.arc;
    opts.arc = phraseSpec(Object.fromEntries(Object.entries(a).map(([k, v]) => [camel(k), v])) as Partial<PhraseSpec>);
  }
  return { toks: c.input.toks, vds, onsets: c.input.onsets, seed: c.input.seed, opts: opts as unknown as HandFrameOptions<Bar> };
}

const run = (c: Case) => {
  const a = toArgs(c);
  return generateHandFrame(a.toks, a.vds, { onsets: a.onsets }, a.seed, a.opts);
};
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("S2 生成器本体＝Python generate_handframe と bit 一致", () => {
  for (const name of meta.cases) {
    const c = loadCase(name);
    it(`${name}: notes（pitch/start/end/vel/hand/bar）`, () => {
      expect(plain(run(c).notes)).toEqual(c.out.notes);
    });
    it(`${name}: orn と diag（打点の記録・候補の選ばれ方の集計）`, () => {
      const r = plain(run(c));
      expect(r.orn).toEqual(c.out.orn);
      const { events, slot_log, ...rest } = r.diag as Record<string, unknown>;
      const { events: pe, slot_log: ps, ...prest } = c.out.diag;
      expect(events).toEqual(pe);
      expect(slot_log).toEqual(ps);
      expect(rest).toEqual(prest);
    });
  }
});

describe("S2 被覆（一致が空虚でない）", () => {
  it("ケースが既定構成・バンドの右手/左手・つまみ・弧を含み、各ケースに音がある", () => {
    for (const k of ["default_", "band_half_mid_R", "band_half_mid_L", "band_bar_mid_R", "knob_", "band_bar_arc_reg_R"]) {
      expect(meta.cases.some((n) => n.startsWith(k))).toBe(true);
    }
    for (const n of meta.cases) expect(loadCase(n).out.notes.length).toBeGreaterThan(10);
  });
});

describe("pyCompare＝Python のタプル比較", () => {
  it("数・文字列・入れ子・長さ", () => {
    expect(pyCompare([1, ["FIRE", 2, 60, "stab"]], [1, ["FIRE", 2, 60, "till_next"]])).toBeLessThan(0);
    expect(pyCompare([0.5, ["DYAD", 2, [60, 64]]], [0.5, ["DYAD", 2, [60, 63]]])).toBeGreaterThan(0);
    expect(pyCompare(["A", 1], ["A", 1, 0])).toBeLessThan(0);
    expect(pyCompare(["GRABp"], ["FIRE"])).toBeGreaterThan(0);
    expect(() => pyCompare(["x", 1], ["x", "y"])).toThrow(TypeError);
  });
});

describe("S2 (ii) 基準音 F-A／F-C（S0 の fixture）と音列が一致", () => {
  // 音量は S3（バンド包み）の音量の輪郭で変わるので、ここは音高・始まり・終わり・手・区間だけ。
  type RefNote = { pitch: number; start: number; end: number; hand: string; cell: number };
  const ref = (f: string) => (JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/handframe/${f}`, import.meta.url)), "utf8")) as { notes: RefNote[] }).notes;
  const key = (n: [number, number, number, string, number]) => n.join("|");
  for (const [fx, cases] of [["reference_half_mid.json", ["band_half_mid_R", "band_half_mid_L"]], ["reference_bar_rounded_mid.json", ["band_bar_mid_R", "band_bar_mid_L"]]] as const) {
    it(`${fx}：右手＋左手の全音`, () => {
      const ours = cases.flatMap((n) => run(loadCase(n)).notes.map(([p, s, e, , h, b]) => key([p, s, e, h, b]))).sort();
      const theirs = ref(fx).map((n) => key([n.pitch, n.start, n.end, n.hand, n.cell])).sort();
      expect(ours.length).toBe(theirs.length);
      expect(ours).toEqual(theirs);
    });
  }
});

describe("S2 (iii) 種の決定論", () => {
  it("同じ種＝同じ出力・種を変えると出力が変わる", () => {
    const c = loadCase("band_half_mid_R");
    const a = toArgs(c);
    const once = () => plain(generateHandFrame(a.toks, a.vds, { onsets: a.onsets }, 1234, a.opts));
    expect(once()).toEqual(once());
    const other = plain(generateHandFrame(a.toks, a.vds, { onsets: a.onsets }, 1235, a.opts));
    expect(other.notes).not.toEqual(once().notes);
  });
  it("種は 32bit の非負整数だけ受ける", () => {
    const a = toArgs(loadCase("default_bar_s1"));
    for (const bad of [-1, 2 ** 32, 1.5]) expect(() => generateHandFrame(a.toks, a.vds, { onsets: a.onsets }, bad, a.opts)).toThrow(RangeError);
  });
});

describe("S2 (iv) 弧の分岐＝係数を全部 0 にすると、弧を渡さないときと1ビットも変わらない", () => {
  for (const n of ["band_half_mid_R", "band_bar_mid_R", "band_jazz_mid_R"]) {
    it(n, () => {
      const a = toArgs(loadCase(n));
      const off = plain(generateHandFrame(a.toks, a.vds, { onsets: a.onsets }, a.seed, { ...a.opts, arc: null }));
      const zero = plain(generateHandFrame(a.toks, a.vds, { onsets: a.onsets }, a.seed, {
        ...a.opts, arc: phraseSpec({ kLambdaSkip: 0, kDyad: 0, kGrabw: 0, kMotif: 0, kReg: 0 }),
      }));
      expect(zero).toEqual(off);
    });
  }
});
