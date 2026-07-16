import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  Neta,
  NetaInput,
  NetaPatch,
  ListQuery,
  Facets,
  CompositionNode,
  Relation,
  Job,
  JobInput,
  JobQuery,
  JobResult,
  JobOutcome,
} from "./types";
import { reapResults } from "./reaper";
import { tickSchedules } from "./scheduler";
import { now } from "./repo/util";
import { AssetRepo, type Asset, type SongOverlay, type SongLoop } from "./repo/asset-repo";
import { ScheduleRepo, type Schedule } from "./repo/schedule-repo";
import { ChatRepo, type ChatMessage } from "./repo/chat-repo";
import { ProjectRepo, type Project } from "./repo/project-repo";
import { RelationRepo } from "./repo/relation-repo";
import { ComposeRepo } from "./repo/compose-repo";
import { JobRepo } from "./repo/job-repo";
import { NetaRepo, PROJECT_TAG_PREFIX } from "./repo/neta-repo";

// prj 名前空間タグの判定は NetaRepo が持つ（facets/検索で使う）。従来 import 元(core)からも引けるよう再公開。
export { PROJECT_TAG_PREFIX, isProjectTag } from "./repo/neta-repo";

// プロジェクト配下ファイル（asset＋紐づき先ネタ）。器＝一曲(or組曲)のファイル集約の戻り（S2）。
export interface ProjectFile extends Asset {
  attachedTo: { netaId: string; title: string | null; kind: string; role: string }[];
}

// repo に移した型を従来の import 元(core)からも引けるよう再公開（呼び出し側 無改修）。
export type { Asset, SongOverlay, SongLoop } from "./repo/asset-repo";
export type { Schedule } from "./repo/schedule-repo";
export type { ChatMessage } from "./repo/chat-repo";
export type { Project } from "./repo/project-repo";

/**
 * 操作コア（docs/design.md #20 ツールカタログ）。
 * これが HTTP API ＝ MCP ツール ＝ 実装すべき操作の集合。
 * 消費者ロジック（reap=生成結果のネタ化）は reaper.ts に分離（design「アーキ是正 決定3」）。
 */
export class Core {
  // 合成ルート（#6）：集約ごとの repo を保持。新コードは core.asset 等の名前空間APIを使える。
  // 既存の フラットAPI(core.addAsset 等) は下で repo へ委譲＝呼び出し側 無改修（回帰ゼロ）。
  readonly asset: AssetRepo;
  readonly schedule: ScheduleRepo;
  readonly chat: ChatRepo;
  readonly project: ProjectRepo;
  readonly relation: RelationRepo;
  readonly compose: ComposeRepo;
  readonly job: JobRepo;
  readonly neta: NetaRepo;
  // db は同一パッケージの reaper/scheduler から読む（readonly＝外部からは書けない）。
  constructor(readonly db: Database.Database) {
    this.neta = new NetaRepo(db);
    this.asset = new AssetRepo(db);
    this.schedule = new ScheduleRepo(db);
    this.chat = new ChatRepo(db);
    this.project = new ProjectRepo(db);
    this.relation = new RelationRepo(db);
    this.compose = new ComposeRepo(db);
    this.job = new JobRepo(db);
  }

  // --- neta：データ系は NetaRepo へ委譲。createNeta(原子化+job_resultマーカー)/copyNeta(compose再帰)は
  //     集約跨ぎの orchestration なので Core 残置＝repo の primitive を組み合わせる（#6）---
  createNeta(input: NetaInput): Neta {
    const id = randomUUID();
    const ts = now();
    // 原子化：neta 行＋タグ＋job_result マーカーを1トランザクションに（部分失敗で「マーカー無しネタ」が
    // 残り次の reap が重複生成する事故を断つ・design「アーキ是正 決定3」）。
    this.db.transaction(() => {
      this.neta.insertRow(id, input, ts);
      for (const t of input.tags ?? []) this.neta.addTag(id, t);
      if (input.from_job) this.recordJobResult(input.from_job, id);
    })();
    return this.neta.getNeta(id)!;
  }

