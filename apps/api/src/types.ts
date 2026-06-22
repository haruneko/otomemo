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
  /** project=ユーザーの作業ネタ（既定）/ library=連想元コーパス（取込・過去作・参考曲）。 */
  scope: "project" | "library";
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
  scope?: "project" | "library"; // 既定 project
  tags?: string[];
  /** このネタがどのジョブの結果か。指定すると job_result に記録し、ジョブの対象へ relation を張る。 */
  from_job?: string | null;
}

export interface JobResult {
  neta_id: string;
  role: string;
}

/** ジョブとその子ジョブ全体の決着（Chat がワーカー完了を待つための一覧・#Chat待ち UX）。 */
export interface JobOutcome {
  settled: boolean; // 自分＋子ジョブが全て終端(done/failed)
  failed: number; // 失敗した子孫数
  jobs: { id: string; intent: string; status: string }[]; // 自分＋子（status 監視用）
  neta: Neta[]; // 自分＋子の job_result から集めた生成ネタ
}

export type NetaPatch = Partial<NetaInput>;

export interface ListQuery {
  kind?: string;
  mode?: string;
  meter?: string;
  mood?: string;
  key?: number;
  /** project（既定で省略時 project のみ）/ library / all（両方）。 */
  scope?: "project" | "library" | "all";
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

export interface JobInput {
  intent: string;
  target_neta_id?: string | null;
  instruction?: string | null;
  params?: unknown;
  level?: string;
  priority?: number;
  notify_level?: string | null;
}

export interface Job {
  id: string;
  target_neta_id: string | null;
  level: string;
  intent: string;
  instruction: string | null;
  params: unknown | null;
  status: string;
  priority: number;
  progress: string | null;
  notify_level: string | null;
  parent_job_id: string | null;
  question: string | null;
  /** parsed result_summary */
  result: unknown | null;
  error: string | null;
  created: string;
  updated: string;
}

export interface JobQuery {
  status?: string;
  target?: string;
  limit?: number;
}
