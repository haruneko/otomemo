// ハモリ（上/下＝並行する第2声部）。既存 harmonize(メロ→コード伴奏)とは別物＝メロに並行する
// 声部を「調内で」degSteps 分ずらして生む。まず単純な平行3度(±2度)から（design 2026-07-03）。
import type { Note } from "./music";

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

// 調(keyPc)+旋法から、0..127 の「調内ピッチ」の梯子を作る。
function scaleLadder(keyPc: number, minor: boolean): number[] {
  const pcs = (minor ? MINOR : MAJOR).map((s) => (((s + keyPc) % 12) + 12) % 12);
  const set = new Set(pcs);
  const ladder: number[] = [];
  for (let p = 0; p <= 127; p++) if (set.has(((p % 12) + 12) % 12)) ladder.push(p);
  return ladder;
}
function nearestIdx(ladder: number[], pitch: number): number {
  let best = 0;
  for (let i = 1; i < ladder.length; i++)
    if (Math.abs(ladder[i]! - pitch) < Math.abs(ladder[best]! - pitch)) best = i;
  return best;
}

// 各ノートを調内で degSteps(度数)ずらしたハモリ声部を返す。+2=上3度 / -2=下3度 / +5=上6度…。
export function harmonyVoice(
  notes: Note[],
  keyPc: number,
  minor: boolean,
  degSteps: number,
): Note[] {
  const ladder = scaleLadder(((keyPc % 12) + 12) % 12, minor);
  if (!ladder.length) return notes.map((n) => ({ ...n }));
  return notes.map((n) => {
    const i = nearestIdx(ladder, n.pitch);
    const j = Math.max(0, Math.min(ladder.length - 1, i + degSteps));
    return { ...n, pitch: ladder[j]! };
  });
}
