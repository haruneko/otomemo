// 指板検証（M3-3e）＝phrase_maker ギター gen2 の自前 DP（`experiments/guitar/gen2/{fretboard,graph_line}.py`）を
//   **弦数・調弦・コスト重みを引数に取る形へ一般化**し、4弦ベースにも6弦ギターにも同じ1本で効くようにしたもの。
// 正典＝docs/design.md §2106 追補 (p)（検証器の作法）／計画 §5-2 M3 Scope 3e・§6-4。
//
// **位置づけ＝検証器**（計画の確定）：生成の主導権は握らない。「この線は手で弾けるか」を後から測るだけ。
//   だから M4 の枠組み（`gate` / `byConstruction` / `diagnostic` を**戻り値の型で強制**）に載せる：
//     gate       ＝到達不能な音（どの弦でも押さえられない）が 0（`verify/types.ts` の GateVerdict）
//     diagnostic ＝運指コスト・最大ポジション移動・開放弦率（**形の要求はゲートにしない**＝弾きにくさの
//                  可否は耳と手が決める。数値は出すが合否は言わない）
//
// 源流の2実装の差（そのまま持つ・**混ぜない**）：
//   - ギター gen2（`guitar/gen2/fretboard.py:88-101`）＝弦移動 1.2／`df>=5` でポジション移動／高音 0.04／+0.1
//   - ベース（`bass_rock_riff/fretboard.py:42-63`）＝弦移動 1.4／`df>=4`／高音 0.05／+0.1＋**下限 0.02**
//     （下限は networkx Dijkstra が負辺で落ちる**実装都合**＝計画 §4-1「床は持ち込まない」。ここでは
//      **自前 DP なので負辺でも壊れない**が、源流のコストと数値を揃えるため tuning のフラグとして持つ＝
//      持ち込む/持ち込まないを呼び手が選べる形にした。既定（`TUNING_BASS4`）は源流と同じ値で揃えてある。）
//   - 探索は**ギター側の自前 DP**（`graph_line.py:18-79`）を採る＝依存なし・到達不能を run で切って報告できる。
//     ベース側は networkx で「到達不能なら例外」＝(c) 寄り（計画 §4-1）なので移植しない。
//
// 負数の `%` の罠（既習）：pitch→fret は引き算なので `%` は出ないが、**pc から弦を探す**口
//   （`statesForPitchClass`）は剰余を使う＝`normRootPc`（`index.ts:108 normRoot` と同じ式）を必ず経由する。

import { coverageOf, diagnostic, gate, type DiagnosticVerdict, type GateVerdict } from "./types";

export const SRC_FRETBOARD_GUITAR = "phrase_maker experiments/guitar/gen2/fretboard.py:88-101 (transition_cost) / graph_line.py:18-79 (solve_fingering)";
export const SRC_FRETBOARD_BASS = "phrase_maker experiments/bass_rock_riff/fretboard.py:42-63 (transition_cost)";

/** 弦楽器の調弦とコストの重み（**楽器差はここだけ**＝DP は共通）。 */
export interface Tuning {
  readonly name: string;
  /** 開放弦の MIDI（低い弦から） */
  readonly openMidi: readonly number[];
  readonly fretMax: number;
  /** 弦をまたぐコスト（ギター 1.2／ベース 1.4） */
  readonly stringCross: number;
  /** これ以上のフレット移動は「ポジション移動」（ギター 5／ベース 4） */
  readonly shiftThreshold: number;
  /** ポジション移動の追加コスト係数（両方 2.0） */
  readonly shiftPenalty: number;
  /** 開放弦の割引（両方 0.3） */
  readonly openBonus: number;
  /** 高いポジションの微妙な嫌さ（ギター 0.04／ベース 0.05） */
  readonly highFretPenalty: number;
  /** 定数項（両方 0.1） */
  readonly base: number;
  /** 正の下限（ベース源流の 0.02＝Dijkstra 実装都合。自前 DP には不要なので既定 null＝掛けない） */
  readonly costFloor: number | null;
  readonly source: string;
}

/** 4弦ベース（E1 A1 D2 G2・17フレット＝`bass_rock_riff/fretboard.py:16-21`）。 */
export const TUNING_BASS4: Tuning = {
  name: "bass4", openMidi: [28, 33, 38, 43], fretMax: 17,
  stringCross: 1.4, shiftThreshold: 4, shiftPenalty: 2.0, openBonus: 0.3, highFretPenalty: 0.05, base: 0.1,
  costFloor: 0.02, source: SRC_FRETBOARD_BASS,
};