  /** ネタを複製（既定 project へ・子孫も deep copy）。library を使う＝project にコピー（元は不変）。
   * section/song は子(compose_edge)も再帰コピー。同じ子の使い回し(#54)はメモで1コピー＝関係を保つ。 */
  copyNeta(id: string, scope: "project" | "library" = "project"): Neta | null {
    const memo = new Map<string, string>(); // 元id→コピーid（共有childは1回・循環も安全に止まる）
    const copyRec = (srcId: string): string | null => {
      const cached = memo.get(srcId);
      if (cached) return cached;
      const src = this.neta.getNeta(srcId);
      if (!src) return null;
      const made = this.createNeta({
        kind: src.kind,
        title: src.title,
        content: src.content,
        text: src.text,
        key: src.key,
        mode: src.mode,
        tempo: src.tempo,
        meter: src.meter,
        bars: src.bars,
        mood: src.mood,
        scope,
        tags: src.tags.filter((t) => t !== "取込"), // ライブラリ由来マーカーは引き継がない
      });
      memo.set(srcId, made.id);
      for (const e of this.compose.childEdges(srcId)) {
        const childNew = copyRec(e.child_id);
        if (childNew) this.compose.placeChild(made.id, childNew, e.position, e.ord);
      }
      return made.id;
    };
    const newId = copyRec(id);
    return newId ? this.neta.getNeta(newId) : null;
  }

  /** 浅い分家（vary＝変奏の一級化・design「分家モデル」S2・kind 非依存）。
   * copyNeta との差は1点＝**子を deep copy しない**：compose_edge を同 child_id/position/ord で複製し
   * 子ネタ実体は元と参照共有する（サビの進行を直せば全サビに効く＝オーバーレイ機構）。
   * リーフ（辺ゼロ）は for が空回りするだけで「content コピー＋variant_of」に自然に成る＝kind 分岐を作らない。
   * 元との系譜＝`relation_edge(variant_of)` を **新→元** に1本張る（「同じものとして育てる」の宣言・copy_neta＝別物とはここで別れる）。
   * title 既定＝「元title′」（分家の A′ 表示に乗る）。frame/role/tags は元をコピー＝分家側で自由に変える起点。 */
  varyNeta(id: string, opts: { title?: string; scope?: "project" | "library" } = {}): Neta | null {
    const src = this.neta.getNeta(id);
    if (!src) return null;
    const scope = opts.scope ?? src.scope ?? "project";
    const made = this.createNeta({
      kind: src.kind,
      title: opts.title ?? (src.title ? `${src.title}′` : undefined),
      content: src.content,
      text: src.text,
      key: src.key,
      mode: src.mode,
      tempo: src.tempo,
      meter: src.meter,
      bars: src.bars,
      mood: src.mood,
      scope,
      tags: src.tags, // role: 等もコピー＝分家側で自由に変える起点（copyNeta と違い「取込」は分家で使わない前提＝残しても無害）
    });
    // 子は**参照共有**＝辺だけ同 position/ord で複製（子ネタ実体はコピーしない）。リーフは辺ゼロ＝この for は空。
    for (const e of this.compose.childEdges(id)) this.compose.placeChild(made.id, e.child_id, e.position, e.ord);
    this.relation.link(made.id, id, "variant_of"); // 系譜＝新→元（A′ の親を辿れる）
    return this.neta.getNeta(made.id);
  }

  setScope(id: string, scope: "project" | "library"): Neta | null {
    return this.neta.setScope(id, scope);
  }

  /** ジョブの結果として作られた neta を job_result に記録し、ジョブの対象へ relation を張る（design #16/原則3）。 */
  private recordJobResult(jobId: string, netaId: string): void {
    const ord =
      (this.db.prepare(`SELECT COUNT(*) c FROM job_result WHERE job_id = ?`).get(jobId) as {
        c: number;
      }).c;
    this.db
      .prepare(`INSERT INTO job_result (job_id, neta_id, ord, role) VALUES (?, ?, ?, 'result')`)
      .run(jobId, netaId, ord);
    const job = this.db.prepare(`SELECT target_neta_id FROM job WHERE id = ?`).get(jobId) as
      | { target_neta_id: string | null }
      | undefined;
    // 対象ネタが既に削除済だと relation_edge の FK に弾かれ、materialize 全体(createNeta の tx)が
    // ロールバック→reap が毎tick 無限リトライになる。存在する時だけ関連付ける（結果ネタ自体は必ず残す）。
    if (job?.target_neta_id && this.neta.getNeta(job.target_neta_id)) this.link(job.target_neta_id, netaId, "result");
  }

