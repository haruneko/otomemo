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

// ── SplitRoll＝割り方を「メロの概形」で描く幾何（design §31-5・2026-07-31 設計ワークフロー統合）──
// ASCII の ●○· を捨て、MiniRoll と同じ矩形DNA（pitch×time）＋ドラムの拍格子で描く。
// 時間軸は onsetFigure と同じ originBeat 基準の等尺＝全候補で拍列が縦に揃う。ピッチは句で1回正規化。
// 元onsetと足したonsetの分類は onsetFigure と同一述語（テストで1対1一致を縛れる）。

export interface SplitRollRect {
  x: number; // 開始スロット（0..total・originBeat 相対）
  w: number; // スロット幅（次onsetまで／音符の残り）
  frac: number; // ピッチの縦位置 0..1（0=低・1=高）
  isAdded: boolean; // 割って足した頭か（true＝黄＋ティック）
}
export interface SplitRollGeom {
  total: number; // 1行の総スロット数（bars×bpb×gpb）
  rects: SplitRollRect[]; // 範囲内音符（時間順）
  barLines: number[]; // 小節線のスロット位置
  beatLines: number[]; // 拍線のスロット位置（小節線と重ならないもの）
}

/**
 * 割った後の音符を SplitRoll の描画座標へ変換する純関数。lo/hi は句のピッチ範囲（origNotes から1回算出して配る
 * ＝候補ごとに再正規化しない＝輪郭が全候補で揃い、動くのは足した頭の位置だけになる）。
 */
export function splitRollGeom(
  notesAfter: readonly { start: number; dur: number; pitch: number }[],
  origStarts: readonly number[],
  range: { start: number; beats: number },
  meter: { beatsPerBar: number; gridPerBeat: number },
  lo: number,
  hi: number,
): SplitRollGeom {
  const gpb = Math.max(1, Math.floor(meter.gridPerBeat));
  const bpb = Math.max(1, Math.floor(meter.beatsPerBar));
  const cellsPerBar = bpb * gpb;
  const originBeat = Math.floor((range.start + 1e-6) / bpb) * bpb;
  const bars = Math.max(1, Math.ceil((range.start + range.beats - originBeat - 1e-6) / bpb));
  const total = bars * cellsPerBar;
  const toSlot = (beat: number) => Math.round((beat - originBeat) * gpb);
  const orig = new Set(origStarts.map((s) => Math.round(s * gpb)));
  const end = range.start + range.beats;

  const rects: SplitRollRect[] = [];
  for (const n of notesAfter) {
    if (!(n.start >= range.start - 1e-6 && n.start < end - 1e-6)) continue;
    if (!Number.isFinite(n.pitch) || !Number.isFinite(n.start) || !Number.isFinite(n.dur)) continue;
    const x = toSlot(n.start);
    const w = Math.max(1, Math.round(n.dur * gpb));
    const frac = hi > lo ? (n.pitch - lo) / (hi - lo) : 0.5; // 単音/同高は中央（MiniRoll と同旨）
    rects.push({ x, w, frac, isAdded: !orig.has(Math.round(n.start * gpb)) });
  }
  const barLines: number[] = [];
  const beatLines: number[] = [];
  for (let s = 0; s <= total; s += gpb) {
    if (s % cellsPerBar === 0) barLines.push(s);
    else beatLines.push(s);
  }
  return { total, rects, barLines, beatLines };
}
