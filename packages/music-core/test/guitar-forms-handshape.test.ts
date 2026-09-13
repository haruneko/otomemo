// M5-5d フォーム DB の py-parity（4調弦×5フォーム）＋5e 手の形の枠の摂動テスト（§6-4 #9＝全ソルバ必須）。
// **撤退基準**＝摂動テストが落ちたら handshape 枠は凍結（計画 §5-2 M5）。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  GTR_FORMS, GAIN_SAFE_INTERVALS, GTR_FRET_SEARCH_MAX, GTR_PARK_FRETS, octaveCorr, tuningIntervals, validRootStrings, enumerateShapes,
  shapePitches, formGainOk,
} from "../src/guitarForms";
import { SHAPE_WEIGHTS_OTOMEMO, solveHandShapes, type ShapeWeights } from "../src/guitarHandshape";
import { realizeGuitarRiff } from "../src/guitarRealize";
import { buildGuitarSkeleton, GUITAR_GRAMMARS, gtrOnsetsToHits } from "../src/guitarRiff";
import { TUNING_GUITAR6, TUNING_BASS4, fretboardGate } from "../src/verify/fretboard";

const FORMS = JSON.parse(readFileSync(fileURLToPath(new URL("../../../tools/py-parity/cases-guitar/forms.json", import.meta.url)), "utf8")) as {
  gain_safe: number[]; fret_search_max: number; park_frets: number[];
  tunings: Record<string, { open_midi: number[]; intervals: number[]; octave_corr: (number | null)[]; forms: Record<string, { valid_root_strings: number[]; gain_ok: boolean; shapes: [number, number, number[]][] }> }>;
};

describe("5d フォーム DB が源流と一致（Tuning からの導出・B弦補正・GAIN_SAFE_INTERVALS）", () => {
  it("定数（GAIN_SAFE_INTERVALS・探索帯・待機フレット）", () => {
    expect([...GAIN_SAFE_INTERVALS].sort((a, b) => a - b)).toEqual(FORMS.gain_safe);
    expect(GTR_FRET_SEARCH_MAX).toBe(FORMS.fret_search_max);
    expect([...GTR_PARK_FRETS]).toEqual(FORMS.park_frets);
  });
  for (const [name, tf] of Object.entries(FORMS.tunings)) {
    it(`${name}（${tf.open_midi.length}弦）＝弦間隔・オクターブ補正・全フォームの成立弦と列挙が一致`, () => {
      const t = { openMidi: tf.open_midi };
      expect(tuningIntervals(t)).toEqual(tf.intervals);
      expect(tf.open_midi.map((_, s) => octaveCorr(t, s))).toEqual(tf.octave_corr);
      for (const form of GTR_FORMS) {
        const py = tf.forms[form]!;
        expect(validRootStrings(form, t), `${name}/${form}`).toEqual(py.valid_root_strings);
        expect(formGainOk(form)).toBe(py.gain_ok);
        expect(enumerateShapes(form, t).map((sh) => [sh.string, sh.fret, shapePitches(sh, t)]), `${name}/${form}`).toEqual(py.shapes);
      }
    });
  }
  it("B弦補正は標準調弦の G 弦・D 弦ルートでだけ +3（開放差9）", () => {
    expect(FORMS.tunings.standard!.octave_corr).toEqual([2, 2, 3, 3, null, null]);
  });
});

describe("指板ソルバが4弦・6弦で同じ DP（M5 Done）", () => {
  it("verify/fretboard の fretboardGate が同じ関数で両方を判定する（到達不能の陰性対照つき）", () => {
    expect(fretboardGate([40, 45, 52], TUNING_GUITAR6).pass).toBe(true);
    expect(fretboardGate([28, 33, 40], TUNING_BASS4).pass).toBe(true);
    expect(fretboardGate([39], TUNING_GUITAR6).pass).toBe(false);
    expect(fretboardGate([27], TUNING_BASS4).pass).toBe(false);
  });
});

