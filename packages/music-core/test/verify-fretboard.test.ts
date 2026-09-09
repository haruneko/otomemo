// 指板検証（M3-3e）＝ギター gen2 の自前 DP を一般化した検証器を、M4 の枠組み（gate/byConstruction/diagnostic）で受ける。
//
//   gate       ＝到達不能な音 0（`fretboardGate`）
//   diagnostic ＝運指コスト・ポジション移動・開放弦率（**合否を持たない**＝弾きにくさの可否は耳と手）
//   変異検査   ＝指板の外の音を注入したらゲートが落ちる／調弦を変えたら判定が変わる
//   被覆率     ＝判定した音数（0 なら空虚）
//
// 数値の出所（§6-4 #11）＝`Tuning.source` に源流のファイル:行を持たせてある。
import { describe, it, expect } from "vitest";
import {
  TUNING_BASS4, TUNING_GUITAR6, TUNING_BASS5, pitchStates, isPlayableOn, statesForPitchClass,
  transitionCost, solveFingering, fretboardGate, fretboardStrain,
  assertGate, assertCoverage, GateFailure,
} from "../src/verify/index";
import { buildWalkingLine, type WalkSegment } from "../src/walkingBass";

describe("調弦のモデル（源流 fretboard.py の一般化＝弦数・調弦・重みだけが違い DP は共通）", () => {
  it("4弦ベース＝E1..G2・17フレット＝鳴らせるのは 28..60", () => {
    expect(TUNING_BASS4.openMidi).toEqual([28, 33, 38, 43]);
    expect(isPlayableOn(27, TUNING_BASS4)).toBe(false);
    expect(isPlayableOn(28, TUNING_BASS4)).toBe(true);
    expect(isPlayableOn(60, TUNING_BASS4)).toBe(true);   // 43+17
    expect(isPlayableOn(61, TUNING_BASS4)).toBe(false);
  });

  it("6弦ギター＝E2..E4・22フレット＝鳴らせるのは 40..86", () => {
    expect(TUNING_GUITAR6.openMidi).toEqual([40, 45, 50, 55, 59, 64]);
    expect(isPlayableOn(39, TUNING_GUITAR6)).toBe(false);
    expect(isPlayableOn(86, TUNING_GUITAR6)).toBe(true);
    expect(isPlayableOn(87, TUNING_GUITAR6)).toBe(false);
  });

  it("同じ音は複数の弦で鳴る（1対多の逆写像＝ユニゾンの冗長性）", () => {
    expect(pitchStates(43, TUNING_BASS4)).toEqual([{ string: 0, fret: 15 }, { string: 1, fret: 10 }, { string: 2, fret: 5 }, { string: 3, fret: 0 }]);
    expect(pitchStates(64, TUNING_GUITAR6).length).toBeGreaterThan(3);
  });

  it("**負数の `%` の罠**＝pc で引く口は ((a%n)+n)%n を経由する（Python の剰余と揃える）", () => {
    const a = statesForPitchClass(4, TUNING_BASS4);     // E
    const b = statesForPitchClass(-8, TUNING_BASS4);    // -8 ≡ 4 (mod 12)：JS の素の % なら -8
    expect(b).toEqual(a);
    expect(a[0]).toEqual({ string: 0, fret: 0 });       // 開放 E
    expect(statesForPitchClass(-1, TUNING_GUITAR6)).toEqual(statesForPitchClass(11, TUNING_GUITAR6));
  });

  it("弦数を増やしても同じ DP が動く（5弦ベース＝源流に無い調弦での一般化の実演）", () => {
    expect(isPlayableOn(23, TUNING_BASS5)).toBe(true);  // B0
    expect(isPlayableOn(22, TUNING_BASS5)).toBe(false);
    const sol = solveFingering([23, 26, 28, 31], TUNING_BASS5);
    expect(sol.unreachable).toEqual([]);
    expect(sol.states.every((s) => s !== null)).toBe(true);
  });
});

