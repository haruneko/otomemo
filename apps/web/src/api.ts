// 低次元データAPI（TS, docs/design.md #16）のクライアント。
const BASE = (import.meta.env.VITE_API as string | undefined) ?? "/api";

export const KINDS = [
  "lyric",
  "melody",
  "chord",
  "chord_progression",
  "rhythm",
  "theme",
  "section",
  "song",
  "knowledge",
  "other",
] as const;

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

export interface NetaPatch {
  title?: string | null;
  text?: string | null;
  content?: unknown;
  key?: number | null;
  tempo?: number | null;
  bars?: number | null;
  mood?: string | null;
  tags?: string[];
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
  const res = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
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

  listNeta: (q: ListQuery = {}) => {
    const p = new URLSearchParams();
    if (q.kind) p.set("kind", q.kind);
    if (q.mood) p.set("mood", q.mood);
    if (q.q) p.set("q", q.q);
    if (q.tags?.length) p.set("tags", q.tags.join(","));
    const qs = p.toString();
    return http<Neta[]>(`/neta${qs ? `?${qs}` : ""}`);
  },

  facets: () => http<Facets>("/facets"),

  searchSemantic: (q: string, k = 20) =>
    http<(Neta & { score: number })[]>(`/search?q=${encodeURIComponent(q)}&k=${k}`),

  createJob: (input: { intent: string; target_neta_id?: string; params?: unknown }) =>
    http<Job>("/job", { method: "POST", body: JSON.stringify(input) }),

  getJob: (id: string) => http<Job>(`/job/${id}`),

  listJobs: (q: { status?: string } = {}) =>
    http<Job[]>(`/jobs${q.status ? `?status=${encodeURIComponent(q.status)}` : ""}`),

  answerJob: (id: string, answer: string) =>
    http<Job>(`/job/${id}/answer`, { method: "POST", body: JSON.stringify({ answer }) }),

  link: (from: string, to: string, type = "related") =>
    http<{ ok: boolean }>("/relation", {
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
};

export interface CompositionNode {
  neta: Neta;
  children: { position: number; ord: number; node: CompositionNode }[];
}

export interface Job {
  id: string;
  intent: string;
  status: string;
  result: { suggestions?: string } | Record<string, unknown> | null;
  error: string | null;
  notify_level?: string | null;
  question?: string | null;
  parent_job_id?: string | null;
  created?: string;
}
