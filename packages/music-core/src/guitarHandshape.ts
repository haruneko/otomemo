// 5e 手の形（handshape）の**枠だけ**（M5）＝phrase_maker `guitar/gen2/{handshape,shapeline}.py`・`chords/shapefollow.py` の
//   **設計思想**（フォーム＝状態・調弦からフォーム DB を導出・移動時間ゲート・層状 Viterbi・緩和ラダー）だけを持つ。
// 正典＝計画 §4-5（`(d) 耳未判定`）・§5-2 M5 Scope 5e・§6-4 #9（摂動テストは全ソルバ必須）・§4-9 負の知識1/13。
//
// ⚠ **耳未判定**（源流 `19c405a`「Ear status: not yet judged」）＝**既定 OFF・opt-in**（`guitarShape:true` の時だけ立つ）。
// ⚠ **重み・定数は移植しない**：源流の FORM_CHANGE_PEN 0.6／OPEN_CREDIT 0.4／POWER3_PREF 0.05／SHIFT_RATE 45／REGRIP 0.035 等は
//    **ここに一つも無い**。重みは呼び手が必ず渡す（`ShapeWeights`・既定値を持たない）。製品経路が使う
//    `SHAPE_WEIGHTS_OTOMEMO` は**otomemo が置いた仮の値**（源流の値ではない・耳で決めていない）＝出所をそう書く。
// ⚠ **アプローチトーンは持ち込まない**（`shapefollow.py:87-90` の CLS_APPROACH 分岐は撤去済みの残置＝落とした）。
//
// 負の知識の反映：
//   1  物理層が「何でも通すバリデータ」に堕ちる＝**重みだけ動かして出力が変わらなければバリデータ**
//      → 摂動テスト（test/guitar-handshape.test.ts）で落ちたら凍結（撤退基準）。
//   13 差を作る項が床に潰され、同点タイブレークが id 順だと 3音形が 0 件になる
//      → 形の得失は**節点コスト**に置く（辺の床に潰されない）／同点は **seed 由来の決定的タイブレーク**（id 順にしない）。

import type { Tuning } from "./verify/fretboard";
import { enumerateShapes, shapePitches, usesOpenString, formGainOk, type GtrForm, type HandShape, GTR_FRET_SEARCH_MAX } from "./guitarForms";

/** 重み（**既定値を持たない**＝移植していないことを型で示す）。 */
export interface ShapeWeights {
  /** 1フレットの横移動 */
  readonly move: number;
  /** 弦1本の跨ぎ */
  readonly string: number;
  /** 手の形を作り直す */
  readonly formChange: number;
  /** 開放弦が鳴る形の得（節点） */
  readonly openCredit: number;
  /** 3音形（R+5+8）の得（節点） */
  readonly power3Pref: number;
  /** 高いポジションの嫌さ（節点・1フレットあたり） */
  readonly highFret: number;
  /** 文法の度数（deg）の弱いバイアス（節点・半音あたり） */
  readonly degBias: number;
}

/** 移動時間ゲート（**既定値を持たない**）。 */
export interface ShapePhysics {
  /** フレット/秒 */
  readonly shiftRate: number;
  /** 離して掴み直す固定費（秒） */
  readonly regrip: number;
  /** 弦1本を何フレット分の移動と数えるか */
  readonly stringLambda: number;
}

/** **otomemo の仮置き**（源流の値ではない・耳未判定）。整数寄りに丸めて源流の値と取り違えないようにしてある。 */
export const SHAPE_WEIGHTS_OTOMEMO: ShapeWeights = { move: 1, string: 1, formChange: 1, openCredit: 0.5, power3Pref: 0.25, highFret: 0.05, degBias: 0.1 };
export const SHAPE_PHYSICS_OTOMEMO: ShapePhysics = { shiftRate: 40, regrip: 0.04, stringLambda: 1 };
export const SHAPE_WEIGHTS_ORIGIN = "otomemo placeholder（phrase_maker の重みは移植しない＝計画 §4-5・§5-2 M5-5e／耳未判定）";

/** 32bit FNV-1a（seed 由来の決定的タイブレーク用）。 */
function fnv32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const shapeKey = (sh: HandShape): string => `${sh.form}:${sh.string}:${sh.fret}`;

export function shapeNodeCost(sh: HandShape, w: ShapeWeights, t: Pick<Tuning, "openMidi">): number {
  let c = w.highFret * sh.fret;
  if (usesOpenString(sh, t)) c -= w.openCredit;
  if (sh.form === "power3") c -= w.power3Pref;
  return c;
}

export function shapeEdgeCost(a: HandShape, b: HandShape, w: ShapeWeights): number {
  return w.move * Math.abs(a.fret - b.fret) + w.string * Math.abs(a.string - b.string) + (a.form !== b.form ? w.formChange : 0);
}

function gateDistance(a: HandShape, b: HandShape, lambda: number): number {
  if (b.form === "open") return Math.abs(b.fret - a.fret);
  return Math.abs(b.fret - a.fret) + lambda * Math.abs(b.string - a.string);
}

export interface ShapeSolveResult {
  /** 各層で選んだ形（空層は null） */
  readonly shapes: readonly (HandShape | null)[];
  /** 緩和ラダーの段（0＝ゲートそのまま／1＝移動速度2倍／2＝ゲート無効） */
  readonly tier: 0 | 1 | 2;
  /** 候補が1つも無かった層 */
  readonly empty: readonly number[];
  readonly totalCost: number;
}

