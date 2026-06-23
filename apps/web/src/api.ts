// 低次元データAPI（TS, docs/design.md #16）のクライアント。
// dev は vite proxy 経由(/api→:8787)。本番ビルドは api が同一オリジンで配信する(ルート直叩き)。
const BASE = (import.meta.env.VITE_API as string | undefined) ?? (import.meta.env.PROD ? "" : "/api");

export { KINDS } from "./kinds"; // SSOT＝kinds.ts（後方互換で api からも再公開）

export interface Neta {
  id: string;
  kind: string;
  title: string | null;
  text: string | null;
  content: unknown | null;
  key: number | null;
  mode: string | null;
  tempo: number | null;
  meter: string | null;
  bars: number | null;
  mood: string | null;
  scope?: "project" | "library"; // サーバは常に返す（テストの部分リテラル許容のため任意）
  tags: string[];
  created: string;
  updated: string;
}

export interface NetaInput {
  kind: string;
  title?: string;
  text?: string;
  content?: unknown;
  tags?: string[];
  /** どのジョブの結果か。指定すると job_result 記録＋ジョブ対象へ relation。 */
  from_job?: string;
}

// サーバ types.ts(NetaPatch=Partial<NetaInput>) と一致させる。mode/meter/scope が欠けていて
// NetaDialog が型に無い meter を送っていた（アーキ是正 S1）。
export interface NetaPatch {
  title?: string | null;
  text?: string | null;
  content?: unknown;
  key?: number | null;
  mode?: string | null;
  tempo?: number | null;
  meter?: string | null;
  bars?: number | null;
  mood?: string | null;
  scope?: "project" | "library";
  tags?: string[];
}

export interface Asset {
  id: string;
  kind: string;
  name: string | null;
  size: number | null;
  mime: string | null;
  created: string;
}

export interface SongOverlay {
  neta_id: string;
  stage: string | null;
  next_action: string | null;
  updated: string;
}

export interface Schedule {
  id: string;
  neta_id: string | null;
  intent: string;
  every_sec: number;
  enabled: boolean;
  last_run: string | null;
  next_run: string;
  created: string;
}

export interface Facets {
  kind: string[];
  mood: string[];
  meter: string[];
  key: number[];
  tags: string[];
}

export interface ListQuery {
  kind?: string;
  mood?: string;
  q?: string;
  tags?: string[];
  limit?: number;
  scope?: "project" | "library" | "all";
}

// サーバが応答したがエラー(4xx/5xx)。ネットワーク不達(fetch自体のreject)とは区別する。
export class ApiError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`${status} ${body}`);
    this.name = "ApiError";
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  // ボディがある時だけ content-type を付ける。空ボディ(DELETE等)に application/json を
  // 付けると Fastify が FST_ERR_CTP_EMPTY_JSON_BODY で 400 を返す（#63 削除できないの真因）。
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as T;
}