  // --- job：CRUD は JobRepo へ委譲。jobOutcome/reapResults は neta/reaper 跨ぎ＝Core 残置（#6）---
  getJobResults(jobId: string): JobResult[] {
    return this.job.getJobResults(jobId);
  }

  /**
   * ジョブとその子ジョブ全体の決着を返す（Chat がディスパッチ後もそのチャットで完了を待てるように）。
   * settled = 自分＋子が全て終端(done/failed)。neta = 自分＋子の job_result から集めた生成ネタ。
   * plan の子（parent_job_id=自分）と、items を reap した自分自身、の両方を1度に拾える。
   */
  jobOutcome(jobId: string): JobOutcome {
    const ids = [jobId];
    const children = this.db
      .prepare(`SELECT id FROM job WHERE parent_job_id = ? ORDER BY created`)
      .all(jobId) as { id: string }[];
    for (const ch of children) ids.push(ch.id);

    const jobs: { id: string; intent: string; status: string }[] = [];
    let failed = 0;
    let pending = 0;
    for (const id of ids) {
      const j = this.getJob(id);
      if (!j) continue;
      jobs.push({ id: j.id, intent: j.intent, status: j.status });
      if (j.status === "failed") failed++;
      else if (j.status !== "done") pending++;
    }
    const neta: Neta[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      for (const r of this.getJobResults(id)) {
        if (r.neta_id && !seen.has(r.neta_id)) {
          const n = this.getNeta(r.neta_id);
          if (n) (neta.push(n), seen.add(r.neta_id));
        }
      }
    }
    return { settled: pending === 0, failed, jobs, neta };
  }

  /**
   * 生成ジョブの結果をネタ化する（done の gen_* で job_result がまだ無く中身があるもの）。
   * - plan の子（parent_job_id 有り）：即ネタ化（クライアントが受け取らないので）。
   * - 親なし（NetaCard の同期生成）：通常はクライアントが createNeta(from_job) で受け取るので触らない。
   *   ただし一定時間(120s)経っても未受領なら、クライアントが落ちた等とみなし回収（漏れ防止）。
   * これで二重作成のレースを避けつつ「投げて放置→受け取る」の取りこぼしも無くす。
   */
  /** 受け取り（reap）：生成結果のネタ化。消費者ロジックは reaper.ts に分離（Core は委譲のみ）。 */
  reapResults(): number {
    return reapResults(this);
  }

  getNeta(id: string): Neta | null {
    return this.neta.getNeta(id);
  }
  updateNeta(id: string, patch: NetaPatch): Neta | null {
    return this.neta.updateNeta(id, patch);
  }
  deleteNeta(id: string): boolean {
    return this.neta.deleteNeta(id);
  }
  addTag(netaId: string, name: string): void {
    this.neta.addTag(netaId, name);
  }
  removeTag(netaId: string, name: string): void {
    this.neta.removeTag(netaId, name);
  }
  listNeta(q: ListQuery = {}): Neta[] {
    return this.neta.listNeta(q);
  }
  reorderNeta(project: string, orderedIds: string[]): void {
    this.neta.reorderNeta(project, orderedIds);
  }
  similarMelodies(
    notes: { pitch: number; start?: number; dur?: number }[],
    scope: "project" | "library" | "all" = "library",
    top = 5,
    excludeId?: string,
  ): { id?: string; label?: string; similarity: number }[] {
    return this.neta.similarMelodies(notes, scope, top, excludeId);
  }
  facets(scope: "project" | "library" | "all" = "project"): Facets {
    return this.neta.facets(scope);
  }

  // --- compose：辺操作は ComposeRepo へ委譲。getComposition は neta ノードを組む横断サービス（#6）---
  placeChild(parentId: string, childId: string, position = 0, ord = 0): void {
    this.compose.placeChild(parentId, childId, position, ord);
  }
  removeChild(parentId: string, childId: string, position?: number): void {
    this.compose.removeChild(parentId, childId, position);
  }

