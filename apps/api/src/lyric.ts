// 歌詞のモーラ数え＋メロへの流し込み＝**実体は @cm/music-core**（ここは再輸出だけ）。
//
// もとは web `lyrics.ts` と本ファイルに**同じ splitMora / flowLyric が2本**あった（design #31-2/#31-4）。
// 数え方と割付の規則が2箇所に散ると片方だけ直る事故が起きるので、実体を music-core の `lyric.ts` へ寄せ、
// 両側は再輸出に置き換えた（呼び側の import 面・挙動はどちらも変えない）。
//
// 注意（design #31-4 の線）：`splitMora` は**かな専用**。漢字仮名交じりの表記を渡すと漢字が1字1音に化ける
// （「雨の日は」→4／正しくは5）。表記のモーラ数の正は pyopenjtalk＝`accent.ts` 側。
// 注意（design #31-2）：`flowLyric` は**音符を作り替える**（モーラが多ければ音符を割る）。
// 音符を変えずに読みを写すだけなら music-core の `placeMoras` を使う。
export { splitMora, flowLyric, placeMoras, notesInRange, phraseStatus, isKanaOnly } from "@cm/music-core";
export type { LyricLayer, LyricPhrase, LyricReading, PhraseRange, PhraseStatus } from "@cm/music-core";

/** api 側の音符の形（channel 等の追加フィールドを素通しさせるため index signature 付き）。 */
export interface LNote {
  pitch: number;
  start: number;
  dur: number;
  vel?: number;
  syllable?: string;
  [k: string]: unknown;
}