/**
 * 層状 Viterbi（源流 `shapeline.solve_shapes`＋`solve_with_tiers` の骨格）。
 * `nodeBias` は層と同形の追加節点コスト（文法 deg のバイアス）。同点は seed 由来の決定的タイブレーク。
 * **seed は同コスト解の選び分けにしか効かない（意図どおり）**＝最小コストは seed 非依存・同点が無い入力では出力も同じ。
 *   「seed を変えれば別案が出る」ノブではない（源流 handshape は knob=0 で乱数を作らない＝計画 §5-2 M5・負の知識13）。
 */
export function solveHandShapes(
  layers: readonly (readonly HandShape[])[], dts: readonly number[], w: ShapeWeights, phys: ShapePhysics,
  opts: { seed: number; tuning: Pick<Tuning, "openMidi">; nodeBias?: readonly (readonly number[])[] },
): ShapeSolveResult {
  const t = opts.tuning;
  const tie = (i: number, sh: HandShape): number => fnv32(`${opts.seed}|${i}|${shapeKey(sh)}`);
  const better = (c: number, k: number, bc: number, bk: number): boolean => c < bc - 1e-9 || (Math.abs(c - bc) <= 1e-9 && k < bk);

  const solve = (gateRate: number | null) => {
    const shapes: (HandShape | null)[] = layers.map(() => null);
    const empty: number[] = [];
    let total = 0, gateBreaks = 0;
    let runIdx: number[] = [];
    let cost: number[] = [];
    const back: number[][] = [];
    const flush = (): void => {
      if (runIdx.length === 0) return;
      const last = layers[runIdx[runIdx.length - 1]!]!;
      let bi = -1, bc = Infinity, bk = Infinity;
      last.forEach((sh, k) => { const kk = tie(runIdx[runIdx.length - 1]!, sh); if (cost[k]! < Infinity && better(cost[k]!, kk, bc, bk)) { bi = k; bc = cost[k]!; bk = kk; } });
      if (bi < 0) return;
      total += bc;
      let cur = bi;
      for (let p = runIdx.length - 1; p >= 0; p--) {
        shapes[runIdx[p]!] = layers[runIdx[p]!]![cur]!;
        if (p > 0) cur = back[p]![cur]!;
      }
      runIdx = []; cost = []; back.length = 0;
    };
    for (let i = 0; i < layers.length; i++) {
      const sts = layers[i]!;
      if (sts.length === 0) { flush(); empty.push(i); continue; }
      const nc = sts.map((sh, k) => shapeNodeCost(sh, w, t) + (opts.nodeBias?.[i]?.[k] ?? 0));
      if (runIdx.length === 0) { runIdx = [i]; cost = nc; back.length = 0; back.push([]); continue; }
      const prev = layers[runIdx[runIdx.length - 1]!]!;
      const dt = dts[i] ?? 0;
      const maxf = gateRate === null ? Infinity : Math.max(0, Math.floor(gateRate * Math.max(0, dt - phys.regrip)));
      const next: number[] = [], bp: number[] = [];
      sts.forEach((sh, k) => {
        let bc = Infinity, bj = -1, bk = Infinity;
        prev.forEach((ps, j) => {
          if (cost[j]! === Infinity) return;
          if (gateDistance(ps, sh, phys.stringLambda) > maxf) return;
          const cc = cost[j]! + shapeEdgeCost(ps, sh, w);
          const kk = tie(i - 1, ps);
          if (better(cc, kk, bc, bk)) { bc = cc; bj = j; bk = kk; }
        });
        next.push(bj < 0 ? Infinity : bc + nc[k]!);
        bp.push(bj);
      });
      if (next.every((x) => x === Infinity)) {
        flush(); gateBreaks++;
        runIdx = [i]; cost = nc; back.length = 0; back.push([]);
      } else {
        runIdx.push(i); cost = next; back.push(bp);
      }
    }
    flush();
    return { shapes, empty, total, gateBreaks };
  };

  const tiers: [0 | 1 | 2, number | null][] = [[0, phys.shiftRate], [1, 2 * phys.shiftRate], [2, null]];
  let res = solve(tiers[0]![1]);
  let tier: 0 | 1 | 2 = 0;
  for (const [tt, rate] of tiers.slice(1)) {
    if (res.gateBreaks === 0) break;
    res = solve(rate); tier = tt;
  }
  return { shapes: res.shapes, tier, empty: res.empty, totalCost: Math.round(res.total * 100) / 100 };
}

/** 許容ドメイン（和声は pc 集合・レジスタ帯・フォーム集合としてだけ入る＝出力を見て捨てる段は無い）。 */
export interface ShapeDomain { readonly pcs: ReadonlySet<number>; readonly lo: number; readonly hi: number; readonly forms: readonly GtrForm[] }

/** ドメインから層（候補の形）を作る。ルート音（形の最低音）の pc と帯で絞る。 */
export function shapeLayer(dom: ShapeDomain, t: Pick<Tuning, "openMidi">, fretMax = GTR_FRET_SEARCH_MAX): HandShape[] {
  const out: HandShape[] = [];
  for (const form of dom.forms) {
    if (!formGainOk(form)) continue;
    for (const sh of enumerateShapes(form, t, fretMax)) {
      const root = shapePitches(sh, t)[0]!;
      if (root >= dom.lo && root <= dom.hi && dom.pcs.has(((root % 12) + 12) % 12)) out.push(sh);
    }
  }
  return out;
}
