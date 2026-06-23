// ネタ種別レジストリ（SSOT・docs/design「アーキ是正 決定2」）。
// KINDS/FILTER_KINDS/MUSIC_KINDS/CONTAINER_KINDS/TEXT_KINDS/KIND_LABEL を**1表から導出**し、
// reference/knowledge 等の追加で6箇所を手当てする事故を断つ。
// （色割当 theme.ts:KINDS_COLORED は色順固定・レーン SectionEditor:LANES はレーン構造のため別管理。）
export interface KindDef {
  key: string;
  label: string;
  music?: boolean; // メロ/コード/ベース/リズム＝再生・音楽エディタ対象
  container?: boolean; // section/song＝合成コンテナ
  text?: boolean; // 自由文で捕獲する種別
  capturable?: boolean; // 捕獲メニューに出す（reference は取込専用＝出さない）
  filterable?: boolean; // 絞り込みドロップダウンに出す（other は出さない）
}

export const KIND_DEFS: readonly KindDef[] = [
  { key: "lyric", label: "歌詞", text: true, capturable: true, filterable: true },
  { key: "melody", label: "メロディ", music: true, capturable: true, filterable: true },
  { key: "bass", label: "ベース", music: true, capturable: true, filterable: true },
  { key: "chord", label: "コード", music: true, capturable: true, filterable: true },
  { key: "chord_progression", label: "コード進行", music: true, capturable: true, filterable: true },
  { key: "chord_pattern", label: "コード楽器", music: true, capturable: true, filterable: true },
  { key: "rhythm", label: "リズム", music: true, capturable: true, filterable: true },
  { key: "theme", label: "テーマ", text: true, capturable: true, filterable: true },
  { key: "section", label: "セクション", container: true, capturable: true, filterable: true },
  { key: "song", label: "曲", container: true, capturable: true, filterable: true },
  { key: "reference", label: "参考", filterable: true },
  { key: "knowledge", label: "知識", text: true, capturable: true, filterable: true },
  { key: "other", label: "その他", text: true, capturable: true },
] as const;

export const KINDS = KIND_DEFS.filter((d) => d.capturable).map((d) => d.key);
export const FILTER_KINDS = KIND_DEFS.filter((d) => d.filterable).map((d) => d.key);
export const MUSIC_KINDS = KIND_DEFS.filter((d) => d.music).map((d) => d.key);
export const CONTAINER_KINDS = KIND_DEFS.filter((d) => d.container).map((d) => d.key);
export const TEXT_KINDS = new Set(KIND_DEFS.filter((d) => d.text).map((d) => d.key));
export const KIND_LABEL: Record<string, string> = Object.fromEntries(KIND_DEFS.map((d) => [d.key, d.label]));
