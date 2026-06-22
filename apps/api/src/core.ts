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

const now = (): string => new Date().toISOString();

/**
 * 操作コア（docs/design.md #20 ツールカタログ）。
 * これが HTTP API ＝ MCP ツール ＝ 実装すべき操作の集合。
 */
function hasMusic(content: unknown): boolean {
  const c = content as {
    notes?: unknown[];
    chords?: unknown[];
    pattern?: unknown[]; // 相対bass(mode:"relative")は notes/chords を持たず度数 pattern を持つ
    rhythm?: { lanes?: { hits?: unknown[] }[] };
  } | null;
  if (!c) return false;
  if (Array.isArray(c.notes)) return c.notes.length > 0;
  if (Array.isArray(c.chords)) return c.chords.length > 0;
  if (Array.isArray(c.pattern)) return c.pattern.length > 0; // 相対bass を reap で落とさない
  if (c.rhythm?.lanes) return c.rhythm.lanes.some((l) => (l.hits?.length ?? 0) > 0);
  return false;
}

/**
 * #85 S1 枠（frame）抽出：ジョブ params の `frame` を生成ネタに付ける値へ。
 * 断片に付ける key/meter/tempo/bars/mood は #14 の「ヒント」（配置時は section/song が権威）。
 * 型に合うものだけ拾い、未指定は付けない（既存の null 既定を壊さない）。
 */
type FrameVals = Partial<Pick<NetaInput, "key" | "meter" | "tempo" | "bars" | "mood">>;
// 音名→ピッチクラス（Claudeが key を "C"/"Am" 等の文字列で渡す揺れを吸収）。
const KEY_NAME_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function keyToPc(k: unknown): number | undefined {
  if (typeof k === "number" && k >= 0 && k <= 11) return k;
  if (typeof k === "string" && k) {
    let pc = KEY_NAME_PC[k[0]!.toUpperCase()];
    if (pc === undefined) return undefined;
    for (const ch of k.slice(1)) {
      if (ch === "#" || ch === "♯") pc += 1;
      else if (ch === "b" || ch === "♭") pc -= 1;
    }
    return ((pc % 12) + 12) % 12;
  }
  return undefined;
}
function frameVals(frame: unknown): FrameVals {
  if (!frame || typeof frame !== "object") return {};
  const f = frame as Record<string, unknown>;
  const out: FrameVals = {};
  const k = keyToPc(f.key);
  if (k !== undefined) out.key = k;
  const meter = f.meter ?? f.time_signature; // time_signature 別名も許容
  if (typeof meter === "string" && meter) out.meter = meter;
  if (typeof f.tempo === "number" && f.tempo > 0) out.tempo = f.tempo;
  if (typeof f.bars === "number" && f.bars > 0) out.bars = Math.round(f.bars);
  if (typeof f.mood === "string" && f.mood) out.mood = f.mood;
  return out;
}
function frameOf(paramsJson: string | null): FrameVals {
  try {
    return frameVals((JSON.parse(paramsJson ?? "{}") as { frame?: unknown }).frame);
  } catch {
    return {};
  }
}

export class Core {
  constructor(private db: Database.Database) {}