describe("押さえ替えのコスト（源流 transition_cost・楽器ごとの重みを混ぜない）", () => {
  it("ベースとギターで重みが違う（弦またぎ 1.4 / 1.2・ポジション移動の閾値 4 / 5）", () => {
    // 弦を1本またぐだけ（同フレット・fret>0）：ベース 1.4+0.05*f+0.1／ギター 1.2+0.04*f+0.1
    const a = { string: 0, fret: 5 }, b = { string: 1, fret: 5 };
    expect(transitionCost(a, b, TUNING_BASS4)).toBeCloseTo(1.4 + 0.25 + 0.1, 6);
    expect(transitionCost(a, b, TUNING_GUITAR6)).toBeCloseTo(1.2 + 0.2 + 0.1, 6);
    // フレット差 4：ベースは「ポジション移動」だがギターはまだ違う
    const c = { string: 0, fret: 1 }, d = { string: 0, fret: 5 };
    expect(transitionCost(c, d, TUNING_BASS4)).toBeGreaterThan(transitionCost(c, d, TUNING_GUITAR6));
  });

  it("開放弦は安く、高いポジションはわずかに高い（源流の割引/罰）", () => {
    const from = { string: 0, fret: 0 };
    expect(transitionCost(from, { string: 0, fret: 0 }, TUNING_GUITAR6)).toBeLessThan(transitionCost(from, { string: 0, fret: 1 }, TUNING_GUITAR6));
    expect(transitionCost(from, { string: 0, fret: 12 }, TUNING_GUITAR6)).toBeGreaterThan(transitionCost(from, { string: 0, fret: 7 }, TUNING_GUITAR6));
  });

  it("ベースだけ正の下限を持つ（源流の Dijkstra 実装都合＝**理由込みで**持ち、ギターには無い）", () => {
    const same = { string: 0, fret: 0 };
    expect(transitionCost(same, same, TUNING_BASS4)).toBe(0.02);      // -0.2 が床で 0.02 に
    expect(transitionCost(same, same, TUNING_GUITAR6)).toBeCloseTo(-0.2, 6); // 自前 DP は負辺でも壊れない
  });
});

describe("層状 DP（源流 graph_line.solve_fingering の一般化・依存なし・決定的）", () => {
  it("開放弦で弾ける線は開放を選ぶ（最小コスト経路になっている）", () => {
    const sol = solveFingering([28, 33, 38, 43], TUNING_BASS4); // 4本の開放弦
    expect(sol.states.map((s) => s!.fret)).toEqual([0, 0, 0, 0]);
    expect(sol.unreachable).toEqual([]);
  });

  it("到達不能な音は**経路を切って報告**する（源流 bass の networkx 版は例外＝そこは採らない）", () => {
    const sol = solveFingering([28, 100, 33], TUNING_BASS4);
    expect(sol.unreachable).toEqual([1]);
    expect(sol.states[1]).toBeNull();
    expect(sol.states[0]).not.toBeNull();
    expect(sol.states[2]).not.toBeNull();
  });

  it("決定的＝同じ入力で毎回同じ運指（RNG を使わない）", () => {
    const line = [33, 40, 45, 38, 43, 36, 41, 48];
    const a = JSON.stringify(solveFingering(line, TUNING_BASS4));
    for (let i = 0; i < 5; i++) expect(JSON.stringify(solveFingering(line, TUNING_BASS4))).toBe(a);
  });

  it("同じ音列でもギター調弦なら別の運指（一般化が本当に効いている＝調弦が結果を変える）", () => {
    const line = [45, 50, 55, 52];
    const bass = solveFingering(line, TUNING_BASS4).states.map((s) => s && [s.string, s.fret]);
    const guitar = solveFingering(line, TUNING_GUITAR6).states.map((s) => s && [s.string, s.fret]);
    expect(guitar).not.toEqual(bass);
  });
});

describe("gate＝演奏可能性（M4 の枠組みに載る＝戻り値の型で分類が強制される）", () => {
  it("弾ける線は通る／被覆率＝判定した音数（空虚でない）", () => {
    const line = [33, 36, 40, 43, 45, 41, 38, 36];
    const v = fretboardGate(line, TUNING_BASS4);
    expect(v.kind).toBe("gate");
    expect(v.pass).toBe(true);
    expect(v.coverage.applied).toBe(line.length);
    expect(v.source).toMatch(/fretboard\.py/); // 数値の出所（§6-4 #11）
    assertGate(v);
    assertCoverage(v, 1);
  });

  it("**変異検査**＝指板の外の音を注入するとゲートが落ちる（陽性対照）", () => {
    const line = [33, 36, 40, 43];
    const mutated = [...line];
    mutated[2] = 100; // 4弦ベースでは押さえられない
    const v = fretboardGate(mutated, TUNING_BASS4);
    expect(v.pass).toBe(false);
    expect(v.problems.length).toBe(1);
    expect(() => assertGate(v)).toThrow(GateFailure);
  });

  it("**変異検査**＝同じ線でも調弦を変えると落ちる（ベースの低音はギターでは鳴らない）", () => {
    const low = [28, 31, 33];
    expect(fretboardGate(low, TUNING_BASS4).pass).toBe(true);
    const g = fretboardGate(low, TUNING_GUITAR6);
    expect(g.pass).toBe(false);
    expect(g.problems.length).toBe(3);
  });
});

