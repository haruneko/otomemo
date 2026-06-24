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
import { AssetRepo, type Asset, type SongOverlay } from "./repo/asset-repo";
import { ScheduleRepo, type Schedule } from "./repo/schedule-repo";
import { ChatRepo, type ChatMessage } from "./repo/chat-repo";
import { RelationRepo } from "./repo/relation-repo";
import { ComposeRepo } from "./repo/compose-repo";
import { JobRepo } from "./repo/job-repo";
import { NetaRepo } from "./repo/neta-repo";

// prj 名前空間タグの判定は NetaRepo が持つ（facets/検索で使う）。従来 import 元(core)からも引けるよう再公開。
export { PROJECT_TAG_PREFIX, isProjectTag } from "./repo/neta-repo";

// repo に移した型を従来の import 元(core)からも引けるよう再公開（呼び出し側 無改修）。
export type { Asset, SongOverlay } from "./repo/asset-repo";
export type { Schedule } from "./repo/schedule-repo";
export type { ChatMessage } from "./repo/chat-repo";

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
    if (job?.target_neta_id) this.link(job.target_neta_id, netaId, "result");
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

  /** 合成ツリーを再帰取得（DAGなので訪問済みガードでサイクル防止）。compose辺＋neta ノードを束ねる。 */
  getComposition(id: string, seen = new Set<string>()): CompositionNode | null {
    const neta = this.getNeta(id);
    if (!neta) return null;
    if (seen.has(id)) return { neta, children: [] };
    seen.add(id);
    const children = this.compose
      .childEdges(id)
      .map((r) => ({ position: r.position, ord: r.ord, node: this.getComposition(r.child_id, seen) }))
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

  // --- ジョブ（投げて→進めて→受け取る。生産側）---

  enqueueJob(input: JobInput): Job {
    return this.job.enqueueJob(input);
  }
  getJob(id: string): Job | null {
    return this.job.getJob(id);
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
  updateSong(netaId: string, patch: { stage?: string | null; next_action?: string | null }): SongOverlay | null {
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
  listChatThreads(): { thread: string; last: string; count: number; preview: string | null }[] {
    return this.chat.listChatThreads();
  }
}

