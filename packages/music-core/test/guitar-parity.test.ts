// py-parity（M5）＝ギター chordtheory／chordfollow（build_skeleton・assign_pitches）／chug ロックのデータ一致。
// 参照値＝`tools/py-parity/cases-guitar/*.json`（`tools/py-parity/run_dump_guitar.sh` が焼く・コミット済み）。
// 計画 §6-1＝3箇所とも RNG 0件＝列で突き合わせられる。
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  GUITAR_GRAMMARS, buildGuitarSkeleton, lockGuitarChugToSheet, assignGuitarPitches, gtrChordOf,
  GTR_VOICE_OFFSETS, type GuitarGrammarId, type GtrChord,
} from "../src/guitarRiff";

const DIR = fileURLToPath(new URL("../../../tools/py-parity/cases-guitar/", import.meta.url));

type PyChord = { name: string; root_pc: number; quality: string; tone_pcs: number[]; scale_pcs: number[]; perfect_fifth: boolean; bass_pc: number; pedal_pc: number };
type PyRow = { step: number; kind: string; anchor: boolean; role: string; deg: number; voicing: number[]; strong: boolean; chord_idx: number; start: number; dur: number; pitch: number; voic: number[] };
type PyCase = {
  case: { id: string; grammar: GuitarGrammarId; progression: string; beats_per_chord: number; kick: number[] | null; accents: number[] | null };
  input: { tempo: number; palm_gate: number; total_steps: number; steps_per_chord: number; n_bars: number; step_dur: number; chords: PyChord[] };
  expected: PyRow[];
};

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 源流の記号（"Am" "C/G" "Bbmaj7"）を otomemo の (root, quality, bass) へ。ここは記号の割り方だけ＝表は引かない。 */
function splitSym(sym: string): { root: number; quality: string; bass: number | null } {
  const [head, bassTok] = sym.split("/") as [string, string | undefined];
  const pc = (tok: string): [number, string] => {
    let p = NOTE[tok[0]!.toUpperCase()]!;
    let rest = tok.slice(1);
    if (rest[0] === "#") { p++; rest = rest.slice(1); } else if (rest[0] === "b") { p--; rest = rest.slice(1); }
    return [((p % 12) + 12) % 12, rest];
  };
  const [root, quality] = pc(head);
  return { root, quality, bass: bassTok ? pc(bassTok)[0] : null };
}
const sorted = (s: ReadonlySet<number>): number[] => [...s].sort((a, b) => a - b);

function caseIds(): string[] {
  return readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json" && f !== "chordtheory.json").map((f) => f.slice(0, -5)).sort();
}
const load = (id: string): PyCase => JSON.parse(readFileSync(DIR + id + ".json", "utf8")) as PyCase;

function run(pc: PyCase) {
  const g = GUITAR_GRAMMARS[pc.case.grammar];
  expect(g.palmGate).toBe(pc.input.palm_gate);
  let onsets = buildGuitarSkeleton(g, pc.input.total_steps);
  if (pc.case.kick != null) {
    onsets = lockGuitarChugToSheet(onsets, { totalSteps: pc.input.total_steps, kick: pc.case.kick, accents: pc.case.accents ?? [], palmGate: g.palmGate }).onsets;
  }
  const chords: GtrChord[] = pc.input.chords.map((ch) => { const s = splitSym(ch.name); return gtrChordOf(s.root, s.quality, s.bass); });
  const spc = pc.input.steps_per_chord;
  const chordAt = (step: number) => chords[Math.min(Math.floor(step / spc), chords.length - 1)]!;
  const { pitches, voicings } = assignGuitarPitches(onsets, chordAt);
  return { onsets, pitches, voicings, stepDur: pc.input.step_dur };
}

describe("py-parity スモーク（M5＝ここが動かないとギターの受け入れが実行できない）", () => {
  it("power_chug × Am F C G × 4つ打ちキック＋アクセント が Python と列一致", () => {
    const pc = load("power_chug__amfcg__k4acc");
    const r = run(pc);
    expect(r.onsets.map((o) => o.step)).toEqual(pc.expected.map((e) => e.step));
    expect(r.pitches).toEqual(pc.expected.map((e) => e.pitch));
  });
});

describe("py-parity ケース表（grammar 3型 × 進行5本 × キック6種＝90件）", () => {
  const ids = caseIds();
  it("ケース表がコミットされている（90件）", () => { expect(ids.length).toBe(90); });
  for (const id of ids) {
    it(`一致：${id}`, () => {
      const pc = load(id);
      const r = run(pc);
      const got = r.onsets.map((o, i) => ({
        step: o.step, kind: o.kind, anchor: o.anchor, role: o.role, deg: o.deg, voicing: [...GTR_VOICE_OFFSETS[o.voicing]],
        strong: o.strong, pitch: r.pitches[i], voic: r.voicings[i],
      }));
      expect(got).toEqual(pc.expected.map((e) => ({ step: e.step, kind: e.kind, anchor: e.anchor, role: e.role, deg: e.deg, voicing: e.voicing, strong: e.strong, pitch: e.pitch, voic: e.voic })));
      // 音価（源流は秒＝max(0.05, gap×step秒×gate×palm)）＝演算順の差だけ許す
      r.onsets.forEach((o, i) => {
        expect(Math.max(0.05, o.durSteps * r.stepDur)).toBeCloseTo(pc.expected[i]!.dur, 9);
        expect(o.step * r.stepDur).toBeCloseTo(pc.expected[i]!.start, 9);
      });
    });
  }
});

describe("chordtheory 表が源流と一致（全32クオリティ×3ルート＋分数）", () => {
  const table = (JSON.parse(readFileSync(DIR + "chordtheory.json", "utf8")) as { chords: PyChord[] }).chords;
  it("tone_pcs / scale_pcs / perfect_fifth / pedal_pc が全件一致・ギター表から外れた物は無い", () => {
    expect(table.length).toBeGreaterThanOrEqual(96);
    for (const py of table) {
      const s = splitSym(py.name);
      const mine = gtrChordOf(s.root, s.quality, s.bass);
      expect({ name: py.name, tone: sorted(mine.tonePcs), scale: sorted(mine.scalePcs), p5: mine.perfectFifth, pedal: mine.pedalPc, fb: mine.fallback })
        .toEqual({ name: py.name, tone: py.tone_pcs, scale: py.scale_pcs, p5: py.perfect_fifth, pedal: py.pedal_pc, fb: null });
    }
  });
});