/** 6弦ギター（E2 A2 D3 G3 B3 E4・22フレット＝`guitar/gen2/fretboard.py:20-25`）。 */
export const TUNING_GUITAR6: Tuning = {
  name: "guitar6", openMidi: [40, 45, 50, 55, 59, 64], fretMax: 22,
  stringCross: 1.2, shiftThreshold: 5, shiftPenalty: 2.0, openBonus: 0.3, highFretPenalty: 0.04, base: 0.1,
  costFloor: null, source: SRC_FRETBOARD_GUITAR,
};

/** 5弦ベース（B0 E1 A1 D2 G2）＝**源流に無い**（otomemo 側の一般化の実演＝弦数を増やしても DP は同じ）。 */
export const TUNING_BASS5: Tuning = { ...TUNING_BASS4, name: "bass5", openMidi: [23, 28, 33, 38, 43], source: `otomemo generalization / ${SRC_FRETBOARD_BASS}` };

export interface FretState { readonly string: number; readonly fret: number }

/** その音を鳴らせる (弦, フレット) を全部（源流 `pitch_states`）。同じ音が複数の弦で鳴る＝1対多の逆写像。 */
export function pitchStates(pitch: number, t: Tuning): FretState[] {
  const out: FretState[] = [];
  for (let s = 0; s < t.openMidi.length; s++) {
    const f = pitch - t.openMidi[s]!;
    if (f >= 0 && f <= t.fretMax) out.push({ string: s, fret: f });
  }
  return out;
}

/** 鳴らせるか（源流 `is_playable`）＝押さえ場所が1つでもあるか。 */
export function isPlayableOn(pitch: number, t: Tuning): boolean {
  return pitchStates(pitch, t).length > 0;
}

/** ピッチクラス(0-11)で押さえ場所を引く。**負数の `%` の罠**＝`((a%n)+n)%n` を必ず経由（Python の剰余と揃える）。 */
export function statesForPitchClass(pc: number, t: Tuning): FretState[] {
  const p0 = ((Math.trunc(pc) % 12) + 12) % 12;
  const out: FretState[] = [];
  for (let s = 0; s < t.openMidi.length; s++) {
    for (let f = 0; f <= t.fretMax; f++) {
      if ((((t.openMidi[s]! + f) % 12) + 12) % 12 === p0) out.push({ string: s, fret: f });
    }
  }
  return out;
}

/** 押さえ替えのコスト（源流 `transition_cost`）＝横移動・弦またぎ・ポジション移動・開放の割引・高音の嫌さ。 */
export function transitionCost(a: FretState, b: FretState, t: Tuning): number {
  const df = Math.abs(a.fret - b.fret);
  const ds = Math.abs(a.string - b.string);
  let cost = 1.0 * df + t.stringCross * ds;
  if (df >= t.shiftThreshold) cost += t.shiftPenalty * (df - (t.shiftThreshold - 1));
  if (b.fret === 0) cost -= t.openBonus;
  cost += t.highFretPenalty * b.fret;
  const c = cost + t.base;
  return t.costFloor === null ? c : Math.max(t.costFloor, c);
}

export interface FingeringSolution {
  /** 各音の押さえ場所（到達不能な音は null） */
  readonly states: readonly (FretState | null)[];
  /** 到達可能な区間ごとの最小コストの合計（源流と同じく小数第2位で丸め） */
  readonly totalCost: number;
  /** 押さえ場所が存在しない音の添字 */
  readonly unreachable: readonly number[];
}

/**
 * 層状 DP で最小コストの運指を解く（源流 `guitar/gen2/graph_line.py:18-79 solve_fingering` の一般化）。
 * **到達不能な音は経路を切って報告する**（源流 bass の networkx 版は例外を投げる＝そこは採らない）。
 * 依存なし・決定的（同点は「先に見つかった方」＝候補の並び順が決まっているので毎回同じ）。
 */
