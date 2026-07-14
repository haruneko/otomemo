// SectionEditor のレーン定義・尺定数・純関数（配置タイムラインの土台）。
// 巨大コンポの機械分割（負債D6）＝挙動不変。SectionEditor.tsx から切り出しただけ。
import type { CompositionNode } from "../api";

// 配置タイムライン（design #19）。section/song を メロ/コード/ベース/リズムの4レーン×小節 で組む。
// レーンは子の kind から導出（スキーマ変更なし）。レーン順＝層モデル（進行→メロ→コード楽器→ベース→リズム）。
export type LaneDef = { key: string; label: string; kinds: readonly string[]; row?: number };
export type Lane = LaneDef;
export type Child = CompositionNode["children"][number];

// #5 container kind でレーンを差し替え（宣言済み階層 Project⊃Song⊃section⊃leaf）。
// section＝パート専用（入れ子廃止）。song＝section を並べる編成（[section] のみ）。
const SECTION_LANES: readonly LaneDef[] = [
  { key: "chord", label: "コード進行", kinds: ["chord", "chord_progression"] },
  { key: "skeleton", label: "骨格", kinds: ["skeleton"] }, // design #20：コードとメロの間（合成無音・MiniRoll白玉）
  { key: "melody", label: "メロ", kinds: ["melody"] },
  { key: "counter", label: "対旋律", kinds: ["counter"] }, // WP-X3a：主メロの間まに入る第2声（melody相乗り・独立フェーダー）
  { key: "chord_pattern", label: "コード楽器1", kinds: ["chord_pattern"], row: 0 },
  { key: "chord_pattern2", label: "コード楽器2", kinds: ["chord_pattern"], row: 1 },
  { key: "bass", label: "ベース", kinds: ["bass"] },
  { key: "rhythm", label: "リズム", kinds: ["rhythm"] },
];
const SONG_LANES: readonly LaneDef[] = [
  { key: "section", label: "セクション", kinds: ["section"] }, // song は section を時間順に並べる
];
export const lanesForKind = (kind: string): readonly LaneDef[] => (kind === "song" ? SONG_LANES : SECTION_LANES);
export const MIN_BARS = 8;
const SECTION_MAX_BARS = 32; // section 尺の上限（1ブロック＝Aメロ/サビ等）
const SONG_MAX_BARS = 64; // song 尺の上限（section を複数並べる編成）
export const maxBarsForKind = (kind: string): number => (kind === "song" ? SONG_MAX_BARS : SECTION_MAX_BARS);

// ピッカー種別タブの色＝作成タイルと揃える（種別色）。chord_pattern は chord 色。
export const LANE_COLOR: Record<string, string> = {
  chord: "var(--k-chord)",
  skeleton: "var(--k-skeleton)",
  melody: "var(--k-melody)",
  counter: "var(--k-counter)",
  chord_pattern: "var(--k-chord)",
  chord_pattern2: "var(--k-chord)",
  bass: "var(--k-bass)",
  rhythm: "var(--k-rhythm)",
  section: "var(--k-section)",
};
// MIDIトラック名は ASCII に（@tonejs/midi は名前を Latin-1 で書く＝日本語だと DAW で文字化け）。
export const LANE_MIDI_NAME: Record<string, string> = {
  chord: "Chord",
  skeleton: "Skeleton", // 合成無音＝書き出しトラックには乗らない（notes空で filter される）
  melody: "Melody",
  counter: "Counter",
  chord_pattern: "Keys 1",
  chord_pattern2: "Keys 2",
  bass: "Bass",
  rhythm: "Drums",
  section: "Section",
};

// ③ ループ伸ばしのタイル位置＝元ブロック(fromPos)の後ろに unit 刻みで反復。
// 各コピー p は「ドラッグがその**中点(p+unit/2)を過ぎた**」＝半分まで引いたら確定（p+unit/2<endBeat）。
// かつ「コピー全体がグリッド total に収まる(p+unit<=total)」こと。
export function loopPositions(fromPos: number, unit: number, endBeat: number, total: number): number[] {
  const out: number[] = [];
  if (unit <= 0) return out;
  for (let p = fromPos + unit; p + unit <= total + 1e-6; p += unit) {
    if (p + unit / 2 >= endBeat - 1e-6) break; // まだ中点まで引いてない＝置かない
    out.push(Math.round(p * 1e6) / 1e6);
  }
  return out;
}

// 区間 [aPos,aPos+aDur) と [bPos,bPos+bDur) が重なるか（端が接するだけは重なり無し）。
// 配置/ループの重複ガード＝「点」でなく「尺」で判定＝マルチ小節ネタのはみ出し重複を防ぐ（純関数=テスト対象）。
export function spanOverlaps(aPos: number, aDur: number, bPos: number, bDur: number): boolean {
  return aPos < bPos + bDur - 1e-6 && bPos < aPos + aDur - 1e-6;
}