  /** 共有検出（分家の安全弁・design「copy-on-write」S2）：このネタが何箇所で配置されているか。
   * parents＝親ごとの配置 position 群・placementCount＝総配置数（同親2配置以上も数える＝反復も「共有」）。
   * web はこれで「n箇所で使われています」バッジ／分家プロンプトを出す（placementCount>=2 で共有）。 */
  placementsOf(childId: string): { parents: { parentId: string; positions: number[] }[]; placementCount: number } {
    const edges = this.compose.parentEdges(childId);
    const byParent = new Map<string, number[]>();
    for (const e of edges) (byParent.get(e.parent_id) ?? byParent.set(e.parent_id, []).get(e.parent_id)!).push(e.position);
    const parents = [...byParent].map(([parentId, positions]) => ({ parentId, positions }));
    return { parents, placementCount: edges.length };
  }

  /** 合成ツリーを再帰取得（DAGなので訪問済みガードでサイクル防止）。compose辺＋neta ノードを束ねる。 */
  // ancestors＝**今たどっている経路（先祖）** のみ。真の循環(先祖に自分)だけ止め、
  // 同じネタの**繰り返し配置**(section を song でループ等＝DAG)は各所で完全に展開する。
  // ※旧実装は横断全体で1つの seen を共有＝2個目以降の同一ネタが children:[] になり
  //   合成(再生)で無音・伸ばしたsectionが鳴らないバグの原因だった。
  getComposition(id: string, ancestors = new Set<string>()): CompositionNode | null {
    const neta = this.getNeta(id);
    if (!neta) return null;
    if (ancestors.has(id)) return { neta, children: [] }; // 循環（先祖に自分）だけ打ち切る
    const next = new Set(ancestors).add(id); // この経路の先祖に自分を足す（枝ごとに独立）
    const children = this.compose
      .childEdges(id)
      .map((r) => ({ position: r.position, ord: r.ord, node: this.getComposition(r.child_id, next) }))
      .filter((c): c is { position: number; ord: number; node: CompositionNode } => c.node !== null);
    return { neta, children };
  }

  // --- relation：RelationRepo へ委譲（#6）---
  link(fromId: string, toId: string, type = "related"): void {
    this.relation.link(fromId, toId, type);
  }
  unlink(fromId: string, toId: string, type = "related"): void {
    this.relation.unlink(fromId, toId, type);
  }
  getRelations(id: string): Relation[] {
    return this.relation.getRelations(id);
  }
  // 逆向きの連関（このネタを to に持つ from 側）。骨格→表面化済みメロの見える化に使う（design #20）。
  getBacklinks(id: string, type?: string): { from: string; type: string }[] {
    return this.relation.getBacklinks(id, type);
  }

  // --- ジョブ（投げて→進めて→受け取る。生産側）---

  enqueueJob(input: JobInput): Job {
    return this.job.enqueueJob(input);
  }
  getJob(id: string): Job | null {
    return this.job.getJob(id);
  }
  // P2：処理後に params から base64 音源を除去（asset へ保存済み前提・design#16）。
  stripJobAudio(id: string): void {
    this.job.stripAudioParams(id);
  }
  // api 内 consumer（research 実行器）用：claim(queued→running)/complete(done+result)/fail。
  claimQueued(intents: string[]): Job | null {
    return this.job.claimQueued(intents);
  }
  completeJob(id: string, result: unknown): void {
    this.job.completeJob(id, result);
  }
  failJob(id: string, error: string): void {
    this.job.failJob(id, error);
  }
  deleteJob(id: string): boolean {
    return this.job.deleteJob(id);
  }
  askQuestion(jobId: string, question: string): Job | null {
    return this.job.askQuestion(jobId, question);
  }
  answerJob(jobId: string, answer: string | Record<string, unknown>): Job | null {
    return this.job.answerJob(jobId, answer);
  }
  healthStats(): { queued: number; running: number; failed: number; oldestQueuedAgeSec: number | null } {
    return this.job.healthStats();
  }
  listJobs(q: JobQuery = {}): Job[] {
    return this.job.listJobs(q);
  }

