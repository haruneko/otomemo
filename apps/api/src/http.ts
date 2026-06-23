import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { createReadStream, createWriteStream, mkdirSync, statSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Core } from "./core";
import { netaInputSchema, netaPatchSchema, jobInputSchema, scopeEnum, scopeQueryEnum } from "./schemas";
import {
  genChords,
  genMelody,
  genBass,
  genDrums,
  genNamedProgression,
  analyzeFit,
  fitToChords,
  detectKeyFromNotes,
  melodySimilarity,
  findSimilar,
  identifyProgression,
  analyzeProgression,
  explainProgression,
  harmonize,
  parseChordSymbol,
} from "./music";
import { findProgressions } from "./progression-search";

// #77 asset(SoundFont等)の実体保存先。CM_DB と同階層の assets/（env で上書き可）。
function assetsDir(): string {
  return (
    process.env.CM_ASSETS_DIR ??
    (process.env.CM_DB ? join(dirname(process.env.CM_DB), "assets") : join("data", "assets"))
  );
}

// neta/job 入力スキーマは SSOT(schemas.ts)から import（http/mcp/型で共有・三重定義を排す）。

// 意味検索のPython窓口（docs/design.md #16）。localhost のみ、外に露出しない。
const SEARCH_URL = process.env.CM_SEARCH_URL ?? "http://127.0.0.1:8788";
// #65 意味hitの spread較正ゲート閾値。実機コーパス実測で 0.07（無意味top rel≈0.061 を弾き
// 実クエリtop≈0.112 を残す）。コーパス成長で最適点が動く前提で env 外出し＋回帰スイープ。
const SEM_MIN_REL = Number(process.env.CM_SEM_MIN_REL ?? 0.07);