describe("diagnostic＝弾きにくさ（**合否を持たない**＝ゲートに使えない・§6-4 #1）", () => {
  it("数値だけを返す（pass/ok というフィールドが無い）", () => {
    const v = fretboardStrain([33, 45, 34, 46, 35, 47], TUNING_BASS4);
    expect(v.kind).toBe("diagnostic");
    expect("pass" in v).toBe(false);
    expect("holds" in v).toBe(false);
    expect(v.value.totalCost).toBeGreaterThan(0);
    expect(v.value.costPerNote).toBeGreaterThan(0);
    expect(v.value.tuning).toBe("bass4");
  });

  it("飛び回る線は素直な線より高コスト（数値が意味を持っている＝空虚でない）", () => {
    const smooth = fretboardStrain([33, 34, 35, 36, 37, 38], TUNING_BASS4).value;
    const jumpy = fretboardStrain([33, 48, 34, 47, 35, 46], TUNING_BASS4).value;
    expect(jumpy.totalCost).toBeGreaterThan(smooth.totalCost);
    expect(jumpy.maxShift).toBeGreaterThan(smooth.maxShift);
  });

  it("到達不能を含む線でも診断は返る（被覆率が落ちるだけ＝黙って止まらない）", () => {
    const v = fretboardStrain([33, 100, 36], TUNING_BASS4);
    expect(v.coverage.applied).toBe(2);
    expect(v.coverage.total).toBe(3);
  });
});

describe("生成した線を指板で検証する（3d の JZ-WALK と繋ぐ＝検証器は生成の主導権を握らない）", () => {
  const T: Record<string, number[]> = { m7: [0, 3, 7, 10], "7": [0, 4, 7, 10], maj7: [0, 4, 7, 11] };
  const seg = (rootPc: number, quality: string, slots: number): WalkSegment =>
    ({ chord: { rootPc, quality, tones: T[quality]!, bassPc: null }, slots });

  it("JZ-WALK の出力は 4弦ベースで**全音**押さえられる（W5 を指板で裏取り）", () => {
    const segs = [seg(2, "m7", 4), seg(7, "7", 4), seg(0, "maj7", 8)];
    const { pitches } = buildWalkingLine(segs, { lo: 33, hi: 48 }, 42);
    const v = fretboardGate(pitches, TUNING_BASS4);
    assertGate(v);
    assertCoverage(v, 1);
    expect(v.coverage.applied).toBe(16);
  });

  it("**指板を生成に噛ませることもできる**（playable 述語として窓に注入）＝ただし既定は検証だけ", () => {
    const segs = [seg(2, "m7", 4), seg(7, "7", 4)];
    const withFb = buildWalkingLine(segs, { lo: 33, hi: 48, playable: (p) => isPlayableOn(p, TUNING_BASS4) }, 42).pitches;
    const plain = buildWalkingLine(segs, { lo: 33, hi: 48 }, 42).pitches;
    // 窓 [33,48] は 4弦ベースの可鳴域（28..60）に丸ごと入る＝**述語を入れても出音は変わらない**＝
    // 「検証器が生成の主導権を握らない」が実際に成り立っている（変わったら生成が指板に引きずられている印）。
    expect(withFb).toEqual(plain);
    // 述語が効く条件を作れば実際に変わる（＝注入口が生きている＝空振りでない）
    const narrowed = buildWalkingLine(segs, { lo: 33, hi: 48, playable: (p) => isPlayableOn(p, TUNING_GUITAR6) }, 42).pitches;
    expect(narrowed).not.toEqual(plain);
  });
});
