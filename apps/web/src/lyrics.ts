import type { Note } from "./music";

// 歌詞まわりの純関数は `@cm/music-core` の `lyric.ts` に1本化した（#31・2026-07-29）。
// もとは web のこのファイルと api `lyric.ts` に splitMora / moraLines / flowLyric が**同じものが2本**あった。
// ここは呼び側の import を変えないための再輸出＝実体は music-core にある。
//
// ⚠ 上位の設計（design #31・requirements「歌詞を書く」・architecture 同日追記）は**オーナー未レビュー**。
//    歌詞の置き場も案(い)の**仮置き**＝確定ではない。
//
// 注意（design §31-4 の線）：`splitMora` / `moraLines` は**かな専用**。漢字仮名交じりの表記を渡すと
// 漢字が1字1音に化ける（「雨の日は」が4／正しくは5）。かな以外が混ざる行に音数を出さないための判定が
// `isKanaOnly`、画面に出す数の出し分けが `moraLinesForDisplay`（音数か文字数かをここで決める）。
// 表記から正しい読みを取るのはメロ側の句＝`POST /music/reading`（api.readings）。
export {
  splitMora,
  moraLines,
  moraLinesForDisplay,
  isKanaOnly,
  flowLyric,
  placeMoras,
  notesInRange,
  phraseStatus,
  isReadingStale,
  readingOf,
  effectiveReading,
} from "@cm/music-core";
export type { LyricLayer, LyricPhrase, LyricReading, LyricEdit, PhraseRange, PhraseStatus } from "@cm/music-core";

// ── 詞モード（1音ずつリタッチ）＝流し込み(一括)との分業。純関数（PianoRoll の歌詞編集モードが使う）。 ──

/** idx の音符の syllable を差し替える。空/空白のみ＝クリア（undefined）。「ー」＝メリスマもそのまま通す。非破壊。 */
export function setSyllable(notes: Note[], idx: number, val: string): Note[] {
  const s = val.trim();
  return notes.map((n, i) => (i === idx ? { ...n, syllable: s ? s : undefined } : n));
}

/**
 * 時間順（start昇順・同時は配列順）で idx の「次の音符」の配列インデックスを返す。無ければ null。
 * 詞モードの「確定で次の音符へ自動フォーカス」＝連続リタッチの足。
 */
export function nextNoteIndex(notes: { start: number }[], idx: number): number | null {
  if (idx < 0 || idx >= notes.length) return null;
  const order = notes.map((_, i) => i).sort((a, b) => notes[a]!.start - notes[b]!.start || a - b);
  const pos = order.indexOf(idx);
  if (pos < 0 || pos + 1 >= order.length) return null;
  return order[pos + 1]!;
}
