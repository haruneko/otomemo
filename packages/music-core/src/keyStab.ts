// M6a-6a＝鍵盤の「キックの隙間刺し」（phrase_maker の2本を1本化して移植）。
//
// 源流（同じ知識が2か所にある＝計画 §4-3 R2「二重計上しない」）：
//   - legacy：`experiments/ensemble/ensemble.py` `rock_piano` の sheet 分岐（:2128-2161）
//   - p11：`experiments/piano/gesture/gesture_p11.py` `build_rock`（:587-618・docstring が「legacy rock_piano と同性格」）
// 中身：譜（1小節の16分格子）の onsets からキックを抜いた位置に和音を刺す（＝キックの隙間＋スネアのバックビート）。
//   アクセント位置は anchor（強め）・他は colour。onsets ⊆ kick（刺す所が無い）なら 16分 step 6,14（＝2拍裏・4拍裏）。
// RNG 不使用・純関数。py-parity＝`tools/py-parity/cases-key-stab/cases.json`（両源流と一致）。
//
// 移さないもの：band の低域譲り（`lift_above(rh, bass_max)`・LH 無発音）＝6b＝§8-3 のオーナー裁定待ち。
//   ボイシング（legacy `build_voicing` / p11 の vd）＝otomemo 既存の voiceToTop に任せる（計画 §4-3 comping 行）。

export interface KeyStabSheet {
  /** 1小節の16分 step（0..15）。譜の打点全部（otomemo ではキック∪スネア）。 */
  onsets: readonly number[];
  kick: readonly number[];
  accents: readonly number[];
}
export type KeyStabRole = "anchor" | "colour";
export interface KeyStabSlot { step: number; role: KeyStabRole }

/** onsets ⊆ kick のときの刺し位置（legacy の 1.5/3.5 拍＝p11 の slot 6,14）。 */
export const KEY_STAB_FALLBACK_STEPS: readonly number[] = [6, 14];

/** 1小節ぶんの刺し位置と役割。fallback=true は「隙間が無いので 6,14 に刺した」。 */
export function keyStabSlots(sheet: KeyStabSheet): { slots: KeyStabSlot[]; fallback: boolean } {
  const onsets = [...new Set(sheet.onsets)].sort((a, b) => a - b);
  const kick = new Set(sheet.kick);
  const accents = new Set(sheet.accents);
  let steps = onsets.filter((s) => !kick.has(s));
  const fallback = steps.length === 0;
  if (fallback) steps = [...KEY_STAB_FALLBACK_STEPS];
  return { slots: steps.map((step) => ({ step, role: accents.has(step) ? "anchor" : "colour" })), fallback };
}

/** 刺しの音価（16分 step）。源流 legacy＝0.4 拍（≒1.6 step）を整数格子へ＝2 step。次の刺しと小節末で詰める。 */
export const KEY_STAB_DUR_STEPS = 2;

/**
 * 小節ごとに同じ刺しを敷いた ChordHit 列（相対形＝音高は実音化側）。
 * vel は anchor だけ `anchorVel` を載せ、colour は載せない（＝既定の強さ）。
 */
export function keyStabHits(
  slots: readonly KeyStabSlot[], bars: number, anchorVel: number, stepsPerBar = 16,
): { step: number; dur: number; vel?: number }[] {
  const out: { step: number; dur: number; vel?: number }[] = [];
  const total = bars * stepsPerBar;
  for (let b = 0; b < bars; b++) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      const step = b * stepsPerBar + s.step;
      const next = i + 1 < slots.length ? b * stepsPerBar + slots[i + 1]!.step : (b + 1) * stepsPerBar + slots[0]!.step;
      const dur = Math.max(1, Math.min(KEY_STAB_DUR_STEPS, next - step, total - step));
      out.push(s.role === "anchor" ? { step, dur, vel: anchorVel } : { step, dur });
    }
  }
  return out;
}