// ── 5e 摂動テスト＝**重みだけ動かして出力が変わらなければバリデータ**（負の知識1） ──
const PROG = [{ root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 7, quality: "" }];
const hitsOf = (g: keyof typeof GUITAR_GRAMMARS) => gtrOnsetsToHits(buildGuitarSkeleton(GUITAR_GRAMMARS[g], 64));
const shapeRun = (g: keyof typeof GUITAR_GRAMMARS, w: ShapeWeights, seed = 1) =>
  realizeGuitarRiff(hitsOf(g), { chordAtStep: (s) => PROG[Math.floor(s / 16) % 4]!, tempo: 150, engine: "handshape", seed, weights: w });
const pitchesOf = (r: ReturnType<typeof shapeRun>) => r.notes.map((n) => `${n.start}:${n.pitch}`).join(",");

describe("5e handshape 枠＝摂動テスト（落ちたら凍結）", () => {
  const perturb: [string, Partial<ShapeWeights>][] = [
    ["openCredit を 0→3", { openCredit: 3 }],
    ["power3Pref を大きく", { power3Pref: 3 }],
    ["move を 0.1（横移動が安い）", { move: 0.1, formChange: 0 }],
    ["highFret を大きく", { highFret: 1 }],
  ];
  for (const g of ["power_chug", "pedal_answer", "gallop"] as const) {
    it(`${g}：各重みを振ると出力が変わる（少なくとも 3/4 の摂動で）`, () => {
      const baseline = pitchesOf(shapeRun(g, SHAPE_WEIGHTS_OTOMEMO));
      const changed = perturb.filter(([, p]) => pitchesOf(shapeRun(g, { ...SHAPE_WEIGHTS_OTOMEMO, ...p })) !== baseline).map(([n]) => n);
      expect(changed.length, `変わった摂動: ${changed.join(" / ")}`).toBeGreaterThanOrEqual(3);
    });
  }
  it("(m1) 重みを全部同じにすると仮置きの出力から変わる（ソルバが重みを読んでいる）", () => {
    const flat: ShapeWeights = { move: 1, string: 1, formChange: 1, openCredit: 1, power3Pref: 1, highFret: 1, degBias: 1 };
    let differs = 0;
    for (const g of ["power_chug", "pedal_answer", "gallop"] as const) if (pitchesOf(shapeRun(g, flat)) !== pitchesOf(shapeRun(g, SHAPE_WEIGHTS_OTOMEMO))) differs++;
    expect(differs).toBeGreaterThanOrEqual(1);
  });
  it("決定的＝同じ seed・重みで同じ出力／候補の無い層は 0（chordfollow へ落ちない進行）", () => {
    const a = shapeRun("power_chug", SHAPE_WEIGHTS_OTOMEMO, 7), b = shapeRun("power_chug", SHAPE_WEIGHTS_OTOMEMO, 7);
    expect(pitchesOf(a)).toBe(pitchesOf(b));
    expect(a.report.shape?.emptyLayers).toBe(0);
  });
  it("POWER3（3音形）が0件に潰れない（負の知識13＝節点コスト＋seed タイブレーク）", () => {
    const r = shapeRun("power_chug", SHAPE_WEIGHTS_OTOMEMO);
    const byStart = new Map<number, number>();
    for (const n of r.notes) byStart.set(n.start, (byStart.get(n.start) ?? 0) + 1);
    expect([...byStart.values()].filter((k) => k === 3).length).toBeGreaterThan(0);
  });
  it("移動時間ゲートは解ける範囲で効く（緩和ラダーの段が返る）", () => {
    const layers = [[{ form: "mono" as const, string: 0, fret: 1 }], [{ form: "mono" as const, string: 5, fret: 15 }]];
    const tight = solveHandShapes(layers, [0, 0.01], SHAPE_WEIGHTS_OTOMEMO, { shiftRate: 40, regrip: 0.04, stringLambda: 1 }, { seed: 0, tuning: TUNING_GUITAR6 });
    expect(tight.tier).toBe(2);
    const loose = solveHandShapes(layers, [0, 5], SHAPE_WEIGHTS_OTOMEMO, { shiftRate: 40, regrip: 0.04, stringLambda: 1 }, { seed: 0, tuning: TUNING_GUITAR6 });
    expect(loose.tier).toBe(0);
  });
});
