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

// NetaInput / ListQuery は zod の SSOT(schemas.ts)から導出（手書き重複を排す・design「アーキ是正 決定2」）。
export type { NetaInput, ListQuery } from "./schemas";

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

import type { NetaInput as _NetaInput } from "./schemas";
export type NetaPatch = Partial<_NetaInput>;

export interface Facets {
  kind: string[];
  mood: string[];
  meter: string[];
  key: number[];
  kindCounts: Record<string, number>; // kind→件数（kind と同じ母集団＝scope。窓に依らない権威。バッジ用）
  tags: string[]; // 意味タグ（prj: プロジェクトタグは除外）
  projects: string[]; // プロジェクト名（prj: を剥がしたもの）。複数プロジェクト（design「prj: 名前空間タグ」）
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
