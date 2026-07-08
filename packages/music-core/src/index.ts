// @cm/music-core — 不変の音楽知識だけを api/web で共有する SSOT（負債D3・design 決定2b）。
// ここに置くのは「移調不変・アプリ非依存の音楽定数と純粋派生」のみ。DB/Fastify/Tone/MCP など
// アプリ固有の依存やロジック（相対bass解決・生成器・Note型）は**持ち込まない**（結合を最小に）。

/** ピッチクラス(0-11)の音名。旧 web `PITCH_NAMES` / api `KEY_NAMES` の同一配列を1本化。
 *  型は既存に合わせ `string[]`（web の `PITCH_NAMES.indexOf(root: string)` 等の互換のため as const にしない）。 */
export const PITCH_NAMES: string[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * コード品質 → ルートからの半音インターバル（C基準・度数はルートから上向き）。
 * 旧 api `theory.ts` と web `music.ts` の QUALITY_INTERVALS（34品質・完全一致）を1本化。
 * 9系は 9度=14→pc2 のようにテンションも pc 正しく積める。property test（chord-quality）で担保。
 */
export const QUALITY_INTERVALS: Record<string, number[]> = {
  // 三和音
  "": [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  // 7th
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10], // ハーフディミニッシュ
  dim7: [0, 3, 6, 9], // フルディミニッシュ7
  aug7: [0, 4, 8, 10], // =7#5
  "7b5": [0, 4, 6, 10],
  mM7: [0, 3, 7, 11], // m(maj7)
  "7sus4": [0, 5, 7, 10],
  // 6th
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  // テンション（9系は 9度=14→pc2）
  "9": [0, 4, 7, 10, 2],
  maj9: [0, 4, 7, 11, 2],
  m9: [0, 3, 7, 10, 2],
  add9: [0, 4, 7, 2],
  "69": [0, 4, 7, 9, 2], // 6/9
  m69: [0, 3, 7, 9, 2],
  // altered / extended dominant
  "7b9": [0, 4, 7, 10, 1],
  "7#9": [0, 4, 7, 10, 3],
  "7#11": [0, 4, 7, 10, 6],
  "13": [0, 4, 7, 10, 2, 9],
  "11": [0, 4, 7, 10, 2, 5],
  m11: [0, 3, 7, 10, 2, 5],
  m13: [0, 3, 7, 10, 2, 9],
  maj13: [0, 4, 7, 11, 2, 9],
  "maj7#11": [0, 4, 7, 11, 6],
};

const PC_BY_NAME: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** root を 0-11 ピッチクラスへ。int はそのまま、"C#"/"Db" 等の音名（#♯/b♭ 複数可）も解釈。 */
export function normRoot(root: number | string): number {
  if (typeof root === "number") return ((Math.trunc(root) % 12) + 12) % 12;
  const s = String(root).trim();
  if (!s) return 0;
  let base = PC_BY_NAME[s[0]!.toUpperCase()] ?? 0;
  for (const ch of s.slice(1)) {
    if (ch === "#" || ch === "♯") base++;
    else if (ch === "b" || ch === "♭") base--;
  }
  return ((base % 12) + 12) % 12;
}

// 品質エイリアス（表記ゆれ→QUALITY_INTERVALS の正準キー）。2026-07-08 総点検：未知品質が黙って
// メジャートライアドに落ち「min7」等のマイナーコードがメジャー化していた（旧: メロ側のスケール∩コード
// スナップで偶然隠蔽＝コード音優先スナップ化で露出）。
const QUALITY_ALIASES: Record<string, string> = {
  min: "m", min7: "m7", mi: "m", mi7: "m7", "-": "m", "-7": "m7",
  M7: "maj7", "△": "maj7", "△7": "maj7", Maj7: "maj7",
  "°": "dim", "°7": "dim7", o: "dim", o7: "dim7", "ø": "m7b5", "ø7": "m7b5",
  "+": "aug", minmaj7: "mM7", mmaj7: "mM7", "m(maj7)": "mM7",
};

/** コードの構成ピッチクラス（0-11）。エイリアス解決→未知 quality は短調系接頭ならマイナー、他はメジャートライアド扱い。 */
export function chordPcs(root: number | string, quality: string): number[] {
  const r = normRoot(root);
  const q = quality ?? "";
  const alias = QUALITY_ALIASES[q];
  const ivals =
    QUALITY_INTERVALS[q] ??
    (alias !== undefined ? QUALITY_INTERVALS[alias] : undefined) ??
    (/^(m|min|dim)/.test(q) && !/^maj/i.test(q) ? [0, 3, 7] : [0, 4, 7]);
  return ivals.map((i) => (r + i) % 12);
}
