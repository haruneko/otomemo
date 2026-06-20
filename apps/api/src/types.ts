// データモデル（docs/design.md #14/#16）。
// すべては「ネタ」。tempo/拍子/調は section/song が持ち、断片では任意ヒント。

export interface Neta {
  id: string;
  kind: string;
  title: string | null;
  /** 音楽的中身（音符/コード/リズム、Cキー基準）。非音楽は null。 */
  content: unknown | null;
  /** 歌詞・自由文。 */
  text: string | null;
  /** 調のヒント（ピッチクラス 0-11）。section/song では確定値。 */
  key: number | null;
  mode: string | null;
  tempo: number | null;
  meter: string | null;
  bars: number | null;
  mood: string | null;
  tags: string[];
  created: string;
  updated: string;
}

export interface NetaInput {
  kind: string;
  title?: string | null;
  content?: unknown;
  text?: string | null;
  key?: number | null;
  mode?: string | null;
  tempo?: number | null;
  meter?: string | null;
  bars?: number | null;
  mood?: string | null;
  tags?: string[];
}

export type NetaPatch = Partial<NetaInput>;

export interface ListQuery {
  kind?: string;
  mode?: string;
  meter?: string;
  mood?: string;
  key?: number;
  /** すべて一致するタグ。 */
  tags?: string[];
  /** title/text への部分一致（意味検索は S3）。 */
  q?: string;
  limit?: number;
  offset?: number;
}

export interface Facets {
  kind: string[];
  mood: string[];
  meter: string[];
  key: number[];
  tags: string[];
}

export interface CompositionNode {
  neta: Neta;
  children: { position: number; ord: number; node: CompositionNode }[];
}

export interface Relation {
  to: string;
  type: string;
}