  // --- asset / song / neta_asset：AssetRepo へ委譲（#6。新コードは core.asset を直接使ってよい）---
  addAsset(input: Parameters<AssetRepo["addAsset"]>[0]): Asset {
    return this.asset.addAsset(input);
  }
  listAssets(kind?: string): Asset[] {
    return this.asset.listAssets(kind);
  }
  getAsset(id: string): Asset | null {
    return this.asset.getAsset(id);
  }
  deleteAsset(id: string): boolean {
    return this.asset.deleteAsset(id);
  }
  updateSong(
    netaId: string,
    patch: { stage?: string | null; next_action?: string | null; loop?: SongLoop | null },
  ): SongOverlay | null {
    return this.asset.updateSong(netaId, patch);
  }
  getSong(netaId: string): SongOverlay | null {
    return this.asset.getSong(netaId);
  }
  linkAsset(netaId: string, assetId: string, role = "attachment"): boolean {
    return this.asset.linkAsset(netaId, assetId, role);
  }
  unlinkAsset(netaId: string, assetId: string, role?: string): boolean {
    return this.asset.unlinkAsset(netaId, assetId, role);
  }
  getNetaAssets(netaId: string): (Asset & { role: string })[] {
    return this.asset.getNetaAssets(netaId);
  }

  // プロジェクト＝一曲(or組曲)の器：配下ネタ(prj: タグ)に紐づくファイルを器単位で集約（集約跨ぎ＝Core 残置・#6）。
  // 同一 asset が複数ネタに紐づく場合は1件に畳み、attachedTo に紐づき先（ネタ＋role）を列挙。
  listProjectFiles(project: string): ProjectFile[] {
    const tag = PROJECT_TAG_PREFIX + project;
    const rows = this.db
      .prepare(
        `SELECT na.asset_id AS asset_id, na.role AS role,
                n.id AS neta_id, n.title AS neta_title, n.kind AS neta_kind
         FROM neta_tag nt
         JOIN tag t        ON t.id = nt.tag_id AND t.name = @tag
         JOIN neta n       ON n.id = nt.neta_id
         JOIN neta_asset na ON na.neta_id = n.id
         JOIN asset a      ON a.id = na.asset_id
         ORDER BY a.created DESC, na.asset_id`,
      )
      .all({ tag }) as Record<string, unknown>[];
    const byAsset = new Map<string, ProjectFile>();
    for (const r of rows) {
      const aid = r.asset_id as string;
      let f = byAsset.get(aid);
      if (!f) {
        const asset = this.asset.getAsset(aid);
        if (!asset) continue;
        f = { ...asset, attachedTo: [] };
        byAsset.set(aid, f);
      }
      f.attachedTo.push({
        netaId: r.neta_id as string,
        title: (r.neta_title as string) ?? null,
        kind: r.neta_kind as string,
        role: r.role as string,
      });
    }
    return [...byAsset.values()];
  }

  // --- schedule（#80 proactive: 見てない間に継続研究/収集を進める）---
  // --- schedule：CRUD は ScheduleRepo へ委譲。tickSchedules(期日→enqueue) は集約跨ぎ＝Core 残置（#6）---
  addSchedule(input: Parameters<ScheduleRepo["addSchedule"]>[0]): Schedule {
    return this.schedule.addSchedule(input);
  }
  getSchedule(id: string): Schedule | null {
    return this.schedule.getSchedule(id);
  }
  listSchedules(netaId?: string): Schedule[] {
    return this.schedule.listSchedules(netaId);
  }
  setScheduleEnabled(id: string, enabled: boolean): boolean {
    return this.schedule.setScheduleEnabled(id, enabled);
  }
  deleteSchedule(id: string): boolean {
    return this.schedule.deleteSchedule(id);
  }
  /** 期日スケジュールから継続調査ジョブを enqueue。駆動ロジックは scheduler.ts に分離（委譲のみ）。 */
  tickSchedules(): number {
    return tickSchedules(this);
  }

  // --- chat（#70 Chat履歴）：ChatRepo へ委譲 ---
  addChatMessage(input: Parameters<ChatRepo["addChatMessage"]>[0]): ChatMessage {
    return this.chat.addChatMessage(input);
  }
  listChatMessages(thread: string, limit = 200): ChatMessage[] {
    return this.chat.listChatMessages(thread, limit);
  }
  clearChatThread(thread: string): void {
    this.chat.clearChatThread(thread);
  }
  deleteChatThread(thread: string): void {
    this.chat.deleteChatThread(thread);
  }
  setChatThread(input: Parameters<ChatRepo["setChatThread"]>[0]): void {
    this.chat.setChatThread(input);
  }
  listChatThreads(project?: string | null): ReturnType<ChatRepo["listChatThreads"]> {
    return this.chat.listChatThreads(project);
  }
  // スレッドが属す器（プロジェクト名）。未束ね＝null（指示注入の引き当てに使う）。
  getChatThreadProject(thread: string): string | null {
    const row = this.db.prepare(`SELECT project FROM chat_thread WHERE thread=?`).get(thread) as
      | { project: string | null }
      | undefined;
    return row?.project ?? null;
  }

