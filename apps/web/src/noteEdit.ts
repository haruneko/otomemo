// ピアノロールの選択編集の純ロジック（design 決定N2）。選択＝notes への index 集合。
// notes 配列順は安定に保つ（nudge で並べ替えない＝index が保てる）。全て入力を破壊しない純関数。
import type { Note } from "./music";

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const clampPitch = (p: number) => Math.max(0, Math.min(127, Math.round(p)));

/** 選択音符を音程(dPitch半音)・時間(dBeats拍)ずらす。未選択は不変。pitch 0-127・start≥0 にクランプ。 */
export function nudgeNotes(notes: Note[], sel: Set<number>, dPitch: number, dBeats: number): Note[] {
  return notes.map((n, i) =>
    sel.has(i) ? { ...n, pitch: clampPitch(n.pitch + dPitch), start: Math.max(0, r3(n.start + dBeats)) } : n,
  );
}

/** 選択を +offsetBeats にコピーして末尾に追加。戻り selection はコピー側の index。 */
export function duplicateSel(notes: Note[], sel: Set<number>, offsetBeats: number): { notes: Note[]; selection: Set<number> } {
  const idx = [...sel].sort((a, b) => a - b);
  const copies = idx.map((i) => ({ ...notes[i]!, start: r3(notes[i]!.start + offsetBeats) }));
  const out = [...notes, ...copies];
  return { notes: out, selection: new Set(copies.map((_, k) => notes.length + k)) };
}

/** 選択を削除。 */
export function deleteSel(notes: Note[], sel: Set<number>): Note[] {
  return notes.filter((_, i) => !sel.has(i));
}

/** 選択をクリップボード用に抽出（min-start=0 に正規化＝貼付先の拍にそのまま乗る）。 */
export function copySel(notes: Note[], sel: Set<number>): Note[] {
  const picked = [...sel].sort((a, b) => a - b).map((i) => notes[i]!);
  if (!picked.length) return [];
  const min = Math.min(...picked.map((n) => n.start));
  return picked.map((n) => ({ ...n, start: r3(n.start - min) }));
}

/** クリップボードを atBeat に置いて末尾に追加。戻り selection は貼った側。 */
export function pasteNotes(notes: Note[], clip: Note[], atBeat: number): { notes: Note[]; selection: Set<number> } {
  const placed = clip.map((n) => ({ ...n, start: r3(n.start + atBeat) }));
  const out = [...notes, ...placed];
  return { notes: out, selection: new Set(placed.map((_, k) => notes.length + k)) };
}
