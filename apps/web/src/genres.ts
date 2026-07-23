// ジャンル→色/日本語ラベルの SSOT（design「### Task1h＝読み込みダイアログにジャンルの小アクセント」）。
// **色=kind の約束は崩さない**＝これはカード本体でなく「小さなジャンル色ドット＋ラベル」の二次エンコード専用。
// 配色は dataviz 検証済みカテゴリカル8色（light/dark）を土台に、全ジャンルへ固定割当。ラベルが常時併記される
// 二次エンコードなので厳密CVDは不要だが **各ジャンル固定・不変** が鉄則。8色で足りない分は調和色を足す
// （label があるので近接色は許容）。theme-aware＝CSS変数 `--genre-<key>`（kindColor と同じ作法・
// :root=dark 既定＋@media(prefers-color-scheme:light) で light 値＝base.css）。
// **未知/genre タグ無し＝ドット無し**（genreColor が空文字を返す＝呼び側は描画しない・fallback 色にしない）。
import { type Neta } from "./api";

// ジャンル→{ color: CSS変数キー, label: 日本語 }。ラベルは既存 chip 定数の日本語を流用＋不足を補完：
//  COMP_GENRE_CHIPS(useMelodyGen)＝ballad/rock/citypop/dance("4つ打ち")/folk、
//  BASS_GENRE_LABEL(TinkerSheet)＝rock/ballad/citypop/funk/edm/vocarock、
//  DRUM_GENRE_LABEL(TinkerSheet)＝jpop/rock/dance/ballad/funk。
const GENRE_META: Record<string, { color: string; label: string }> = {
  // — dataviz カテゴリカル8色（土台・各ジャンル固定・base.css の --genre-<key> と一致）—
  pop: { color: "blue", label: "ポップ" }, // 1 blue
  anison: { color: "green", label: "アニソン" }, // 2 green
  jpop: { color: "magenta", label: "J-POP" }, // 3 magenta
  funk: { color: "yellow", label: "ファンク" }, // 4 yellow
  citypop: { color: "aqua", label: "シティポップ" }, // 5 aqua
  dance: { color: "orange", label: "4つ打ち" }, // 6 orange
  ballad: { color: "violet", label: "バラード" }, // 7 violet
  rock: { color: "red", label: "ロック" }, // 8 red
  // — 追加の調和色（8色で足りない分・theme-aware・各ジャンル固定）—
  edm: { color: "cyan", label: "EDM" },
  vocarock: { color: "indigo", label: "ボカロック" },
  jazz: { color: "amber", label: "ジャズ" },
  gospel: { color: "plum", label: "ゴスペル" },
  folk: { color: "sage", label: "フォーク" },
  reggae: { color: "lime", label: "レゲエ" },
  metal: { color: "slate", label: "メタル" },
};

// ジャンル→ドット色の CSS 変数（SSOT・theme-aware）。未知/空＝""（＝呼び側はドットを出さない・fallback しない）。
export function genreColor(genre: string): string {
  const m = GENRE_META[genre];
  return m ? `var(--genre-${m.color})` : "";
}

// ジャンル→日本語ラベル。未知は原文をそのまま返す（保険・通常は未知＝ドットも出ないので不表示）。
export function genreLabel(genre: string): string {
  return GENRE_META[genre]?.label ?? genre;
}

// ネタの genre: タグ先頭（複数なら主要1つ）を剥がす。無ければ undefined（＝ドット無し）。
export function genreTagOf(neta: Neta): string | undefined {
  return neta.tags?.find((t) => t.startsWith("genre:"))?.slice("genre:".length) || undefined;
}

// scene:<role>（適用場面）→日本語ラベル（design「### Task1j」＝英語タグ値の生表示をやめる・データ駆動 scene 絞り用）。
// 語彙は L1 の scene:<role>（旧 roles）＝intro/verse/prechorus/chorus/bridge/interlude/outro。未知は原文（保険）。
const SCENE_LABEL: Record<string, string> = {
  intro: "イントロ",
  verse: "Aメロ",
  prechorus: "プレサビ",
  chorus: "サビ",
  bridge: "ブリッジ",
  interlude: "間奏",
  outro: "アウトロ",
};
export function sceneLabel(role: string): string {
  return SCENE_LABEL[role] ?? role;
}