export function solveFingering(pitches: readonly number[], t: Tuning): FingeringSolution {
  const layers = pitches.map((p) => pitchStates(p, t));
  const states: (FretState | null)[] = pitches.map(() => null);
  const unreachable: number[] = [];
  let total = 0;

  let runIdx: number[] = [];
  let runCost: { st: FretState; cost: number }[] = [];
  const back: Map<string, number> = new Map(); // `${pos}:${stateIndex}` → 直前の状態の添字

  const flush = (): void => {
    if (runIdx.length === 0) return;
    let bi = 0;
    for (let i = 1; i < runCost.length; i++) if (runCost[i]!.cost < runCost[bi]!.cost) bi = i;
    total += runCost[bi]!.cost;
    const chain: FretState[] = [runCost[bi]!.st];
    let cur = bi;
    for (let pos = runIdx.length - 1; pos > 0; pos--) {
      const prev = back.get(`${pos}:${cur}`);
      if (prev === undefined) break;
      cur = prev;
      chain.push(layers[runIdx[pos - 1]!]![cur]!);
    }
    chain.reverse();
    runIdx.forEach((oi, k) => { states[oi] = chain[k] ?? null; });
    runIdx = []; runCost = []; back.clear();
  };

  for (let i = 0; i < layers.length; i++) {
    const sts = layers[i]!;
    if (sts.length === 0) { unreachable.push(i); flush(); continue; }
    if (runIdx.length === 0) {
      runIdx = [i];
      runCost = sts.map((st) => ({ st, cost: 0 }));
    } else {
      const pos = runIdx.length;
      const next: { st: FretState; cost: number }[] = [];
      sts.forEach((st, si) => {
        let best = Infinity, bprev = -1;
        runCost.forEach((pc, pi) => {
          const c = pc.cost + transitionCost(pc.st, st, t);
          if (c < best) { best = c; bprev = pi; }
        });
        next.push({ st, cost: best });
        back.set(`${pos}:${si}`, bprev);
      });
      runCost = next;
      runIdx.push(i);
    }
  }
  flush();
  return { states, totalCost: Math.round(total * 100) / 100, unreachable };
}

/**
 * **gate**＝演奏可能性（源流 chord_follow の5ガードの④／walking の W5）。
 * 「どの弦でも押さえられない音」が 0 であること。**被覆率**＝判定した音数／音数（0 なら空虚）。
 */
export function fretboardGate(pitches: readonly number[], t: Tuning): GateVerdict<{ unreachable: readonly number[]; tuning: string }> {
  const sol = solveFingering(pitches, t);
  const problems = sol.unreachable.map((i) => `note#${i} pitch=${pitches[i]} は ${t.name} のどの弦でも押さえられない`);
  return gate(
    `fretboard_reachable:${t.name}`,
    sol.unreachable.length === 0,
    coverageOf(pitches.length, pitches.length),
    t.source,
    problems,
    { unreachable: sol.unreachable, tuning: t.name },
  );
}

export interface FretboardStrain {
  readonly totalCost: number;
  /** 1音あたりのコスト（線の長さで割った弾きにくさ） */
  readonly costPerNote: number;
  /** 最大のポジション移動（フレット差） */
  readonly maxShift: number;
  /** ポジション移動（threshold 以上）の回数 */
  readonly shifts: number;
  /** 開放弦の割合 */
  readonly openFrac: number;
  readonly tuning: string;
}

/**
 * **diagnostic**＝弾きにくさの数値（`pass` を持たない＝ゲートに使えない）。
 * 「押さえにくいから駄目」は**耳と手が決める**（§6-4 #1＝形の要求をゲートにしない）。
 */
export function fretboardStrain(pitches: readonly number[], t: Tuning): DiagnosticVerdict<FretboardStrain> {
  const sol = solveFingering(pitches, t);
  const placed = sol.states.filter((s): s is FretState => s !== null);
  let maxShift = 0, shifts = 0, open = 0;
  for (let i = 1; i < sol.states.length; i++) {
    const a = sol.states[i - 1], b = sol.states[i];
    if (!a || !b) continue;
    const df = Math.abs(a.fret - b.fret);
    if (df > maxShift) maxShift = df;
    if (df >= t.shiftThreshold) shifts++;
  }
  for (const s of placed) if (s.fret === 0) open++;
  const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;
  return diagnostic(
    `fretboard_strain:${t.name}`,
    {
      totalCost: sol.totalCost,
      costPerNote: placed.length > 0 ? r4(sol.totalCost / placed.length) : 0,
      maxShift, shifts,
      openFrac: placed.length > 0 ? r4(open / placed.length) : 0,
      tuning: t.name,
    },
    coverageOf(placed.length, pitches.length),
    t.source,
    "弾きにくさは数値で出すだけ＝可否は耳と手（§6-4 #1）",
  );
}
