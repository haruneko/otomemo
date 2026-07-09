import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { createReadStream, createWriteStream, mkdirSync, statSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Core } from "./core";
import { netaInputSchema, netaPatchSchema, jobInputSchema, scopeEnum, scopeQueryEnum } from "./schemas";
import {
  genChords,
  genMelody,
  genFromEssence,
  genChordPattern,
  genBass,
  genDrums,
  genNamedProgression,
  analyzeFit,
  fitToChords,
  detectKeyFromNotes,
  detectKeyCandidatesFromNotes,
  detectKeyFromChords,
  melodySimilarity,
  findSimilar,
  melodyEssence,
  normalizeToC,
  identifyProgression,
  analyzeProgression,
  explainProgression,
  harmonize,
  parseChordSymbol,
} from "./music";
import { analyzeVoiceLeading } from "./music/voiceLeading";
import { normRoot } from "./music/theory";
import { assetsDir } from "./audio-asset";
import { findProgressions } from "./progression-search";
import { getChatSession, stopChatSession } from "./chat-session";
import { beginTurn, pushTurnEvent, endTurn, attachTurn, isTurnLive, DONE } from "./chat-live";
import { killJobProc } from "./job-procs";
import { rankRecommendations } from "./music/recommend";

// 一覧(GET /neta)は巨大content を落として初回ロードを軽くする。study(共通進行1000超)や analysis(生MIR配列)は
// 1件で数百KB＝89件で~2MB がモバイル初期表示に丸ごと乗って重かった。閾値超は content:null にし、開いた時に
// GET /neta/:id で全文を取り直す（web の openTop/drillNeta が content==null なら再取得）。music の小content
// (一覧のMiniRoll/試聴で使う)は閾値以下なので残る。閾値は最大級のmelody/進行(数KB)より十分上に置く。
const LIST_CONTENT_MAX_BYTES = 32768;
function stripHeavyListContent<T extends { content: unknown }>(items: T[]): T[] {
  return items.map((n) => {
    if (n.content == null) return n;
    const size = Buffer.byteLength(JSON.stringify(n.content), "utf8");
    return size > LIST_CONTENT_MAX_BYTES ? { ...n, content: null } : n;
  });
}


// neta/job 入力スキーマは SSOT(schemas.ts)から import（http/mcp/型で共有・三重定義を排す）。

// 意味検索のPython窓口（docs/design.md #16）。localhost のみ、外に露出しない。
const SEARCH_URL = process.env.CM_SEARCH_URL ?? "http://127.0.0.1:8788";
// #65 意味hitの spread較正ゲート閾値。実機コーパス実測で 0.07（無意味top rel≈0.061 を弾き
// 実クエリtop≈0.112 を残す）。コーパス成長で最適点が動く前提で env 外出し＋回帰スイープ。
const SEM_MIN_REL = Number(process.env.CM_SEM_MIN_REL ?? 0.07);

