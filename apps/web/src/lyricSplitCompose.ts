// 音符を割る候補UI（案A・プルダウン組み合わせ）の純ヘルパー。
// 監査（2026-07-30c）の指摘を反映：本丸は「割り方を図で見せる」・プルダウンは候補集合の分解＝
// ライブAPIは要らず開時1回の候補集合を局所照合するだけ・位置は言葉でなく図・機械の事前選択はしない。
// ここは純関数だけ（描画は component）。テストで縛る。

import { notesInRange, type Note } from "@cm/music-core";
import type { SplitCandidateDTO } from "./api";

/** 図の1マスの状態。orig=元の音符の頭／added=割って足した頭／none=無し。 */
export type Cell = "orig" | "added" | "none";

/** 割った後の音符列を、範囲の各小節16枠（拍子の gridPerBeat）の onset 図にする。
 *  origStarts＝割る前の音符の start（拍）集合＝元onsetと足したonsetを見分けるため。 */
export function onsetFigure(
  notesAfter: readonly { start: number }[],
  origStarts: readonly number[],
  range: { start: number; beats: number },
  gridPerBeat: number,
  beatsPerBar: number,
): Cell[] {
  const gpb = Math.max(1, Math.floor(gridPerBeat));
  const bpb = Math.max(1, Math.floor(beatsPerBar));
  const originBeat = Math.floor((range.start + 1e-6) / bpb) * bpb;
  const cellsPerBar = bpb * gpb;
  const bars = Math.max(1, Math.ceil((range.start + range.beats - originBeat - 1e-6) / bpb));
  const total = bars * cellsPerBar;
  const cells: Cell[] = new Array(total).fill("none");
  const orig = new Set(origStarts.map((s) => Math.round(s * gpb)));
  const inRange = (s: number) => s >= range.start - 1e-6 && s < range.start + range.beats - 1e-6;
  for (const n of notesAfter) {
    if (!inRange(n.start)) continue;
    const slot = Math.round((n.start - originBeat) * gpb);
    if (slot < 0 || slot >= total) continue;
    cells[slot] = orig.has(Math.round(n.start * gpb)) ? "orig" : "added";
  }
  return cells;
}

/** 音符ごとの割り方の1つ。added＝足すonset数（0=割らない）・slots＝足す絶対slot・key＝同定用。 */
export interface SplitOption {
  added: number;
  slots: number[];
  key: string; // slots を昇順連結（割らない="")
}

/** 範囲内の音符（時間順・index）を返す。UI が「◯番目の音符」を並べるのに使う。 */
export function inRangeNoteIndices(notes: readonly Note[], range: { start: number; beats: number }): number[] {
  return notesInRange(notes, range);
}

/** 候補集合を「音符ごとの割り方の選択肢」に分解する（プルダウンの中身）。
 *  各音符に必ず「割らない」を含める。選択肢は added→位置 で安定ソート。 */
export function decomposeOptions(
  candidates: readonly SplitCandidateDTO[],
  inRangeIdx: readonly number[],
): Map<number, SplitOption[]> {
  const byNote = new Map<number, Map<string, SplitOption>>();
  for (const idx of inRangeIdx) byNote.set(idx, new Map([["", { added: 0, slots: [], key: "" }]]));
  for (const cand of candidates) {
    const bySrc = new Map<number, number[]>();
    for (const s of cand.splits) {
      const arr = bySrc.get(s.noteIndex);
      if (arr) arr.push(s.slot);
      else bySrc.set(s.noteIndex, [s.slot]);
    }
    for (const idx of inRangeIdx) {
      const slots = (bySrc.get(idx) ?? []).slice().sort((a, b) => a - b);
      const key = slots.join(",");
      const m = byNote.get(idx)!;
      if (!m.has(key)) m.set(key, { added: slots.length, slots, key });
    }
  }
  const out = new Map<number, SplitOption[]>();
  for (const [idx, m] of byNote) {
    out.set(idx, [...m.values()].sort((a, b) => a.added - b.added || (a.slots[0] ?? 0) - (b.slots[0] ?? 0) || a.key.localeCompare(b.key)));
  }
  return out;
}

/** 選択（音符index→option.key）を候補集合から照合し、一致する候補を返す（無ければ null）。 */
export function matchCandidate(
  candidates: readonly SplitCandidateDTO[],
  inRangeIdx: readonly number[],
  selection: ReadonlyMap<number, string>,
): SplitCandidateDTO | null {
  for (const cand of candidates) {
    const bySrc = new Map<number, number[]>();
    for (const s of cand.splits) {
      const arr = bySrc.get(s.noteIndex);
      if (arr) arr.push(s.slot);
      else bySrc.set(s.noteIndex, [s.slot]);
    }
    let ok = true;
    for (const idx of inRangeIdx) {
      const key = (bySrc.get(idx) ?? []).slice().sort((a, b) => a - b).join(",");
      if ((selection.get(idx) ?? "") !== key) { ok = false; break; }
    }
    if (ok) return cand;
  }
  return null;
}

/** 選択で足す onset の合計（残り＝余りモーラ数との差を UI が言うのに使う）。 */
export function selectionAdded(
  optionsByNote: ReadonlyMap<number, SplitOption[]>,
  selection: ReadonlyMap<number, string>,
): number {
  let sum = 0;
  for (const [idx, opts] of optionsByNote) {
    const key = selection.get(idx) ?? "";
    const opt = opts.find((o) => o.key === key);
    if (opt) sum += opt.added;
  }
  return sum;
}

/** 候補の splits を「音符index→option.key」の選択に変換（リストやおすすめから読み込むため）。 */
export function candidateToSelection(cand: SplitCandidateDTO, inRangeIdx: readonly number[]): Map<number, string> {
  const bySrc = new Map<number, number[]>();
  for (const s of cand.splits) {
    const arr = bySrc.get(s.noteIndex);
    if (arr) arr.push(s.slot);
    else bySrc.set(s.noteIndex, [s.slot]);
  }
  const sel = new Map<number, string>();
  for (const idx of inRangeIdx) sel.set(idx, (bySrc.get(idx) ?? []).slice().sort((a, b) => a - b).join(","));
  return sel;
}

/** 音符ごとの割り方の言葉（内輪語なし）。個数＋（同じ個数で位置が複数あるとき用に）小図は component が描く。 */
export function optionLabel(opt: SplitOption): string {
  if (opt.added === 0) return "割らない";
  return `${opt.added + 1}つに割る`;
}