  createNeta(input: NetaInput): Neta {
    const id = randomUUID();
    const ts = now();
    // 原子化：neta 行＋タグ＋job_result マーカーを1トランザクションに（部分失敗で「マーカー無しネタ」が
    // 残り次の reap が重複生成する事故を断つ・design「アーキ是正 決定3」）。
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO neta (id, kind, title, content, text, "key", mode, tempo, meter, bars, mood, scope, created, updated)
           VALUES (@id, @kind, @title, @content, @text, @key, @mode, @tempo, @meter, @bars, @mood, @scope, @created, @updated)`,
        )
        .run({
          id,
          kind: input.kind,
          title: input.title ?? null,
          content: input.content == null ? null : JSON.stringify(input.content),
          text: input.text ?? null,
          key: input.key ?? null,
          mode: input.mode ?? null,
          tempo: input.tempo ?? null,
          meter: input.meter ?? null,
          bars: input.bars ?? null,
          mood: input.mood ?? null,
          scope: input.scope ?? "project", // 既定 project（新規キャプチャ/生成は作業ネタ）
          created: ts,
          updated: ts,
        });
      for (const t of input.tags ?? []) this.addTag(id, t);
      if (input.from_job) this.recordJobResult(input.from_job, id);
    })();
    return this.getNeta(id)!;
  }

  /** ネタを複製（既定 project へ・子孫も deep copy）。library を使う＝project にコピー（元は不変）。
   * section/song は子(compose_edge)も再帰コピー。同じ子の使い回し(#54)はメモで1コピー＝関係を保つ。 */
  copyNeta(id: string, scope: "project" | "library" = "project"): Neta | null {
    const memo = new Map<string, string>(); // 元id→コピーid（共有childは1回・循環も安全に止まる）
    const copyRec = (srcId: string): string | null => {
      const cached = memo.get(srcId);
      if (cached) return cached;
      const src = this.getNeta(srcId);
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
      const edges = this.db
        .prepare(`SELECT child_id, position, ord FROM compose_edge WHERE parent_id = ? ORDER BY ord, position`)
        .all(srcId) as { child_id: string; position: number; ord: number }[];
      for (const e of edges) {
        const childNew = copyRec(e.child_id);
        if (childNew) this.placeChild(made.id, childNew, e.position, e.ord);
      }
      return made.id;
    };
    const newId = copyRec(id);
    return newId ? this.getNeta(newId) : null;
  }

  /** ネタの scope を切替（自作を連想元にする＝library へ移す等）。 */
  setScope(id: string, scope: "project" | "library"): Neta | null {
    if (!this.getNeta(id)) return null;
    this.db.prepare(`UPDATE neta SET scope = ?, updated = ? WHERE id = ?`).run(scope, now(), id);
    return this.getNeta(id);
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

  getJobResults(jobId: string): JobResult[] {
    return this.db
      .prepare(`SELECT neta_id, role FROM job_result WHERE job_id = ? ORDER BY ord`)
      .all(jobId) as JobResult[];
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
  reapResults(): number {
    const kindOf: Record<string, string> = {
      gen_melody: "melody",
      gen_chord: "chord_progression",
      gen_rhythm: "rhythm",
    };
    // #67 生成ネタの表示名：指示文があればそれ、無ければ種類の日本語ラベル（生kindを出さない）。
    const labelOf: Record<string, string> = {
      gen_melody: "メロ案",
      gen_chord: "コード案",
      gen_rhythm: "リズム案",
    };
    const genTitle = (intent: string, instruction: string | null): string => {
      const first = (instruction ?? "").trim().split(/\r?\n/)[0]?.trim() ?? "";
      return first ? first.slice(0, 24) : (labelOf[intent] ?? "案");
    };
    const staleBefore = new Date(Date.now() - 120_000).toISOString();
    const rows = this.db
      .prepare(
        `SELECT j.id, j.intent, j.instruction, j.params, j.result_summary AS result
         FROM job j
         WHERE j.status='done' AND j.intent IN ('gen_melody','gen_chord','gen_rhythm')
           AND (j.parent_job_id IS NOT NULL OR j.updated < ?)
           AND NOT EXISTS (SELECT 1 FROM job_result r WHERE r.job_id = j.id)`,
      )
      .all(staleBefore) as {
      id: string;
      intent: string;
      instruction: string | null;
      params: string | null;
      result: string | null;
    }[];
    let n = 0;
    for (const r of rows) {
      let content: unknown;
      try {
        content = (JSON.parse(r.result ?? "{}") as { content?: unknown }).content;
      } catch {
        continue;
      }
      if (!hasMusic(content)) continue;
      this.createNeta({
        kind: kindOf[r.intent]!,
        title: genTitle(r.intent, r.instruction),
        content,
        from_job: r.id,
        ...frameOf(r.params), // #85 S1 枠を生成ネタへ（断片のヒントとして key/meter/tempo/bars）
      });
      n += 1;
    }

    // #9/#82 参考曲・収集エージェント：research/collect の結果（references 非空）を reference
    // ネタとして回収。gen_* と同じガード（parent有り＝plan子は即時／単独は120s未受領で回収）。
    const refRows = this.db
      .prepare(
        `SELECT j.id, j.result_summary AS result
         FROM job j
         WHERE j.status='done' AND j.intent IN ('research','collect')
           AND (j.parent_job_id IS NOT NULL OR j.updated < ?)
           AND NOT EXISTS (SELECT 1 FROM job_result r WHERE r.job_id = j.id)`,
      )
      .all(staleBefore) as { id: string; result: string | null }[];
    for (const r of refRows) {
      let parsed: { summary?: string; references?: unknown[] };
      try {
        parsed = JSON.parse(r.result ?? "{}") as { summary?: string; references?: unknown[] };
      } catch {
        continue;
      }
      if (!Array.isArray(parsed.references) || parsed.references.length === 0) continue;
      this.createNeta({
        kind: "reference",
        title: "参考曲",
        text: parsed.summary ?? "",
        content: { summary: parsed.summary ?? "", references: parsed.references },
        from_job: r.id,
      });
      n += 1;
    }

    // #81 MIDI取り込み：done の import_midi の result.tracks を melody/rhythm ネタに分割materialize。
    // web は自分でネタ化しない（投げて受け取る）ので stale ガード無しで即回収。
    const midiRows = this.db
      .prepare(
        `SELECT j.id, j.result_summary AS result FROM job j
         WHERE j.status='done' AND j.intent='import_midi'
           AND NOT EXISTS (SELECT 1 FROM job_result r WHERE r.job_id = j.id)`,
      )
      .all() as { id: string; result: string | null }[];
    for (const r of midiRows) {
      let tracks: { kind?: string; title?: string; content?: unknown }[] = [];
      try {
        tracks = (JSON.parse(r.result ?? "{}") as { tracks?: typeof tracks }).tracks ?? [];
      } catch {
        tracks = [];
      }
      let made = false;
      for (const t of tracks) {
        if (!t || !t.kind || !hasMusic(t.content)) continue;
        this.createNeta({
          kind: t.kind,
          title: t.title ?? "取り込み",
          content: t.content,
          from_job: r.id,
        });
        made = true;
        n += 1;
      }
      // 何も作れなくても再reapしないよう空マーカーを記録（二重処理防止）。
      if (!made) {
        this.db
          .prepare(`INSERT INTO job_result (job_id, neta_id, ord, role) VALUES (?, NULL, 0, 'empty')`)
          .run(r.id);
      }
    }

    // #85 S2a 構造化生成（gen_variations）：done の {items, edges} を一括 materialize。
    // items を配列順にネタ化し idx→neta_id を作る。container(section/song)は hasMusic 対象外で
    // null化しない。edges は両端が非null の時だけ compose_edge/relation_edge を張る（指摘2）。
    const containerKind = new Set(["section", "song"]);
    const structRows = this.db
      .prepare(
        `SELECT j.id, j.params, j.result_summary AS result FROM job j
         WHERE j.status='done'
           AND ( j.intent IN ('gen_variations','gen_chords_rule','gen_pair_rule','fit_to_chords','fetch','transform','gen_lyric')
                 OR (j.intent='consult' AND json_extract(j.result_summary,'$.type')='items') )
           AND NOT EXISTS (SELECT 1 FROM job_result r WHERE r.job_id = j.id)`,
      )
      .all() as { id: string; params: string | null; result: string | null }[];
    for (const r of structRows) {
      type Item = { kind?: string; content?: unknown; text?: string; label?: string; frame?: unknown };
      type Edge = { type?: string; from?: number; to?: number; position?: number };
      let items: Item[] = [];
      let edges: Edge[] = [];
      try {
        const p = JSON.parse(r.result ?? "{}") as { items?: Item[]; edges?: Edge[] };
        items = Array.isArray(p.items) ? p.items : [];
        edges = Array.isArray(p.edges) ? p.edges : [];
      } catch {
        items = [];
        edges = [];
      }
      const jobFrame = frameOf(r.params);
      // ジョブ単位トランザクション：items を作りながら idMap を組む途中で失敗しても、この job の
      // ネタ生成・辺・マーカーを丸ごとロールバック（壊れた idMap で edge が刺さる/部分生成を断つ）。
      // try で1 job の失敗が reap 全体(=他job)を止めないように（poison job 隔離）。次tickで再試行。
      let localMade = 0;
      try {
        this.db.transaction(() => {
          localMade = 0;
          const idMap: (string | null)[] = [];
          for (const it of items) {
            const kind = it?.kind;
            const isContainer = kind != null && containerKind.has(kind);
            const hasText = typeof it?.text === "string" && it.text.trim() !== "";
            // container(中身は edges)／音楽 content ／テキスト(歌詞等) のいずれかが在れば materialize。
            if (!kind || (!isContainer && !hasMusic(it.content) && !hasText)) {
              idMap.push(null); // index を保持して詰めない（edge の参照を壊さない）
              continue;
            }
            const neta = this.createNeta({
              kind,
              title: it.label ?? "案",
              content: it.content ?? null,
              text: it.text ?? null,
              from_job: r.id,
              ...jobFrame,
              ...frameVals(it.frame), // item 個別 frame が上書き
            });
            idMap.push(neta.id);
            localMade += 1;
          }
          for (const e of edges) {
            const from = typeof e?.from === "number" ? idMap[e.from] : null;
            const to = typeof e?.to === "number" ? idMap[e.to] : null;
            if (!from || !to) continue;
            if (e.type === "compose") {
              try {
                this.placeChild(from, to, e.position ?? 0, e.position ?? 0);
              } catch {
                /* 循環等は無視（reap を止めない） */
              }
            } else this.link(from, to, "related");
          }
          if (localMade === 0) {
            this.db
              .prepare(`INSERT INTO job_result (job_id, neta_id, ord, role) VALUES (?, NULL, 0, 'empty')`)
              .run(r.id);
          }
        })();
        n += localMade;
      } catch {
        /* この job はロールバック済。job_result 未挿入なので次tickで再試行（部分状態を残さない）。 */
      }
    }
    return n;
  }

  getNeta(id: string): Neta | null {
    const row = this.db.prepare(`SELECT * FROM neta WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToNeta(row) : null;
  }

