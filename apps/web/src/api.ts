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
  key?: number;
  mode?: string;
  tempo?: number;
  meter?: string;
  bars?: number;
  mood?: string;
  scope?: "project" | "library";
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

// プロジェクト配下ファイル（asset＋紐づき先ネタ）。器のファイル集約の戻り（S2）。
export interface ProjectFile extends Asset {
  attachedTo: { netaId: string; title: string | null; kind: string; role: string }[];
}

// プロジェクト実体（器の説明＋AIへの指示）。未設定時は description/instructions が null。
export interface Project {
  name: string;
  description: string | null;
  instructions: string | null;
  created: string | null;
  updated: string | null;
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
  kindCounts: Record<string, number>; // kind→件数（kind と同じ母集団＝scope=project・library除外。窓に依らない権威）
  tags: string[]; // 意味タグ（prj: 除外済）
  projects: string[]; // prj: を剥がしたプロジェクト名一覧（複数プロジェクト機能）
}

export interface ListQuery {
  kind?: string;
  mood?: string;
  q?: string;
  tags?: string[];
  limit?: number;
  scope?: "project" | "library" | "all";
  orderProject?: string; // 手動並べ替え(neta_order)の適用対象。未指定=既定 updated 順。
  unassigned?: boolean; // true=どの器にも属さない(prj: タグ無し)ネタだけ。
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

// ネットワーク不達（サーバ停止/オフライン＝fetch 自体の reject）。ApiError(=サーバが応答した
// 4xx/5xx) とは別物として扱える型。生の TypeError を表に出さず、どのパスで落ちたか文脈を載せる。
export class NetworkError extends Error {
  constructor(
    public path: string,
    cause: unknown,
  ) {
    super(`network error on ${path}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "NetworkError";
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  // ボディがある時だけ content-type を付ける。空ボディ(DELETE等)に application/json を
  // 付けると Fastify が FST_ERR_CTP_EMPTY_JSON_BODY で 400 を返す（#63 削除できないの真因）。
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch (e) {
    throw new NetworkError(`${init?.method ?? "GET"} ${path}`, e); // 不達は文脈付きで投げ直す
  }
  if (!res.ok) throw new ApiError(res.status, await res.text());
  try {
    return (await res.json()) as T;
  } catch (e) {
    // 2xx だが本文が非JSON（HTMLエラーページ等）＝サーバ契約違反。生 SyntaxError を出さない。
    throw new ApiError(res.status, `invalid JSON from ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export const api = {
  createNeta: (input: NetaInput) =>
    http<Neta>("/neta", { method: "POST", body: JSON.stringify(input) }),

  // keepalive: リロード/タブ閉じ(beforeunload)でも自動保存を落とさない（unmount時のフラッシュ用）。
  updateNeta: (id: string, patch: NetaPatch, opts?: { keepalive?: boolean }) =>
    http<Neta>(`/neta/${id}`, { method: "PATCH", body: JSON.stringify(patch), keepalive: opts?.keepalive }),

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
    if (q.orderProject !== undefined) p.set("orderProject", q.orderProject);
    if (q.unassigned) p.set("unassigned", "true");
    const qs = p.toString();
    return http<Neta[]>(`/neta${qs ? `?${qs}` : ""}`);
  },

  // 手動並べ替えの保存（被せ表 neta_order・design LV-A）。project='' はプロジェクト未指定バケツ。
  reorderNeta: (project: string, ids: string[]) =>
    http<{ ok: true }>(`/neta/reorder`, { method: "POST", body: JSON.stringify({ project, ids }) }),

  // 器への出し入れ（P3）＝prj: タグの addTag/removeTag（他タグ非破壊）。member=false で取り出す。
  assignProject: (id: string, project: string, member = true) =>
    http<Neta>(`/neta/${id}/project`, { method: "POST", body: JSON.stringify({ project, member }) }),

  facets: () => http<Facets>("/facets"),

  // #9 コードから調(key+mode)候補を推定（section/コード進行の調を「宣言」する補助）。
  detectKeyFromChords: (chords: unknown[]) =>
    http<{ candidates: { key: number; mode: "major" | "minor"; score: number }[] }>(
      "/music/detect_key_chords",
      { method: "POST", body: JSON.stringify({ chords }) },
    ),

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

  // ♪汎用歌唱（仮歌＝メロの楽器）：絶対拍のメロ notes＋bpm＋歌詞を VOICEVOX で歌わせ wav asset を作る（リンクしない）。
  // （旧 singNeta＝ネタ単体♪歌うボタン用は撤去。単体/Section とも本 sing を useVocalRender 経由で共用＝入れ方の一本化。
  //   ネタ紐付け歌唱は MCP verb sing_neta が /neta/:id/sing を担うため api 側エンドポイントは残置＝web からは未使用。）
  // 返り＝{assetId, shift(音域移調 半音), clamped(丸めた音数), leadRestSec(#13c 先頭休符長 秒＝仮歌カウントイン量 SSOT)}。
  // 同一入力は既存 asset 再利用（自然キャッシュ）。
  sing: (notes: { pitch: number; start: number; dur: number; syllable?: string }[], bpm: number, speaker?: number) =>
    http<{ assetId: string; shift: number; clamped: number; speaker: number; leadRestSec: number }>("/sing", {
      method: "POST",
      body: JSON.stringify({ notes, bpm, ...(speaker != null ? { speaker } : {}) }),
    }),

  // #83 song overlay（段階／次の一手）＋ neta_asset（資産紐付け）
  getSong: (id: string) => http<SongOverlay>(`/neta/${id}/song`).catch(() => null),
  updateSong: (id: string, patch: { stage?: string | null; next_action?: string | null }) =>
    http<SongOverlay>(`/neta/${id}/song`, { method: "PATCH", body: JSON.stringify(patch) }),
  getNetaAssets: (id: string) => http<(Asset & { role: string })[]>(`/neta/${id}/assets`),
  // プロジェクト＝一曲(or組曲)の器：配下ネタに紐づくファイルを器単位で集約（S2）。
  listProjectFiles: (project: string) =>
    http<ProjectFile[]>(`/projects/${encodeURIComponent(project)}/files`),
  // プロジェクト実体（器の説明＋AIへの指示）。未設定でも name だけ返る。
  // プロジェクト名一覧（prj:タグ ∪ project行＝空の器も含む）。picker のソース。
  listProjectNames: () => http<string[]>(`/projects`),
  // ピッカーのチップ用件数（P1）＝すべて/未仕分け/器別。
  getProjectCounts: () =>
    http<{ all: number; unassigned: number; projects: { name: string; count: number }[] }>(
      `/project-counts`,
    ),
  // プロジェクト配下のジョブ（投げて受け取る）をワークスペースに可視化。
  listProjectJobs: (project: string) =>
    http<Job[]>(`/projects/${encodeURIComponent(project)}/jobs`),
  getProject: (name: string) => http<Project>(`/projects/${encodeURIComponent(name)}`),
  setProject: (name: string, meta: { description?: string | null; instructions?: string | null }) =>
    http<Project>(`/projects/${encodeURIComponent(name)}`, { method: "POST", body: JSON.stringify(meta) }),
  // 器を削除（所属タグを外す＝ネタは残す・未仕分けへ／説明・指示 overlay を消す）。返り＝未仕分けに戻った数。
  deleteProject: (name: string) =>
    http<{ unassigned: number }>(`/projects/${encodeURIComponent(name)}`, { method: "DELETE" }),
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
  // #65 ハイブリッド検索。semanticOk=false は cm-search 不通で keyword-only に劣化＝UIで告知。
  search: (q: string, k = 20) =>
    http<{ items: (Neta & { matchType?: string })[]; semanticOk: boolean }>(
      `/search?q=${encodeURIComponent(q)}&k=${k}`,
    ),

  // #20 ピッカーおすすめ＝コーパス(library)から拍子/調で関連数件だけ（生1781を選ばせない）。
  recommend: (kind: string, opts: { meter?: string; key?: number; top?: number } = {}) => {
    const p = new URLSearchParams({ kind });
    if (opts.meter) p.set("meter", opts.meter);
    if (opts.key != null) p.set("key", String(opts.key));
    if (opts.top != null) p.set("top", String(opts.top));
    return http<Neta[]>(`/neta/recommend?${p.toString()}`);
  },

  createJob: (input: { intent: string; target_neta_id?: string; params?: unknown }) =>
    http<Job>("/job", { method: "POST", body: JSON.stringify(input) }),

  getJob: (id: string) => http<Job>(`/job/${id}`),

  // #100④-S6 ジョブ削除：死にジョブを消す。実行中(research/audio)なら実プロセスも殺す（killed）。
  deleteJob: (id: string) => http<{ deleted: boolean; killed: boolean }>(`/job/${id}`, { method: "DELETE" }),

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

  // 作曲補助①（単体系・決定的＝Claude不要/クォータ0）。崩す＝提示メロのノリを保ち強度に応じ
  // ピッチ/輪郭を崩した別メロを生成（gen_from_essence）。返り＝items[0].content が新メロ content。
  reshapeMelody: (body: { ref: unknown; frame: unknown; strength: number; seed?: number }) =>
    http<{ items: { kind: string; content: unknown; label: string }[] }>(
      "/music/gen_from_essence",
      { method: "POST", body: JSON.stringify(body) },
    ),

  // 作曲補助②（文脈系）：決定的音楽オペの汎用窓口。返りは op ごとに違う（gen_*={items}、
  // fit_to_chords={notes,after}、analyze_fit={score,…}）ので呼び出し側でキャスト。
  music: <T = unknown>(op: string, body: Record<string, unknown>) =>
    http<T>(`/music/${op}`, { method: "POST", body: JSON.stringify(body) }),

  // 一式生成（決定的・純TS＝worker/クォータ不要）。frame(調/テンポ/拍子)から section＋各パートを
  // 即生成し compose して返す。旧カードの gen_* ジョブ経路（worker 依存でハング）の置き換え。
  genSection: (body: {
    frame: { key?: number; tempo?: number | null; meter?: string | null };
    parts?: string[];
    seed?: number;
    title?: string;
    tags?: string[];
  }) =>
    http<{ section: Neta; composition: CompositionNode }>("/gen/section", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // 似たメロ（①道具・retrieval）：提示メロに近いメロを scope(既定 library=連想元)から近い順。
  melodyNeighbors: (body: { notes: unknown; scope?: string; top?: number; id?: string }) =>
    http<{ neighbors: { id?: string; label?: string; similarity: number }[] }>("/melody/neighbors", {
      method: "POST",
      body: JSON.stringify(body),
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
  // セッションごと削除（履歴＋器への所属）。/messages は履歴だけ消す別物。
  deleteChatThread: (thread: string) =>
    http<{ deleted: boolean }>(`/chat/${encodeURIComponent(thread)}`, { method: "DELETE" }),
  // プロジェクト指定時はその器に束ねたセッションのみ。未指定＝全フリーChat。
  listChatThreads: (project?: string | null) =>
    http<ChatThread[]>(`/chat/threads${project ? `?project=${encodeURIComponent(project)}` : ""}`),
  // 会話セッションを器（プロジェクト）に束ねる／タイトル付与（upsert・部分更新）。
  setChatThread: (thread: string, meta: { project?: string | null; title?: string | null }) =>
    http<{ ok: boolean }>(`/chat/${encodeURIComponent(thread)}/meta`, {
      method: "POST",
      body: JSON.stringify(meta),
    }),

  // #100④-S3：常駐 claude へ1ターン送り、stream-json イベントを SSE で受けて onEvent へ流す。
  // 旧 createJob+ポーリングを置換（脳は Claude＝記憶/多ターン/ツール選択をネイティブに）。
  chatTurnStream: async (
    thread: string,
    text: string,
    onEvent: (e: unknown) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/chat/${encodeURIComponent(thread)}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal,
      });
    } catch (e) {
      throw new NetworkError(`POST /chat/${thread}/turn`, e);
    }
    if (!res.ok || !res.body) throw new ApiError(res.status, await res.text().catch(() => ""));
    await readSse(res, onEvent);
  },

  // ★再アタッチ（2026-07-05）：走行中ターンを**途中から**購読する（チャットを閉じて開き直した時）。
  // 走行中ターンが無ければサーバは即 done を返す＝onEvent は呼ばれずすぐ解決（no-op）。脳は持たない。
  chatTurnLiveStream: async (
    thread: string,
    onEvent: (e: unknown) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/chat/${encodeURIComponent(thread)}/turn/live`, { signal });
    } catch (e) {
      throw new NetworkError(`GET /chat/${thread}/turn/live`, e);
    }
    if (!res.ok || !res.body) throw new ApiError(res.status, await res.text().catch(() => ""));
    await readSse(res, onEvent);
  },

  // 走行中ターンの有無（UI が再アタッチ要否を判断する用）。
  chatTurnStatus: (thread: string) =>
    http<{ live: boolean }>(`/chat/${encodeURIComponent(thread)}/turn/status`),

  // ★停止：走行中の claude ターンを落とす（部分テキストはサーバが履歴に残す）。
  chatTurnStop: (thread: string) =>
    http<{ stopped: boolean }>(`/chat/${encodeURIComponent(thread)}/turn/stop`, { method: "POST" }),
};

// SSE レスポンスを1フレーム（`\n\n` 区切り）ずつ読み、`data: ` 行の JSON を onEvent へ。
async function readSse(res: Response, onEvent: (e: unknown) => void): Promise<void> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("data: ")) {
          try { onEvent(JSON.parse(line.slice(6))); } catch { /* 非JSON行は無視 */ }
        }
      }
    }
  }
}

export interface ChatThread {
  thread: string;
  last: string | null;
  count: number;
  preview: string | null;
  project: string | null;
  title: string | null;
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
  progress?: string | null; // #99 実況：agentic が今なにしてるか（「メロを作ってる」等）
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
