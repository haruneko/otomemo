// microtiming_structural（M4 Scope 4）＝「ヒューマナイズが**系統的**か（一様乱数の散らしではないか）」の計測。
// 源流＝phrase_maker `experiments/drums/gen2/src/metrics.py:43-55`：
//   structural = |snare平均| >= 3.0ms かつ |hat平均| >= 3.0ms かつ **snare > 0 > hat**（符号が逆＝もたり/前ノリ）。
// **これは診断であってゲートではない**（§6-4 #1「形の要求をゲートにしない」・負の知識3「機械指標を報酬にすると
// 同じ場所で止まる」）。otomemo では ms の揺れは feel 層の持ち場（design.md:2109）＝生成の合否条件にしない。

import { coverageOf, diagnostic, type DiagnosticVerdict } from "./types";

export const SRC_MICROTIMING = "phrase_maker experiments/drums/gen2/src/metrics.py:43-55 (microtiming_structural)";

/** 源流の閾値（ms）。出所を引く（§6-4 #11）。 */
export const SRC_STRUCTURAL_MIN_MS = 3.0;

/** 源流が「手」の代表に見る voice（chh が無ければ ride）。metrics.py:45-46。 */
export const HAT_VOICES = ["chh", "ride"] as const;

export interface MicrotimingValue {
  /** voice ごとの平均オフセット（ms・符号つき／− が前ノリ）。 */
  readonly voiceMeanMs: Readonly<Record<string, number>>;
  readonly snareMeanMs: number;
  readonly hatMeanMs: number;
  /** 源流の判定式の結果（**診断値**）。 */
  readonly structural: boolean;
}

const r2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * voice 別オフセット（ms）から構造的マイクロタイミングを測る。
 * 入力＝打点と同順の offsetsMs / voices（源流 compute と同じ持ち方）。
 */
export function microtimingStructural(offsetsMs: readonly number[], voices: readonly string[], id = "microtiming_structural"): DiagnosticVerdict<MicrotimingValue> {
  const byVoice = new Map<string, number[]>();
  const n = Math.min(offsetsMs.length, voices.length);
  for (let i = 0; i < n; i++) {
    const v = voices[i]!;
    (byVoice.get(v) ?? byVoice.set(v, []).get(v)!).push(offsetsMs[i]!);
  }
  const voiceMeanMs: Record<string, number> = {};
  for (const [v, xs] of byVoice) voiceMeanMs[v] = r2(xs.reduce((a, b) => a + b, 0) / xs.length);
  const snare = voiceMeanMs["snare"] ?? 0;
  const hat = voiceMeanMs["chh"] ?? voiceMeanMs["ride"] ?? 0;
  const structural = Math.abs(snare) >= SRC_STRUCTURAL_MIN_MS && Math.abs(hat) >= SRC_STRUCTURAL_MIN_MS && snare > 0 && 0 > hat;
  // 被覆率＝判定に必要な2つの代表 voice のうち、実際に打点があったものの数。
  const present = (byVoice.has("snare") ? 1 : 0) + (HAT_VOICES.some((v) => byVoice.has(v)) ? 1 : 0);
  return diagnostic(id, { voiceMeanMs, snareMeanMs: r2(snare), hatMeanMs: r2(hat), structural }, coverageOf(present, 2), SRC_MICROTIMING,
    "ゲートにしない（ノリの良し悪しは耳）。系統性の有無を数で見せるだけ。");
}