  updateNeta(id: string, patch: NetaPatch): Neta | null {
    if (!this.getNeta(id)) return null;
    const sets: string[] = [];
    const params: Record<string, unknown> = { id, updated: now() };
    const set = (col: string, val: unknown) => {
      sets.push(`${col} = @${col.replace(/"/g, "")}`);
      params[col.replace(/"/g, "")] = val;
    };
    if (patch.kind !== undefined) set("kind", patch.kind);
    if (patch.title !== undefined) set("title", patch.title);
    if (patch.content !== undefined)
      set("content", patch.content == null ? null : JSON.stringify(patch.content));
    if (patch.text !== undefined) set("text", patch.text);
    if (patch.key !== undefined) set(`"key"`, patch.key);
    if (patch.mode !== undefined) set("mode", patch.mode);
    if (patch.tempo !== undefined) set("tempo", patch.tempo);
    if (patch.meter !== undefined) set("meter", patch.meter);
    if (patch.bars !== undefined) set("bars", patch.bars);
    if (patch.mood !== undefined) set("mood", patch.mood);
    sets.push("updated = @updated");
    this.db.prepare(`UPDATE neta SET ${sets.join(", ")} WHERE id = @id`).run(params);
    if (patch.tags !== undefined) {
      this.db.prepare(`DELETE FROM neta_tag WHERE neta_id = ?`).run(id);
      for (const t of patch.tags) this.addTag(id, t);
    }
    return this.getNeta(id);
  }

  deleteNeta(id: string): boolean {
    // #97 reap蘇生防止：job_result.neta_id は ON DELETE CASCADE。そのまま消すと job_result 行が
    // 道連れで消え、reap の冪等チェック(NOT EXISTS job_result)が崩れて生成ネタが復活する。
    // 参照を先に NULL にして行を残す＝reap は「回収済み」と見続ける（NULL先消しで cascade も不発）。
    this.db.prepare(`UPDATE job_result SET neta_id = NULL WHERE neta_id = ?`).run(id);
    return this.db.prepare(`DELETE FROM neta WHERE id = ?`).run(id).changes > 0;
  }

  addTag(netaId: string, name: string): void {
    this.db.prepare(`INSERT OR IGNORE INTO tag (name) VALUES (?)`).run(name);
    const tag = this.db.prepare(`SELECT id FROM tag WHERE name = ?`).get(name) as {
      id: number;
    };
    this.db
      .prepare(`INSERT OR IGNORE INTO neta_tag (neta_id, tag_id) VALUES (?, ?)`)
      .run(netaId, tag.id);
  }

  removeTag(netaId: string, name: string): void {
    this.db
      .prepare(
        `DELETE FROM neta_tag WHERE neta_id = ? AND tag_id = (SELECT id FROM tag WHERE name = ?)`,
      )
      .run(netaId, name);
  }

  listNeta(q: ListQuery = {}): Neta[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    // scope 既定 project（ネタ帳は作業ネタを見る）。library/all は明示。
    if (q.scope !== "all") (where.push(`n.scope = @scope`), (params.scope = q.scope ?? "project"));
    if (q.kind) (where.push(`n.kind = @kind`), (params.kind = q.kind));
    if (q.mode) (where.push(`n.mode = @mode`), (params.mode = q.mode));
    if (q.meter) (where.push(`n.meter = @meter`), (params.meter = q.meter));
    if (q.mood) (where.push(`n.mood = @mood`), (params.mood = q.mood));
    if (q.key !== undefined) (where.push(`n."key" = @key`), (params.key = q.key));
    if (q.q) (where.push(`(n.title LIKE @like OR n.text LIKE @like)`), (params.like = `%${q.q}%`));
    if (q.tags?.length) {
      const placeholders = q.tags.map((_, i) => `@tag${i}`).join(", ");
      where.push(
        `(SELECT COUNT(*) FROM neta_tag nt JOIN tag t ON t.id = nt.tag_id
          WHERE nt.neta_id = n.id AND t.name IN (${placeholders})) = @tagcount`,
      );
      q.tags.forEach((t, i) => (params[`tag${i}`] = t));
      params.tagcount = q.tags.length;
    }
    params.limit = q.limit ?? 100;
    params.offset = q.offset ?? 0;
    const sql = `SELECT n.* FROM neta n ${
      where.length ? "WHERE " + where.join(" AND ") : ""
    } ORDER BY n.updated DESC, n.id LIMIT @limit OFFSET @offset`;
    return (this.db.prepare(sql).all(params) as Record<string, unknown>[]).map((r) =>
      this.rowToNeta(r),
    );
  }

  // facets は既定で project（ネタ帳=project と一致させる。library 値が混じると UI で0件選択肢が出る）。
  facets(scope: "project" | "library" | "all" = "project"): Facets {
    const scopeSql = scope === "all" ? "" : ` AND scope = '${scope}'`;
    const distinct = (col: string): unknown[] =>
      (
        this.db
          .prepare(`SELECT DISTINCT ${col} AS v FROM neta WHERE ${col} IS NOT NULL${scopeSql} ORDER BY v`)
          .all() as { v: unknown }[]
      ).map((r) => r.v);
    return {
      kind: distinct("kind") as string[],
      mood: distinct("mood") as string[],
      meter: distinct("meter") as string[],
      key: distinct(`"key"`) as number[],
      tags: (this.db.prepare(`SELECT name FROM tag ORDER BY name`).all() as { name: string }[]).map(
        (r) => r.name,
      ),
    };
  }

  // 合成の子孫 id 集合（compose_edge を BFS）。循環判定用。
  private descendantIds(id: string): Set<string> {
    const out = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      const rows = this.db
        .prepare(`SELECT child_id FROM compose_edge WHERE parent_id = ?`)
        .all(cur) as { child_id: string }[];
      for (const r of rows) if (!out.has(r.child_id)) (out.add(r.child_id), stack.push(r.child_id));
    }
    return out;
  }

  placeChild(parentId: string, childId: string, position = 0, ord = 0): void {
    // section に section を入れる等のネストを許すが、**循環は禁止**（自分自身／子孫を親に置けない）。
    if (childId === parentId) throw new Error("自分自身は子にできない");
    if (this.descendantIds(childId).has(parentId)) throw new Error("循環になる配置はできない");
    // #54: 同じ子を別位置に複数置ける。同位置への再配置は冪等（ord を更新）。
    this.db
      .prepare(
        `INSERT INTO compose_edge (parent_id, child_id, position, ord) VALUES (?, ?, ?, ?)
         ON CONFLICT(parent_id, child_id, position) DO UPDATE SET ord = excluded.ord`,
      )
      .run(parentId, childId, position, ord);
  }

  // position 指定で1インスタンスのみ解除。未指定なら (parent,child) の全インスタンス。
  removeChild(parentId: string, childId: string, position?: number): void {
    if (position === undefined) {
      this.db
        .prepare(`DELETE FROM compose_edge WHERE parent_id = ? AND child_id = ?`)
        .run(parentId, childId);
    } else {
      this.db
        .prepare(`DELETE FROM compose_edge WHERE parent_id = ? AND child_id = ? AND position = ?`)
        .run(parentId, childId, position);
    }
  }

  /** 合成ツリーを再帰取得（DAGなので訪問済みガードでサイクル防止）。 */
  getComposition(id: string, seen = new Set<string>()): CompositionNode | null {
    const neta = this.getNeta(id);
    if (!neta) return null;
    if (seen.has(id)) return { neta, children: [] };
    seen.add(id);
    const rows = this.db
      .prepare(
        `SELECT child_id, position, ord FROM compose_edge WHERE parent_id = ? ORDER BY ord, position`,
      )
      .all(id) as { child_id: string; position: number; ord: number }[];
    const children = rows
      .map((r) => ({
        position: r.position,
        ord: r.ord,
        node: this.getComposition(r.child_id, seen),
      }))
      .filter((c): c is { position: number; ord: number; node: CompositionNode } => c.node !== null);
    return { neta, children };
  }

  link(fromId: string, toId: string, type = "related"): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO relation_edge (from_id, to_id, type) VALUES (?, ?, ?)`)
      .run(fromId, toId, type);
  }

  unlink(fromId: string, toId: string, type = "related"): void {
    this.db
      .prepare(`DELETE FROM relation_edge WHERE from_id = ? AND to_id = ? AND type = ?`)
      .run(fromId, toId, type);
  }

  getRelations(id: string): Relation[] {
    return this.db
      .prepare(`SELECT to_id AS "to", type FROM relation_edge WHERE from_id = ? ORDER BY type, to_id`)
      .all(id) as Relation[];
  }

  // --- ジョブ（投げて→進めて→受け取る。生産側）---

  enqueueJob(input: JobInput): Job {
    const id = randomUUID();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO job (id, target_neta_id, level, intent, instruction, params, status, priority, notify_level, created, updated)
         VALUES (@id, @target, @level, @intent, @instruction, @params, 'queued', @priority, @notify, @created, @updated)`,
      )
      .run({
        id,
        target: input.target_neta_id ?? null,
        level: input.level ?? "atomic",
        intent: input.intent,
        instruction: input.instruction ?? null,
        params: input.params == null ? null : JSON.stringify(input.params),
        priority: input.priority ?? 0,
        notify: input.notify_level ?? null,
        created: ts,
        updated: ts,
      });
    return this.getJob(id)!;
  }

  getJob(id: string): Job | null {
    const row = this.db.prepare(`SELECT * FROM job WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToJob(row) : null;
  }

  // #45: ジョブが人に質問して待つ（status=waiting＋question）。
  askQuestion(jobId: string, question: string): Job | null {
    this.db
      .prepare(`UPDATE job SET status='waiting', question=@q, updated=@u WHERE id=@id`)
      .run({ id: jobId, q: question, u: now() });
    return this.getJob(jobId);
  }

  // #45/#85 S3: 待機中ジョブへの回答。回答を載せた継続ジョブを積み、元ジョブを done にする。
  // 元 params（frame/count/condition）を必ず引き継ぐ（#85 指摘6：枠を消さない）。
  // 構造化回答（フォーム＝Record）は frame へ畳む（#85 指摘5）。文字列回答は instruction へ。
  answerJob(jobId: string, answer: string | Record<string, unknown>): Job | null {
    const orig = this.getJob(jobId);
    if (!orig) return null;
    const baseParams: Record<string, unknown> =
      orig.params && typeof orig.params === "object"
        ? { ...(orig.params as Record<string, unknown>) }
        : {};
    let instruction = orig.instruction ?? "";
    if (typeof answer === "string") {
      instruction = `${instruction}\n[回答] ${answer}`.trim();
    } else {
      // フォーム回答を畳む。count/kinds/structure/condition は params トップレベル（worker が
      // そこを読む）、それ以外（meter/key/tempo/bars/mood…）は frame へ上書きマージ。
      const topLevel = new Set(["count", "kinds", "structure", "condition", "target"]);
      const prevFrame =
        baseParams.frame && typeof baseParams.frame === "object"
          ? (baseParams.frame as Record<string, unknown>)
          : {};
      const framePart: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(answer)) {
        if (topLevel.has(k)) baseParams[k] = v;
        else framePart[k] = v;
      }
      baseParams.frame = { ...prevFrame, ...framePart };
    }
    const cont = this.enqueueJob({
      intent: orig.intent,
      target_neta_id: orig.target_neta_id ?? undefined,
      instruction: instruction || undefined,
      params: Object.keys(baseParams).length ? baseParams : undefined,
      notify_level: orig.notify_level ?? undefined,
    });
    this.db
      .prepare(`UPDATE job SET parent_job_id=@p, updated=@u WHERE id=@id`)
      .run({ id: cont.id, p: jobId, u: now() });
    this.db
      .prepare(`UPDATE job SET status='done', updated=@u WHERE id=@id`)
      .run({ id: jobId, u: now() });
    return this.getJob(cont.id);
  }

  listJobs(q: JobQuery = {}): Job[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (q.status) (where.push(`status = @status`), (params.status = q.status));
    if (q.target) (where.push(`target_neta_id = @target`), (params.target = q.target));
    params.limit = q.limit ?? 100;
    const sql = `SELECT * FROM job ${
      where.length ? "WHERE " + where.join(" AND ") : ""
    } ORDER BY created DESC LIMIT @limit`;
    return (this.db.prepare(sql).all(params) as Record<string, unknown>[]).map((r) =>
      this.rowToJob(r),
    );
  }

  private rowToJob(row: Record<string, unknown>): Job {
    return {
      id: row.id as string,
      target_neta_id: (row.target_neta_id as string) ?? null,
      level: row.level as string,
      intent: row.intent as string,
      instruction: (row.instruction as string) ?? null,
      params: row.params == null ? null : JSON.parse(row.params as string),
      status: row.status as string,
      priority: row.priority as number,
      progress: (row.progress as string) ?? null,
      notify_level: (row.notify_level as string) ?? null,
      parent_job_id: (row.parent_job_id as string) ?? null,
      question: (row.question as string) ?? null,
      result: row.result_summary == null ? null : JSON.parse(row.result_summary as string),
      error: (row.error as string) ?? null,
      created: row.created as string,
      updated: row.updated as string,
    };
  }

  private rowToNeta(row: Record<string, unknown>): Neta {
    const tags = (
      this.db
        .prepare(
          `SELECT t.name FROM tag t JOIN neta_tag nt ON nt.tag_id = t.id WHERE nt.neta_id = ? ORDER BY t.name`,
        )
        .all(row.id) as { name: string }[]
    ).map((r) => r.name);
    return {
      id: row.id as string,
      kind: row.kind as string,
      title: (row.title as string) ?? null,
      content: row.content == null ? null : JSON.parse(row.content as string),
      text: (row.text as string) ?? null,
      key: (row.key as number) ?? null,
      mode: (row.mode as string) ?? null,
      tempo: (row.tempo as number) ?? null,
      meter: (row.meter as string) ?? null,
      bars: (row.bars as number) ?? null,
      mood: (row.mood as string) ?? null,
      scope: (row.scope as "project" | "library") ?? "project",
      tags,
      created: row.created as string,
      updated: row.updated as string,
    };
  }

  // --- asset（#77 SoundFont等のファイル資産。実体は data/assets/、ここはメタ）---
  addAsset(input: {
    kind: string;
    name?: string | null;
    path: string;
    size?: number | null;
    mime?: string | null;
    meta?: unknown;
  }): Asset {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO asset (id,kind,name,path,size,mime,meta,created)
         VALUES (@id,@kind,@name,@path,@size,@mime,@meta,@created)`,
      )
      .run({
        id,
        kind: input.kind,
        name: input.name ?? null,
        path: input.path,
        size: input.size ?? null,
        mime: input.mime ?? null,
        meta: input.meta == null ? null : JSON.stringify(input.meta),
        created: now(),
      });
    return this.getAsset(id)!;
  }

  listAssets(kind?: string): Asset[] {
    const rows = (
      kind
        ? this.db.prepare(`SELECT * FROM asset WHERE kind=? ORDER BY created DESC`).all(kind)
        : this.db.prepare(`SELECT * FROM asset ORDER BY created DESC`).all()
    ) as Record<string, unknown>[];
    return rows.map(rowToAsset);
  }

  getAsset(id: string): Asset | null {
    const row = this.db.prepare(`SELECT * FROM asset WHERE id=?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToAsset(row) : null;
  }

  deleteAsset(id: string): boolean {
    return this.db.prepare(`DELETE FROM asset WHERE id=?`).run(id).changes > 0;
  }

  // --- song（#83 曲の箱 overlay：neta[kind=song] と 1:1。段階／次の一手）---
  updateSong(
    netaId: string,
    patch: { stage?: string | null; next_action?: string | null },
  ): { neta_id: string; stage: string | null; next_action: string | null; updated: string } | null {
    if (!this.getNeta(netaId)) return null;
    const cur = this.getSong(netaId);
    const stage = patch.stage !== undefined ? patch.stage : (cur?.stage ?? null);
    const next_action =
      patch.next_action !== undefined ? patch.next_action : (cur?.next_action ?? null);
    this.db
      .prepare(
        `INSERT INTO song (neta_id, stage, next_action, updated) VALUES (@n,@s,@a,@u)
         ON CONFLICT(neta_id) DO UPDATE SET stage=@s, next_action=@a, updated=@u`,
      )
      .run({ n: netaId, s: stage, a: next_action, u: now() });
    return this.getSong(netaId);
  }

  getSong(
    netaId: string,
  ): { neta_id: string; stage: string | null; next_action: string | null; updated: string } | null {
    const row = this.db.prepare(`SELECT * FROM song WHERE neta_id=?`).get(netaId) as
      | Record<string, unknown>
      | undefined;
    return row
      ? {
          neta_id: row.neta_id as string,
          stage: (row.stage as string) ?? null,
          next_action: (row.next_action as string) ?? null,
          updated: row.updated as string,
        }
      : null;
  }

  // --- neta_asset（#83 ネタ↔資産の紐付け：role=source/attachment/render）---
  linkAsset(netaId: string, assetId: string, role = "attachment"): boolean {
    if (!this.getNeta(netaId) || !this.getAsset(assetId)) return false;
    this.db
      .prepare(
        `INSERT INTO neta_asset (neta_id, asset_id, role, created) VALUES (?,?,?,?)
         ON CONFLICT(neta_id, asset_id, role) DO NOTHING`,
      )
      .run(netaId, assetId, role, now());
    return true;
  }

  unlinkAsset(netaId: string, assetId: string, role?: string): boolean {
    const sql = role
      ? this.db.prepare(`DELETE FROM neta_asset WHERE neta_id=? AND asset_id=? AND role=?`).run(netaId, assetId, role)
      : this.db.prepare(`DELETE FROM neta_asset WHERE neta_id=? AND asset_id=?`).run(netaId, assetId);
    return sql.changes > 0;
  }

  getNetaAssets(netaId: string): (Asset & { role: string })[] {
    const rows = this.db
      .prepare(
        `SELECT a.*, na.role AS na_role FROM neta_asset na JOIN asset a ON a.id = na.asset_id
         WHERE na.neta_id=? ORDER BY na.created DESC`,
      )
      .all(netaId) as Record<string, unknown>[];
    return rows.map((r) => ({ ...rowToAsset(r), role: r.na_role as string }));
  }

  // --- schedule（#80 proactive: 見てない間に継続研究/収集を進める）---
  addSchedule(input: {
    neta_id?: string | null;
    intent: string;
    params?: unknown;
    every_sec: number;
  }): Schedule {
    const id = randomUUID();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO schedule (id,neta_id,intent,params,every_sec,enabled,last_run,next_run,created)
         VALUES (@id,@neta_id,@intent,@params,@every_sec,1,NULL,@next,@created)`,
      )
      .run({
        id,
        neta_id: input.neta_id ?? null,
        intent: input.intent,
        params: input.params == null ? null : JSON.stringify(input.params),
        every_sec: input.every_sec,
        next: ts, // next_run=now＝次 tick で初回を即実行（UX：登録したら進み始める）
        created: ts,
      });
    return this.getSchedule(id)!;
  }

  getSchedule(id: string): Schedule | null {
    const row = this.db.prepare(`SELECT * FROM schedule WHERE id=?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToSchedule(row) : null;
  }

  listSchedules(netaId?: string): Schedule[] {
    const rows = (
      netaId
        ? this.db.prepare(`SELECT * FROM schedule WHERE neta_id=? ORDER BY created DESC`).all(netaId)
        : this.db.prepare(`SELECT * FROM schedule ORDER BY created DESC`).all()
    ) as Record<string, unknown>[];
    return rows.map(rowToSchedule);
  }

  setScheduleEnabled(id: string, enabled: boolean): boolean {
    return (
      this.db.prepare(`UPDATE schedule SET enabled=? WHERE id=?`).run(enabled ? 1 : 0, id).changes > 0
    );
  }

  deleteSchedule(id: string): boolean {
    return this.db.prepare(`DELETE FROM schedule WHERE id=?`).run(id).changes > 0;
  }

  // 期日が来た schedule に research/collect ジョブを積む（main の reap interval から呼ぶ）。
  // spam防止：同 schedule の未消化(queued/running)ジョブがあるものは飛ばす。
  tickSchedules(): number {
    const ts = now();
    const due = this.db
      .prepare(
        `SELECT * FROM schedule s
         WHERE s.enabled=1 AND s.next_run <= ?
           AND NOT EXISTS (
             SELECT 1 FROM job j
             WHERE j.status IN ('queued','running')
               AND json_extract(j.params,'$.schedule_id') = s.id
           )`,
      )
      .all(ts) as Record<string, unknown>[];
    let n = 0;
    for (const s of due) {
      const sc = rowToSchedule(s);
      const neta = sc.neta_id ? this.getNeta(sc.neta_id) : null;
      const theme = neta ? (neta.title ?? neta.text ?? "") : "";
      this.enqueueJob({
        intent: sc.intent,
        target_neta_id: sc.neta_id ?? undefined,
        instruction: theme || undefined,
        params: { ...(sc.params as Record<string, unknown> | null), schedule_id: sc.id },
        notify_level: "quiet",
      });
      const next = new Date(Date.now() + sc.every_sec * 1000).toISOString();
      this.db.prepare(`UPDATE schedule SET last_run=?, next_run=? WHERE id=?`).run(ts, next, sc.id);
      n += 1;
    }
    return n;
  }

  // --- chat（#70 Chat履歴の永続化。thread=対象neta id or 'global'）---
  addChatMessage(input: {
    thread: string;
    role: string;
    kind?: string | null;
    text?: string | null;
    data?: unknown;
  }): ChatMessage {
    const id = randomUUID();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO chat_message (id, thread, role, kind, text, data, created)
         VALUES (@id, @thread, @role, @kind, @text, @data, @created)`,
      )
      .run({
        id,
        thread: input.thread,
        role: input.role,
        kind: input.kind ?? null,
        text: input.text ?? null,
        data: input.data == null ? null : JSON.stringify(input.data),
        created: ts,
      });
    return rowToChatMessage(
      this.db.prepare(`SELECT * FROM chat_message WHERE id = ?`).get(id) as Record<string, unknown>,
    );
  }

  listChatMessages(thread: string, limit = 200): ChatMessage[] {
    const rows = this.db
      .prepare(`SELECT * FROM chat_message WHERE thread = ? ORDER BY created, rowid LIMIT ?`)
      .all(thread, limit) as Record<string, unknown>[];
    return rows.map(rowToChatMessage);
  }

  clearChatThread(thread: string): void {
    this.db.prepare(`DELETE FROM chat_message WHERE thread = ?`).run(thread);
  }

  // フリーChatの会話セッション一覧（thread='global' か 'chat:*'）。最終時刻・件数・冒頭プレビュー付き。
  // ネタ別スレッド(thread=neta id)は対象外（ネタから辿るため）。
  listChatThreads(): { thread: string; last: string; count: number; preview: string | null }[] {
    const rows = this.db
      .prepare(
        `SELECT m.thread AS thread, MAX(m.created) AS last, COUNT(*) AS count,
           (SELECT x.text FROM chat_message x
              WHERE x.thread = m.thread AND x.role = 'user' AND x.text IS NOT NULL
              ORDER BY x.created LIMIT 1) AS preview
         FROM chat_message m
         WHERE m.thread = 'global' OR m.thread LIKE 'chat:%'
         GROUP BY m.thread ORDER BY last DESC`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      thread: r.thread as string,
      last: r.last as string,
      count: Number(r.count),
      preview: (r.preview as string) ?? null,
    }));
  }
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

function rowToChatMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    thread: row.thread as string,
    role: row.role as string,
    kind: (row.kind as string) ?? null,
    text: (row.text as string) ?? null,
    data: row.data == null ? null : JSON.parse(row.data as string),
    created: row.created as string,
  };
}

export interface Schedule {
  id: string;
  neta_id: string | null;
  intent: string;
  params: unknown;
  every_sec: number;
  enabled: boolean;
  last_run: string | null;
  next_run: string;
  created: string;
}

function rowToSchedule(row: Record<string, unknown>): Schedule {
  return {
    id: row.id as string,
    neta_id: (row.neta_id as string) ?? null,
    intent: row.intent as string,
    params: row.params == null ? null : JSON.parse(row.params as string),
    every_sec: row.every_sec as number,
    enabled: !!row.enabled,
    last_run: (row.last_run as string) ?? null,
    next_run: row.next_run as string,
    created: row.created as string,
  };
}

export interface Asset {
  id: string;
  kind: string;
  name: string | null;
  path: string;
  size: number | null;
  mime: string | null;
  meta: unknown;
  created: string;
}

function rowToAsset(row: Record<string, unknown>): Asset {
  return {
    id: row.id as string,
    kind: row.kind as string,
    name: (row.name as string) ?? null,
    path: row.path as string,
    size: (row.size as number) ?? null,
    mime: (row.mime as string) ?? null,
    meta: row.meta == null ? null : JSON.parse(row.meta as string),
    created: row.created as string,
  };
}