  // プロジェクト名の一覧＝prj:タグを持つネタ ∪ project行（説明だけ作った空の器も拾う＝picker到達可能に）。
  listProjectNames(): string[] {
    const prefix = PROJECT_TAG_PREFIX;
    const tagRows = this.db
      .prepare(
        `SELECT DISTINCT t.name AS name FROM tag t
         JOIN neta_tag nt ON nt.tag_id = t.id
         WHERE t.name LIKE @like`,
      )
      .all({ like: prefix + "%" }) as { name: string }[];
    const tableRows = this.db.prepare(`SELECT name FROM project`).all() as { name: string }[];
    const names = new Set<string>();
    for (const r of tagRows) names.add(r.name.slice(prefix.length));
    for (const r of tableRows) names.add(r.name);
    return [...names].sort((a, b) => a.localeCompare(b, "ja"));
  }

  // ピッカーのチップ用（P1）＝すべて/未仕分け/器別の件数。器の中身の量を一目に。
  projectCounts(): { all: number; unassigned: number; projects: { name: string; count: number }[] } {
    const like = PROJECT_TAG_PREFIX + "%";
    const all = (this.db.prepare(`SELECT COUNT(*) AS c FROM neta WHERE scope='project'`).get() as { c: number }).c;
    const unassigned = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS c FROM neta n WHERE n.scope='project' AND NOT EXISTS
             (SELECT 1 FROM neta_tag nt JOIN tag t ON t.id=nt.tag_id
              WHERE nt.neta_id=n.id AND t.name LIKE @like)`,
        )
        .get({ like }) as { c: number }
    ).c;
    const rows = this.db
      .prepare(
        `SELECT t.name AS name, COUNT(*) AS c FROM tag t
           JOIN neta_tag nt ON nt.tag_id=t.id
           JOIN neta n ON n.id=nt.neta_id AND n.scope='project'
           WHERE t.name LIKE @like GROUP BY t.name`,
      )
      .all({ like }) as { name: string; c: number }[];
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.name.slice(PROJECT_TAG_PREFIX.length), r.c);
    // 空の器（説明だけ作った project 行）も 0 件で含める＝picker 到達可能。
    for (const r of this.db.prepare(`SELECT name FROM project`).all() as { name: string }[])
      if (!map.has(r.name)) map.set(r.name, 0);
    const projects = [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
    return { all, unassigned, projects };
  }

  // プロジェクト配下ネタを対象にしたジョブ一覧（ワークスペースの「投げて受け取る」可視化）。
  listProjectJobs(project: string): Job[] {
    return this.job.listForProjectTag(PROJECT_TAG_PREFIX + project);
  }

  // --- project（器の説明＋AIへの指示）：ProjectRepo へ委譲 ---
  getProject(name: string): Project | null {
    return this.project.getProject(name);
  }
  // 器を削除＝所属タグ(prj:name)を全ネタから外す（ネタは残る＝未仕分けへ）＋説明/指示 overlay を消す。
  // ネタ自体は消さない（破壊的でない）。返り＝未仕分けに戻ったネタ数。空の器も row 削除で消える。
  deleteProject(name: string): { unassigned: number } {
    const tag = PROJECT_TAG_PREFIX + name;
    const ids = this.db
      .prepare(`SELECT nt.neta_id AS id FROM neta_tag nt JOIN tag t ON t.id=nt.tag_id WHERE t.name=?`)
      .all(tag) as { id: string }[];
    this.db.transaction(() => {
      for (const { id } of ids) this.neta.removeTag(id, tag);
      this.project.deleteProject(name);
    })();
    return { unassigned: ids.length };
  }
  setProject(name: string, patch: { description?: string | null; instructions?: string | null }): Project {
    return this.project.setProject(name, patch);
  }
}