/** 低次元データAPI（docs/design.md #15/#16）。PWAの主窓口。 */
export function buildHttp(core: Core): FastifyInstance {
  // 音源アナリーゼの audio_b64（数MB〜）を受けるため body 上限を上げる（既定1MB＝ファイル取込が413で死ぬバグ）。
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 * 1024 });

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

  // API データ(JSON)はブラウザにキャッシュさせない＝配置/合成の変更後にスマホが古いツリーを
  // 出し続ける事故を防ぐ（getComposition 等の GET は cache-control 無しだとモバイルで残る）。
  // ※ハッシュ付き静的アセット(JS/CSS)は JSON でないので対象外＝従来通りキャッシュ可。
  app.addHook("onSend", async (_req, reply, payload) => {
    const ct = reply.getHeader("content-type");
    if (typeof ct === "string" && ct.includes("application/json")) {
      reply.header("Cache-Control", "no-store");
    }
    return payload;
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
    return stripHeavyListContent(core.listNeta({
      kind: q.kind,
      mode: q.mode,
      meter: q.meter,
      mood: q.mood,
      key: q.key !== undefined ? Number(q.key) : undefined,
      tags: q.tags ? q.tags.split(",").filter(Boolean) : undefined,
      q: q.q,
      scope: scopeQueryEnum.optional().catch(undefined).parse(q.scope), // 無効値は素通しせず undefined(既定project)へ
      orderProject: q.orderProject, // 手動並べ替え(neta_order)の適用対象。未指定=既定 updated 順。

      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    }));
  });

  // #20 ピッカーおすすめ＝コーパス(library)から拍子/調で関連数件だけ返す（生1781を選ばせない）。
  // kind 単位（melody / chord_progression）。frame の meter/key で rank。
  app.get("/neta/recommend", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    if (!q.kind) return [];
    const pool = core.listNeta({ scope: "library", kind: q.kind, limit: 5000 });
    return rankRecommendations(pool, {
      meter: q.meter,
      key: q.key !== undefined ? Number(q.key) : undefined,
      top: q.top ? Number(q.top) : 6,
    });
  });

  // 手動並べ替えの保存（被せ表 neta_order・design LV-A）。project='' は「プロジェクト未指定」バケツ。
  app.post("/neta/reorder", async (req, reply) => {
    const b = (req.body ?? {}) as { project?: unknown; ids?: unknown };
    if (typeof b.project !== "string" || !Array.isArray(b.ids) || b.ids.some((x) => typeof x !== "string"))
      return reply.code(400).send({ error: "project(string) と ids(string[]) が必要" });
    core.reorderNeta(b.project, b.ids as string[]);
    return { ok: true };
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
        case "gen_chords": { const num = (x: unknown) => (typeof x === "number" ? x : undefined); return genChords(b.frame, b.seed, b.cadence === "half" || b.cadence === "deceptive" || b.cadence === "plagal" ? b.cadence : undefined, { borrow: num(b.borrow), secondaryDom: num(b.secondaryDom) }); }
        case "gen_melody": {
          // 2026-07-08：HTTP経路もV2（旧: 旧経路＝V2未経由で品質floor不在）。density/swing/style ノブを透過。
          const num = (x: unknown) => (typeof x === "number" ? x : undefined);
          return genMelody(b.frame, asChords(b.chords), b.seed, {
            useV2: true, density: num(b.density), swing: num(b.swing), expression: num(b.expression), runs: num(b.runs), push: num(b.push), foreground: num(b.foreground), breathe: num(b.breathe),
            repetition: num(b.repetition), rangeSteps: num(b.rangeSteps), motifBars: num(b.motifBars),
            phrasing: b.phrasing === "asymmetric" ? "asymmetric" : b.phrasing === "symmetric" ? "symmetric" : undefined,
          });
        }
        case "gen_from_essence": return genFromEssence(asNotes(b.ref ?? b.melody), b.frame, asChords(b.chords), b.seed, {
          strength: typeof b.strength === "number" ? b.strength : undefined,
          blendWith: Array.isArray(b.blendWith ?? b.refs) ? (b.blendWith ?? b.refs).map(asNotes) : undefined,
        });
        case "melody_essence": return melodyEssence(asNotes(b.notes ?? b.melody));
        case "normalize_to_c": return { notes: normalizeToC(asNotes(b.notes ?? b.melody), b.key) };
        case "gen_bass": return genBass(b.frame, asChords(b.chords));
        case "gen_drums": return genDrums(b.frame, b.seed);
        case "gen_chord_pattern": return genChordPattern(b.frame, b.seed);
        case "gen_named_progression": return genNamedProgression(b.name, b.frame);
        case "analyze_fit": return analyzeFit(asNotes(b.melody), asChords(b.chords), b.key);
        case "analyze_voiceleading": { // #8：メロ×低音の声部進行レンズ（bass明示 or chordsのルートを低域で代用）
          const mel = asNotes(b.melody ?? b.notes);
          const low = Array.isArray(b.bass) && b.bass.length ? asNotes(b.bass) : asChords(b.chords).map((c: { root?: number | string; start?: number; dur?: number }) => ({ pitch: 36 + normRoot(c.root ?? 0), start: c.start ?? 0, dur: c.dur ?? 1 }));
          return analyzeVoiceLeading(mel, low);
        }
        case "fit_to_chords": return fitToChords(asNotes(b.melody), asChords(b.chords), b.key);
        case "detect_key": return detectKeyFromNotes(asNotes(b.notes ?? b.melody));
        case "detect_key_candidates": return { candidates: detectKeyCandidatesFromNotes(asNotes(b.notes ?? b.melody), b.top ?? 4) };
        // #9 コードから調(key+mode)候補を上位N。section/コード進行の調を「宣言」する補助。
        case "detect_key_chords": return { candidates: detectKeyFromChords(asChords(b.chords), b.top ?? 3) };
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
    const alias: Record<string, string> = { chords: "chord_progression", chord: "chord_progression", drums: "rhythm", drum: "rhythm", comp: "chord_pattern", chords_inst: "chord_pattern" };
    const want = new Set((b.parts ?? ["chord_progression", "chord_pattern", "melody", "bass", "rhythm"]).map((p) => alias[p] ?? p));
    const tags = ["生成", ...(b.tags ?? [])]; // 呼び出し側 tags も尊重（dogfood 等を付けられる）
    const chords = (genChords(frame, b.seed).items[0]!.content as { chords: any[] }).chords;
    const section = core.createNeta({ kind: "section", title: b.title ?? "生成セクション", key, tempo: frame.tempo, meter: frame.meter, tags });
    let ord = 0;
    const place = (kind: string, content: unknown, label?: string) => {
      const n = core.createNeta({ kind, title: label ?? kind, content, key, tempo: frame.tempo, scope: "project", tags });
      core.placeChild(section.id, n.id, 0, ord++);
    };
    if (want.has("chord_progression")) place("chord_progression", { chords }, "コード");
    if (want.has("chord_pattern")) place("chord_pattern", genChordPattern(frame, b.seed).items[0]!.content, "コード楽器");
    if (want.has("melody")) place("melody", genMelody(frame, chords, b.seed, { useV2: true }).items[0]!.content, "メロ"); // V2化(2026-07-09 評価指摘: assembleだけ旧経路でメロ改善が届いていなかった)
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

  // 器への出し入れ（P3）＝prj: タグを addTag/removeTag（他タグ非破壊。updateNeta(tags)は全置換で危険）。
  app.post("/neta/:id/project", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({ project: z.string().min(1), member: z.boolean().default(true) })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    if (!core.getNeta(id)) return reply.code(404).send({ error: "not found" });
    const tag = `prj:${p.data.project}`;
    if (p.data.member) core.addTag(id, tag);
    else core.removeTag(id, tag);
    return core.getNeta(id);
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

  // #100④-S6 ジョブ削除：消費者のいない/廃止インテントの死にジョブをトレイから消せる（滞留の自浄）。
  // ★実行中(research/audio)なら**実プロセスも殺す**（abort→spawn がプロセスグループごと SIGKILL）＝
  //   停止時に裏処理を走り切らせない（ユーザー要望）。killed=実プロセスを止めたか。
  app.delete("/job/:id", async (req) => {
    const { id } = req.params as { id: string };
    const killed = killJobProc(id);
    return { deleted: core.deleteJob(id), killed };
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
    let semanticOk = false; // cm-search が応答したか＝false は意味検索が使えず keyword-only に劣化（UIで告知）。
    try {
      // cm-search 不通時にハングしない（閉ポートが RST を返さない環境=WSL2 等では OS connect が
      // ~11s ブロック＝AbortSignal では connect 中断が効かない）。2s で応答を切り上げてキーワード
      // だけで返す＝検索は常に即応。背後の接続は放置で無害（undici が後で片付ける）。
      const res = (await Promise.race([
        fetch(`${SEARCH_URL}/search?q=${encodeURIComponent(q)}&k=${limit}`, {
          signal: AbortSignal.timeout(2000),
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("cm-search timeout")), 2000)),
      ])) as Response;
      if (res.ok) {
        semanticOk = true; // 応答あり＝意味検索は生きている（hit 0 でも「使えている」）。
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
      // 意味検索が落ちていてもキーワードだけで返す（semanticOk=false のまま＝UIで劣化を告知）
    }

    return {
      items: [
        ...keyword.map((n) => ({ ...n, matchType: semIds.has(n.id) ? "both" : "exact" })),
        ...semantic.filter((n) => !kwIds.has(n.id)).map((n) => ({ ...n, matchType: "semantic" })),
      ],
      semanticOk,
    };
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

  // プロジェクト＝一曲(or組曲)の器：配下ネタに紐づくファイルを器単位で集約（S2）。
  app.get("/projects/:project/files", async (req) => {
    const { project } = req.params as { project: string };
    return core.listProjectFiles(project);
  });

  // プロジェクト名一覧（prj:タグ ∪ project行＝空の器も含む）。picker のソース。
  app.get("/projects", async () => core.listProjectNames());
  // ピッカーのチップ用件数（P1）＝すべて/未仕分け/器別。/projects/:name と衝突しない別パス。
  app.get("/project-counts", async () => core.projectCounts());

  // プロジェクト配下のジョブ（投げて受け取る）をワークスペースに可視化。
  app.get("/projects/:project/jobs", async (req) => {
    const { project } = req.params as { project: string };
    return core.listProjectJobs(project);
  });

  // プロジェクト実体（器の説明＋AIへの指示）。未設定でも name だけ返す（画面は常に開ける）。
  app.get("/projects/:name", async (req) => {
    const { name } = req.params as { name: string };
    return core.getProject(name) ?? { name, description: null, instructions: null, created: null, updated: null };
  });
  const projectMeta = z.object({ description: z.string().nullish(), instructions: z.string().nullish() });
  app.post("/projects/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    const p = projectMeta.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    return core.setProject(name, p.data);
  });
  // 器の削除（所属タグを外す＝ネタは残す・未仕分けへ／説明・指示 overlay を消す）。
  app.delete("/projects/:name", async (req) => {
    const { name } = req.params as { name: string };
    return core.deleteProject(name);
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

  app.get("/chat/threads", async (req) => {
    const { project } = (req.query ?? {}) as { project?: string };
    return core.listChatThreads(project && project.length ? project : null);
  });

  // 会話セッションを器（プロジェクト）に束ねる／タイトル付与（upsert・部分更新）。
  const chatThreadMeta = z.object({
    project: z.string().nullish(),
    title: z.string().nullish(),
  });
  app.post("/chat/:thread/meta", async (req, reply) => {
    const { thread } = req.params as { thread: string };
    const p = chatThreadMeta.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    core.setChatThread({ thread, ...p.data });
    return { ok: true };
  });

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

  // セッションごと削除（履歴＋器への所属）。/messages は履歴だけ消す（別物）。
  app.delete("/chat/:thread", async (req) => {
    const { thread } = req.params as { thread: string };
    core.deleteChatThread(thread);
    return { deleted: true };
  });

  // #100 薄いラッパー：スレッド毎の長命 claude セッションに1ターン送り、stream-json を SSE で中継。
  // 脳は Claude（記憶・多ターン・10 verbs のツール選択）。api は spawn と中継だけ。
  //
  // ★ストリーム切れ対策（2026-07-05）：ターンは chat-live レジストリにバッファ＋ファンアウトし、
  //   claude プロセスは**このHTTPソケットが切れても走り続ける**。完了時にサーバ側で assistant 返信を
  //   chat_message に永続化する＝チャットを閉じても締めの返信が消えない。走行中に開き直したら
  //   `GET /chat/:thread/turn/live` で途中から購読し直せる（下）。
  const SSE_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  } as const;

  // tool_result の content（[{type:"text", text:"<JSON>"}] or 文字列）から payload(object) を取り出す。
  function parseToolResultPayload(content: unknown): Record<string, unknown> | null {
    let text: string | undefined;
    if (typeof content === "string") text = content;
    else if (Array.isArray(content)) {
      const t = content.find((b) => (b as { type?: string })?.type === "text") as { text?: string } | undefined;
      text = typeof t?.text === "string" ? t.text : undefined;
    }
    if (text === undefined) return null;
    try {
      const v = JSON.parse(text);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  // 走行中ターンへ購読し、SSE ソケットへ書き出す（DONE 番兵→`event: done`＋close）。socket 死は握る。
  function pipeLiveToSocket(thread: string, raw: import("node:http").ServerResponse): (() => void) | null {
    return attachTurn(thread, (e) => {
      try {
        if (e === DONE) {
          raw.write("event: done\ndata: {}\n\n");
          raw.end();
        } else {
          raw.write(`data: ${JSON.stringify(e)}\n\n`);
        }
      } catch { /* ソケットが既に閉じている＝無視（ターンはサーバ側で継続） */ }
    });
  }

  app.post("/chat/:thread/turn", async (req, reply) => {
    const { thread } = req.params as { thread: string };
    const text = String((req.body as { text?: unknown } | null)?.text ?? "");
    const dbPath = resolve(process.env.CM_DB ?? "./data/cm.sqlite");
    const repo = dirname(dirname(dbPath)); // <repo>/data/cm.sqlite → <repo>（pnpm workspace ルート）
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, SSE_HEADERS);
    // このターンをレジストリに登録し、まず自分自身のソケットを購読者として繋ぐ（再アタッチと同一経路）。
    beginTurn(thread);
    const detach = pipeLiveToSocket(thread, raw);
    raw.on("close", () => detach?.()); // ブラウザが閉じたら購読解除（ターン自体は継続）
    let finalText = ""; // result イベントの最終テキスト
    let lastText = ""; // フォールバック：最後の assistant テキストブロック
    // ★書込(capture/revise/assemble)で作られた/更新されたネタの参照を集める＝assistant メッセージに
    //   永続化し、開き直しても「ネタへのカード/リンク」が消えないようにする（S5 でカードは非永続だった）。
    const WRITE_VERBS = new Set(["capture", "revise", "assemble"].map((v) => `mcp__creative-manager__${v}`));
    const toolNames = new Map<string, string>(); // tool_use id → verb 名（tool_result と突合）
    const writtenNetas: { id: string; kind?: string; title?: string }[] = [];
    try {
      // 器（プロジェクト）の指示文を会話に効かせる：thread→project→instructions を system prompt に追記。
      const proj = core.getChatThreadProject(thread);
      const instructions = proj ? (core.getProject(proj)?.instructions ?? "") : "";
      // ③ 対象ネタの文脈：thread が neta id なら「今どのネタの話か」を Claude に伝える＝song_state 等が使える。
      const target = core.getNeta(thread);
      const targetNote = target
        ? `[Current neta] You are working on neta id="${target.id}" (kind=${target.kind}${target.title ? `, title="${target.title}"` : ""}). When the user refers to "this song / this melody / 次どうする / 詰まった", operate on this id (e.g. song_state, analyze, fit).`
        : "";
      // ④ 機材相談：専用グローバルスレッド。器に紐づかない全曲共通の知識として答え/貯める。
      const gearNote = thread === "gear"
        ? `[Gear consultation / 機材] This is a GLOBAL, cross-project conversation about gear, plugins and sound design (the user's DAW is ABILITY). Answer practically. When the user wants to keep a durable tip, save it with capture(kind:"knowledge", tags:["機材"], text:...) — do NOT attach any project tag (機材 knowledge is shared across ALL songs). To recall past tips, search prior 機材 knowledge.`
        : "";
      const suffix = [instructions, targetNote, gearNote].filter(Boolean).join("\n\n");
      const sess = getChatSession(thread, dbPath, repo, suffix);
      // イベントを蓄積しつつバッファへ流す（購読者＝このソケット＋あとから来る再アタッチ全部に届く）。
      await sess.say(text, (e) => {
        const ev = e as {
          type?: string; result?: string;
          message?: { content?: Array<{ type?: string; text?: string; name?: string; id?: string; tool_use_id?: string; content?: unknown }> };
        };
        if (ev.type === "assistant") {
          for (const b of ev.message?.content ?? []) {
            if (b.type === "text" && b.text) lastText = b.text;
            else if (b.type === "tool_use" && b.id && b.name) toolNames.set(b.id, b.name); // 書込突合用
          }
        } else if (ev.type === "user") {
          // tool_result：書込 verb のものだけ、返ってきたネタ(id/kind/title)を控える。
          for (const b of ev.message?.content ?? []) {
            if (b.type === "tool_result" && b.tool_use_id && WRITE_VERBS.has(toolNames.get(b.tool_use_id) ?? "")) {
              const p = parseToolResultPayload(b.content);
              if (p && typeof p.id === "string") {
                writtenNetas.push({ id: p.id, kind: typeof p.kind === "string" ? p.kind : undefined, title: typeof p.title === "string" ? p.title : undefined });
              }
            }
          }
        } else if (ev.type === "result" && typeof ev.result === "string") {
          finalText = ev.result;
        }
        pushTurnEvent(thread, e as Record<string, unknown>);
      });
    } catch (err) {
      pushTurnEvent(thread, { type: "error", error: String(err) });
    } finally {
      // ★ソケットが切れていてもここまで来る（say は claude の result で解決）。締めの返信＋作られたネタ参照を履歴に残す。
      const outText = (finalText || lastText).trim();
      // 同一ネタの重複（同ターンで capture→revise 等）は最後の1件に畳む。
      const netas = [...new Map(writtenNetas.map((n) => [n.id, n])).values()];
      if (outText || netas.length) {
        try {
          core.addChatMessage({
            thread, role: "assistant", kind: "chat",
            text: outText || null,
            data: netas.length ? { netas } : undefined, // 開き直しでネタカードを復元する材料
          });
        } catch { /* 保存失敗は握る（従来どおりメモリだけでも動く） */ }
      }
      endTurn(thread); // DONE を全購読者へ（このソケットはここで end される）
    }
  });

  // ★再アタッチ：開き直した時に**走行中ターンを途中から**購読する。走行中でなければ即 done（no-op）。
  app.get("/chat/:thread/turn/live", async (req, reply) => {
    const { thread } = req.params as { thread: string };
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, SSE_HEADERS);
    const detach = pipeLiveToSocket(thread, raw);
    if (!detach) { raw.write("event: done\ndata: {}\n\n"); raw.end(); return; } // 走行中ターン無し
    raw.on("close", () => detach());
  });

  // 走行中ターンの有無だけ軽く返す（UI が「考え中…」表示や再アタッチ要否を判断する用）。
  app.get("/chat/:thread/turn/status", async (req) => {
    const { thread } = req.params as { thread: string };
    return { live: isTurnLive(thread) };
  });

  // ★停止：走行中の claude ターンを落とす（session_id は残る＝次発言で resume）。say が proc の exit で
  // 解決し、/turn の finally が**それまでの部分テキストを永続化**して endTurn＝購読者に DONE が届く。
  app.post("/chat/:thread/turn/stop", async (req) => {
    const { thread } = req.params as { thread: string };
    return { stopped: stopChatSession(thread) };
  });

  return app;
}