export const api = {
  createNeta: (input: NetaInput) =>
    http<Neta>("/neta", { method: "POST", body: JSON.stringify(input) }),

  updateNeta: (id: string, patch: NetaPatch) =>
    http<Neta>(`/neta/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteNeta: (id: string) =>
    http<{ deleted: boolean }>(`/neta/${id}`, { method: "DELETE" }),

  // ライブラリ→プロジェクトにコピー（複製汎用にも）。新規 project ネタが返る。
  copyNeta: (id: string) => http<Neta>(`/neta/${id}/copy`, { method: "POST" }),
  // scope 切替（自作を連想元へ＝library に移す等）。
  setScope: (id: string, scope: "project" | "library") =>
    http<Neta>(`/neta/${id}/scope`, { method: "POST", body: JSON.stringify({ scope }) }),

  listNeta: (q: ListQuery = {}) => {
    const p = new URLSearchParams();
    if (q.kind) p.set("kind", q.kind);
    if (q.mood) p.set("mood", q.mood);
    if (q.q) p.set("q", q.q);
    if (q.tags?.length) p.set("tags", q.tags.join(","));
    if (q.limit !== undefined) p.set("limit", String(q.limit));
    if (q.scope) p.set("scope", q.scope);
    const qs = p.toString();
    return http<Neta[]>(`/neta${qs ? `?${qs}` : ""}`);
  },

  facets: () => http<Facets>("/facets"),

  // #77 asset（SoundFont等のファイル資産）。アップロード/一覧/削除/配信URL。
  uploadAsset: async (file: File, kind = "soundfont") => {
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    // FormData は content-type を自分で付けてはいけない（boundary付与をブラウザに任せる）
    const res = await fetch(`${BASE}/asset`, { method: "POST", body: fd });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return (await res.json()) as Asset;
  },
  listAssets: (kind?: string) =>
    http<Asset[]>(`/assets${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`),
  deleteAsset: (id: string) => http<{ deleted: boolean }>(`/asset/${id}`, { method: "DELETE" }),
  assetUrl: (id: string) => `${BASE}/asset/${id}`,

  // #83 song overlay（段階／次の一手）＋ neta_asset（資産紐付け）
  getSong: (id: string) => http<SongOverlay>(`/neta/${id}/song`).catch(() => null),
  updateSong: (id: string, patch: { stage?: string | null; next_action?: string | null }) =>
    http<SongOverlay>(`/neta/${id}/song`, { method: "PATCH", body: JSON.stringify(patch) }),
  getNetaAssets: (id: string) => http<(Asset & { role: string })[]>(`/neta/${id}/assets`),
  linkAsset: (id: string, asset_id: string, role: "source" | "attachment" | "render" = "attachment") =>
    http<{ ok: boolean }>(`/neta/${id}/assets`, { method: "POST", body: JSON.stringify({ asset_id, role }) }),

  // #80 proactive 定期スケジューラ（継続研究/収集を見てない間に進める）
  listSchedules: (netaId?: string) =>
    http<Schedule[]>(`/schedules${netaId ? `?neta_id=${encodeURIComponent(netaId)}` : ""}`),
  addSchedule: (input: { neta_id?: string; intent?: "research" | "collect"; every_sec?: number }) =>
    http<Schedule>("/schedule", { method: "POST", body: JSON.stringify(input) }),
  deleteSchedule: (id: string) =>
    http<{ deleted: boolean }>(`/schedule/${id}`, { method: "DELETE" }),

  // #65 ハイブリッド検索（キーワード一致 ∪ 意味[較正ゲート]）。matchType: exact|semantic|both。
  search: (q: string, k = 20) =>
    http<(Neta & { matchType?: string })[]>(`/search?q=${encodeURIComponent(q)}&k=${k}`),

  createJob: (input: { intent: string; target_neta_id?: string; params?: unknown }) =>
    http<Job>("/job", { method: "POST", body: JSON.stringify(input) }),

  getJob: (id: string) => http<Job>(`/job/${id}`),

  // ジョブ＋子ジョブの決着（Chat がディスパッチ後もそのチャットで完了を待つため）。
  jobOutcome: (id: string) => http<JobOutcome>(`/job/${id}/outcome`),

  listJobs: (q: { status?: string } = {}) =>
    http<Job[]>(`/jobs${q.status ? `?status=${encodeURIComponent(q.status)}` : ""}`),

  // #85 S3: 文字列回答 or 構造化(フォーム)回答。構造化は枠(frame)へ畳まれる。
  answerJob: (id: string, answer: string | Record<string, unknown>) =>
    http<Job>(`/job/${id}/answer`, { method: "POST", body: JSON.stringify({ answer }) }),

  getNeta: (id: string) => http<Neta>(`/neta/${id}`),

  link: (from: string, to: string, type = "related") =>
    http<{ ok: boolean }>("/relation", {
      method: "POST",
      body: JSON.stringify({ from, to, type }),
    }),

  unlink: (from: string, to: string, type = "related") =>
    http<{ ok: boolean }>("/relation/remove", {
      method: "POST",
      body: JSON.stringify({ from, to, type }),
    }),

  getRelations: (id: string) =>
    http<{ type: string; neta: Neta | null }[]>(`/neta/${id}/relations`),

  getComposition: (id: string) => http<CompositionNode>(`/neta/${id}/composition`),

  placeChild: (parent: string, child: string, position = 0, ord = 0) =>
    http<{ ok: boolean }>("/compose", {
      method: "POST",
      body: JSON.stringify({ parent, child, position, ord }),
    }),

  removeChild: (parent: string, child: string, position?: number) =>
    http<{ ok: boolean }>("/compose/remove", {
      method: "POST",
      body: JSON.stringify({ parent, child, position }),
    }),

  // #70 Chat履歴の永続化（thread=対象ネタ id or 'global'）。保存/復元/クリア。
  listChatMessages: (thread: string) =>
    http<ChatMessage[]>(`/chat/${encodeURIComponent(thread)}/messages`),
  addChatMessage: (thread: string, msg: ChatMessageInput) =>
    http<ChatMessage>(`/chat/${encodeURIComponent(thread)}/message`, {
      method: "POST",
      body: JSON.stringify(msg),
    }),
  clearChatThread: (thread: string) =>
    http<{ cleared: boolean }>(`/chat/${encodeURIComponent(thread)}/messages`, {
      method: "DELETE",
    }),
  listChatThreads: () => http<ChatThread[]>(`/chat/threads`),
};

export interface ChatThread {
  thread: string;
  last: string;
  count: number;
  preview: string | null;
}

export interface ChatMessageInput {
  role: string;
  kind?: string | null;
  text?: string | null;
  data?: unknown;
}

export interface ChatMessage {
  id: string;
  thread: string;
  role: string;
  kind: string | null;
  text: string | null;
  data: unknown;
  created: string;
}

export interface CompositionNode {
  neta: Neta;
  children: { position: number; ord: number; node: CompositionNode }[];
}

export interface Job {
  id: string;
  intent: string;
  status: string;
  instruction?: string | null; // 依頼文（何を頼んだか）
  params?: Record<string, unknown> | null; // chat_thread / context 等
  target_neta_id?: string | null;
  result: { suggestions?: string } | Record<string, unknown> | null;
  error: string | null;
  notify_level?: string | null;
  question?: string | null;
  parent_job_id?: string | null;
  created?: string;
}

export interface JobOutcome {
  settled: boolean;
  failed: number;
  jobs: { id: string; intent: string; status: string }[];
  neta: Neta[];
}