/** 低次元データAPI（docs/design.md #15/#16）。PWAの主窓口。 */
export function buildHttp(core: Core): FastifyInstance {
  const app = Fastify({ logger: false });

  // #36 公開制御：CM_TOKEN を設定したときだけ x-cm-token 必須（未設定=LAN内開放のまま）。
  // 未発表素材を外から覗かれないための任意ゲート。
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health" || req.url.startsWith("/health?")) return; // 監視はトークン不要
    const required = process.env.CM_TOKEN;
    if (!required) return;
    if (req.headers["x-cm-token"] !== required) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  // 運用ヘルス（systemd/監視用・トークン不要）。queued滞留・失敗数・依存ポート(search/music-mcp)疎通。
  app.get("/health", async () => {
    const s = core.healthStats();
    const reach = async (url: string): Promise<boolean> => {
      try {
        const ctrl = AbortSignal.timeout(1500);
        await fetch(url, { signal: ctrl });
        return true;
      } catch {
        return false;
      }
    };
    const [search, musicMcp] = await Promise.all([
      reach(`${SEARCH_URL}/`),
      process.env.CM_MUSIC_MCP_URL ? reach(process.env.CM_MUSIC_MCP_URL) : Promise.resolve(false),
    ]);
    return {
      ok: true,
      jobs: s,
      deps: { "cm-search": search, "cm-music-mcp": musicMcp },
    };
  });

  // #77 ファイルアップロード（SoundFont等）。上限256MB。
  app.register(multipart, { limits: { fileSize: 256 * 1024 * 1024 } });

  app.post("/neta", async (req, reply) => {
    const p = netaInputSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    return core.createNeta(p.data);
  });

  app.get("/neta", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return core.listNeta({
      kind: q.kind,
      mode: q.mode,
      meter: q.meter,
      mood: q.mood,
      key: q.key !== undefined ? Number(q.key) : undefined,
      tags: q.tags ? q.tags.split(",").filter(Boolean) : undefined,
      q: q.q,
      scope: scopeQueryEnum.optional().catch(undefined).parse(q.scope), // 無効値は素通しせず undefined(既定project)へ

      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.get("/facets", async () => core.facets());

  // 音楽ドメイン（生成/分析）の内部HTTP窓口。worker(Python)の dispatch がここを叩いて TS の決定的記号
  // エンジンに委譲（音楽ドメインTS一本化＝アーキ是正 S2。Python に生成/分析を二重実装しない）。
  app.post("/music/:op", async (req, reply) => {
    const { op } = req.params as { op: string };
    const b = (req.body ?? {}) as Record<string, any>;
    // 入力正規化：melody/chords は「生配列」でも「{notes}/{chords}」でも受ける（生成物をそのまま検証に
    // 回せるように・dogfood P1）。不正は空配列＝関数は落ちない。さらに try/catch で 500 でなく 400 に。
    const asNotes = (x: any): any[] => (Array.isArray(x) ? x : Array.isArray(x?.notes) ? x.notes : []);
    // chord は {root,quality} でも **"Cm7" 等の文字列**でも受ける（root 0-11 手入力の辛さ解消・dogfood P3）。
    const asChords = (x: any): any[] => {
      const arr = Array.isArray(x) ? x : Array.isArray(x?.chords) ? x.chords : [];
      return arr.map((c: any, i: number) => {
        if (typeof c !== "string") return c;
        const p = parseChordSymbol(c);
        return p ? { root: p.root, quality: p.quality, start: i, dur: 1 } : null;
      }).filter(Boolean);
    };
    try {
      switch (op) {
        case "gen_chords": return genChords(b.frame, b.seed);
        case "gen_melody": return genMelody(b.frame, asChords(b.chords), b.seed);
        case "gen_bass": return genBass(b.frame, asChords(b.chords));
        case "gen_drums": return genDrums(b.frame, b.seed);
        case "gen_named_progression": return genNamedProgression(b.name, b.frame);
        case "analyze_fit": return analyzeFit(asNotes(b.melody), asChords(b.chords), b.key);
        case "fit_to_chords": return fitToChords(asNotes(b.melody), asChords(b.chords), b.key);
        case "detect_key": return detectKeyFromNotes(asNotes(b.notes ?? b.melody));
        case "melody_similarity": return { similarity: melodySimilarity(asNotes(b.a), asNotes(b.b)) };
        case "find_similar": return findSimilar(asNotes(b.target), b.candidates, b.top);
        // 連想エンジン（MCP と同じ機能を HTTP からも・web UI/programmatic 用）。
        case "identify_progression": return identifyProgression(asChords(b.chords), b.key !== undefined ? { key: b.key } : {});
        case "analyze_progression": return analyzeProgression(asChords(b.chords), { key: b.key, mode: b.mode });
        case "explain_progression": return explainProgression(asChords(b.chords), { key: b.key, mode: b.mode });
        case "harmonize": return harmonize(asNotes(b.melody), b.key ?? 0, { mode: b.mode, barBeats: b.barBeats });
        case "find_progressions": return findProgressions(core, { tags: b.tags, like: b.like, limit: b.limit });
        default: return reply.code(404).send({ error: `unknown music op: ${op}` });
      }
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message }); // 不正入力は 500 でなく 400
    }
  });

  // gen→compose ワンショット（dogfood P4）：コードを土台に各パートを生成→ネタ化→section に合成、を1コール。
  // 「叩き台を一発で組む」。決定的(seed)。返り＝section ネタ＋合成木。全部 project・tags:["生成"]。
  app.post("/gen/section", async (req) => {
    const b = (req.body ?? {}) as { frame?: any; parts?: string[]; seed?: number; title?: string; tags?: string[] };
    const frame = b.frame ?? {};
    const key = typeof frame.key === "number" ? frame.key : 0;
    // part 名は素直な別名も受ける（chords→chord_progression, drums→rhythm 等）。指定の揺れで落とさない。
    const alias: Record<string, string> = { chords: "chord_progression", chord: "chord_progression", drums: "rhythm", drum: "rhythm" };
    const want = new Set((b.parts ?? ["chord_progression", "melody", "bass", "rhythm"]).map((p) => alias[p] ?? p));
    const tags = ["生成", ...(b.tags ?? [])]; // 呼び出し側 tags も尊重（dogfood 等を付けられる）
    const chords = (genChords(frame, b.seed).items[0]!.content as { chords: any[] }).chords;
    const section = core.createNeta({ kind: "section", title: b.title ?? "生成セクション", key, tempo: frame.tempo, meter: frame.meter, tags });
    let ord = 0;
    const place = (kind: string, content: unknown, label?: string) => {
      const n = core.createNeta({ kind, title: label ?? kind, content, key, tempo: frame.tempo, scope: "project", tags });
      core.placeChild(section.id, n.id, 0, ord++);
    };
    if (want.has("chord_progression")) place("chord_progression", { chords }, "コード");
    if (want.has("melody")) place("melody", genMelody(frame, chords, b.seed).items[0]!.content, "メロ");
    if (want.has("bass")) place("bass", genBass(frame, chords, b.seed).items[0]!.content, "ベース");
    if (want.has("rhythm")) place("rhythm", genDrums(frame, b.seed).items[0]!.content, "ドラム");
    return { section: core.getNeta(section.id), composition: core.getComposition(section.id) };
  });

  // メロ連想 retrieval（S4c）：notes か neta id を渡すと、scope(既定 library) の近いメロを返す。
  // 「このメロ前のとかぶってない？」＝重複検出・連想の入口。
  app.post("/melody/neighbors", async (req, reply) => {
    const b = (req.body ?? {}) as { notes?: any; id?: string; scope?: "project" | "library" | "all"; top?: number };
    const coerce = (x: any): any[] => (Array.isArray(x) ? x : Array.isArray(x?.notes) ? x.notes : []);
    let notes = coerce(b.notes);
    if (notes.length === 0 && b.id) {
      const n = core.getNeta(b.id);
      notes = coerce((n?.content as { notes?: any } | null)?.notes);
    }
    if (notes.length === 0) return reply.code(400).send({ error: "notes or id required" });
    return { neighbors: core.similarMelodies(notes, b.scope ?? "library", b.top ?? 5, b.id) };
  });

  app.get("/neta/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const n = core.getNeta(id);
    if (!n) return reply.code(404).send({ error: "not found" });
    return n;
  });

  app.patch("/neta/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = netaPatchSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    const n = core.updateNeta(id, p.data);
    if (!n) return reply.code(404).send({ error: "not found" });
    return n;
  });

  app.delete("/neta/:id", async (req) => {
    const { id } = req.params as { id: string };
    return { deleted: core.deleteNeta(id) };
  });

  // ライブラリ→プロジェクトにコピー（複製汎用にも）。元は不変・新規 project ネタを返す。
  app.post("/neta/:id/copy", async (req, reply) => {
    const { id } = req.params as { id: string };
    const n = core.copyNeta(id);
    if (!n) return reply.code(404).send({ error: "not found" });
    return n;
  });

  // scope 切替（自作を連想元へ＝library に移す等）。
  app.post("/neta/:id/scope", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ scope: scopeEnum }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    const n = core.setScope(id, p.data.scope);
    if (!n) return reply.code(404).send({ error: "not found" });
    return n;
  });

  app.get("/neta/:id/composition", async (req, reply) => {
    const { id } = req.params as { id: string };
    const t = core.getComposition(id);
    if (!t) return reply.code(404).send({ error: "not found" });
    return t;
  });

  app.get("/neta/:id/relations", async (req) => {
    const { id } = req.params as { id: string };
    return core.getRelations(id).map((r) => ({ type: r.type, neta: core.getNeta(r.to) }));
  });

  app.post("/compose", async (req, reply) => {
    const p = z
      .object({
        parent: z.string(),
        child: z.string(),
        position: z.number().default(0),
        ord: z.number().int().default(0),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    try {
      core.placeChild(p.data.parent, p.data.child, p.data.position, p.data.ord);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message }); // 循環/自己配置
    }
    return { ok: true };
  });

  app.post("/compose/remove", async (req, reply) => {
    const p = z
      .object({ parent: z.string(), child: z.string(), position: z.number().optional() })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    core.removeChild(p.data.parent, p.data.child, p.data.position);
    return { ok: true };
  });

  app.post("/relation", async (req, reply) => {
    const p = z
      .object({ from: z.string(), to: z.string(), type: z.string().default("related") })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    core.link(p.data.from, p.data.to, p.data.type);
    return { ok: true };
  });

  app.post("/relation/remove", async (req, reply) => {
    const p = z
      .object({ from: z.string(), to: z.string(), type: z.string().default("related") })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    core.unlink(p.data.from, p.data.to, p.data.type);
    return { ok: true };
  });

  // --- ジョブ（投げて→受け取る）---
  app.post("/job", async (req, reply) => {
    const p = jobInputSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    return core.enqueueJob(p.data);
  });

  app.get("/jobs", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return core.listJobs({ status: q.status, target: q.target });
  });

  app.get("/job/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const j = core.getJob(id);
    if (!j) return reply.code(404).send({ error: "not found" });
    return j;
  });

  // Chat がディスパッチ後もそのチャットで完了を待てるよう、ジョブ＋子ジョブの決着を返す。
  app.get("/job/:id/outcome", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!core.getJob(id)) return reply.code(404).send({ error: "not found" }); // 無効idで settled:true を返さない
    return core.jobOutcome(id);
  });

  // #45: ジョブが人に質問して待つ
  app.post("/job/:id/ask", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ question: z.string() }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    const j = core.askQuestion(id, p.data.question);
    if (!j) return reply.code(404).send({ error: "not found" });
    return j;
  });

  // #45/#85 S3: 待機中ジョブへの回答（継続ジョブを積む）。文字列 or 構造化(フォーム)回答。
  app.post("/job/:id/answer", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({ answer: z.union([z.string(), z.record(z.unknown())]) })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    const cont = core.answerJob(id, p.data.answer);
    if (!cont) return reply.code(404).send({ error: "not found" });
    return cont;
  });

  // #65 ハイブリッド検索：キーワード一致(LIKE) ∪ 意味(spread較正ゲート)。
  // exact 優先で並べ matchType を付与。両系統0件なら []（＝フロントで「該当なし」）。
  // 意味(Python)不通でもキーワードは返す（堅牢）。スコア数値は返さない（人に無意味）。
  app.get("/search", async (req) => {
    const { q, k } = req.query as { q?: string; k?: string };
    if (!q) return [];
    const limit = k ? Number(k) : 20;

    // キーワード一致＝確実な真。日本語1〜2文字も拾える。
    const keyword = core.listNeta({ q, scope: "all", limit }); // 検索は project＋library 横断（取込コーパスも名前で引ける）
    const kwIds = new Set(keyword.map((n) => n.id));

    // 意味：rel(=score-floor)が閾値未満の弱いhitは落とす（無意味クエリ＝全員横並びを排除）。
    const semIds = new Set<string>();
    const semantic: NonNullable<ReturnType<typeof core.getNeta>>[] = [];
    try {
      const res = await fetch(`${SEARCH_URL}/search?q=${encodeURIComponent(q)}&k=${limit}`);
      if (res.ok) {
        const hits = (await res.json()) as { neta_id: string; score: number; rel?: number }[];
        for (const h of hits) {
          if ((h.rel ?? 0) < SEM_MIN_REL) continue;
          const n = core.getNeta(h.neta_id);
          if (n) {
            semantic.push(n);
            semIds.add(n.id);
          }
        }
      }
    } catch {
      // 意味検索が落ちていてもキーワードだけで返す
    }

    return [
      ...keyword.map((n) => ({ ...n, matchType: semIds.has(n.id) ? "both" : "exact" })),
      ...semantic.filter((n) => !kwIds.has(n.id)).map((n) => ({ ...n, matchType: "semantic" })),
    ];
  });

  // --- asset（#77 ファイル資産。SoundFont を全体で1個読む等）---
  app.post("/asset", async (req, reply) => {
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "no file" });
    const kind = (part.fields.kind as { value?: string } | undefined)?.value ?? "soundfont";
    const id = randomUUID();
    const dir = assetsDir();
    mkdirSync(dir, { recursive: true });
    const ext = part.filename?.match(/\.[A-Za-z0-9]+$/)?.[0] ?? "";
    const path = join(dir, `${id}${ext}`);
    await pipeline(part.file, createWriteStream(path));
    if (part.file.truncated) {
      rmSync(path, { force: true });
      return reply.code(413).send({ error: "file too large" });
    }
    const size = statSync(path).size;
    return core.addAsset({ kind, name: part.filename ?? null, path, size, mime: part.mimetype });
  });

  app.get("/assets", async (req) => {
    const q = req.query as { kind?: string };
    return core.listAssets(q.kind);
  });

  app.get("/asset/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const a = core.getAsset(id);
    if (!a) return reply.code(404).send({ error: "not found" });
    reply.header("content-type", a.mime ?? "application/octet-stream");
    if (a.size != null) reply.header("content-length", String(a.size));
    // #84 S0: asset は id 不変（内容も不変）→ ブラウザに長期キャッシュさせ 32MB の再fetchを排除。
    reply.header("cache-control", "public, max-age=31536000, immutable");
    return reply.send(createReadStream(a.path));
  });

  app.delete("/asset/:id", async (req) => {
    const { id } = req.params as { id: string };
    const a = core.getAsset(id);
    if (a) rmSync(a.path, { force: true });
    return { deleted: core.deleteAsset(id) };
  });

  // --- song overlay（#83 段階／次の一手）＋ neta_asset（資産紐付け role）---
  app.get("/neta/:id/song", async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = core.getSong(id);
    return s ?? reply.code(404).send({ error: "no song" });
  });
  app.patch("/neta/:id/song", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ stage: z.string().nullish(), next_action: z.string().nullish() }).parse(req.body);
    const s = core.updateSong(id, p);
    return s ?? reply.code(404).send({ error: "neta not found" });
  });
  app.get("/neta/:id/assets", async (req) => {
    const { id } = req.params as { id: string };
    return core.getNetaAssets(id);
  });
  app.post("/neta/:id/assets", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({ asset_id: z.string(), role: z.enum(["source", "attachment", "render"]).default("attachment") })
      .parse(req.body);
    return core.linkAsset(id, p.asset_id, p.role)
      ? { ok: true }
      : reply.code(404).send({ error: "neta or asset not found" });
  });
  app.delete("/neta/:id/assets/:assetId", async (req) => {
    const { id, assetId } = req.params as { id: string; assetId: string };
    const role = (req.query as { role?: string }).role;
    return { unlinked: core.unlinkAsset(id, assetId, role) };
  });

  // --- schedule（#80 proactive: 継続研究/収集を見てない間に進める）---
  app.post("/schedule", async (req, reply) => {
    const p = z
      .object({
        neta_id: z.string().nullish(),
        intent: z.enum(["research", "collect"]).default("research"),
        params: z.unknown().optional(),
        every_sec: z.number().int().min(60).default(21600), // 既定6h、最短1分
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    return core.addSchedule(p.data);
  });

  app.get("/schedules", async (req) => {
    const q = req.query as { neta_id?: string };
    return core.listSchedules(q.neta_id);
  });

  app.patch("/schedule/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    return { ok: core.setScheduleEnabled(id, p.data.enabled) };
  });

  app.delete("/schedule/:id", async (req) => {
    const { id } = req.params as { id: string };
    return { deleted: core.deleteSchedule(id) };
  });

  // --- chat（#70 Chat履歴の永続化。thread=対象neta id or 'global'）---
  const chatMessageInput = z.object({
    role: z.string().min(1),
    kind: z.string().nullish(),
    text: z.string().nullish(),
    data: z.unknown().optional(),
  });

  app.get("/chat/threads", async () => core.listChatThreads());

  app.get("/chat/:thread/messages", async (req) => {
    const { thread } = req.params as { thread: string };
    return core.listChatMessages(thread);
  });

  app.post("/chat/:thread/message", async (req, reply) => {
    const { thread } = req.params as { thread: string };
    const p = chatMessageInput.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    return core.addChatMessage({ thread, ...p.data });
  });

  app.delete("/chat/:thread/messages", async (req) => {
    const { thread } = req.params as { thread: string };
    core.clearChatThread(thread);
    return { cleared: true };
  });

  return app;
}
