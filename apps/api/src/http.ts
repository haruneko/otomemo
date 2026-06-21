import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { createReadStream, createWriteStream, mkdirSync, statSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Core } from "./core";

// #77 asset(SoundFont等)の実体保存先。CM_DB と同階層の assets/（env で上書き可）。
function assetsDir(): string {
  return (
    process.env.CM_ASSETS_DIR ??
    (process.env.CM_DB ? join(dirname(process.env.CM_DB), "assets") : join("data", "assets"))
  );
}

const netaInput = z.object({
  kind: z.string().min(1),
  title: z.string().nullish(),
  content: z.unknown().optional(),
  text: z.string().nullish(),
  key: z.number().int().min(0).max(11).nullish(),
  mode: z.string().nullish(),
  tempo: z.number().nullish(),
  meter: z.string().nullish(),
  bars: z.number().int().nullish(),
  mood: z.string().nullish(),
  tags: z.array(z.string()).optional(),
  from_job: z.string().nullish(),
});

// 意味検索のPython窓口（docs/design.md #16）。localhost のみ、外に露出しない。
const SEARCH_URL = process.env.CM_SEARCH_URL ?? "http://127.0.0.1:8788";
// #65 意味hitの spread較正ゲート閾値。実機コーパス実測で 0.07（無意味top rel≈0.061 を弾き
// 実クエリtop≈0.112 を残す）。コーパス成長で最適点が動く前提で env 外出し＋回帰スイープ。
const SEM_MIN_REL = Number(process.env.CM_SEM_MIN_REL ?? 0.07);

const jobInput = z.object({
  intent: z.string().min(1),
  target_neta_id: z.string().nullish(),
  instruction: z.string().nullish(),
  params: z.unknown().optional(),
  level: z.string().optional(),
  priority: z.number().int().optional(),
  notify_level: z.string().nullish(),
});

/** 低次元データAPI（docs/design.md #15/#16）。PWAの主窓口。 */
export function buildHttp(core: Core): FastifyInstance {
  const app = Fastify({ logger: false });

  // #36 公開制御：CM_TOKEN を設定したときだけ x-cm-token 必須（未設定=LAN内開放のまま）。
  // 未発表素材を外から覗かれないための任意ゲート。
  app.addHook("onRequest", async (req, reply) => {
    const required = process.env.CM_TOKEN;
    if (!required) return;
    if (req.headers["x-cm-token"] !== required) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  // #77 ファイルアップロード（SoundFont等）。上限256MB。
  app.register(multipart, { limits: { fileSize: 256 * 1024 * 1024 } });

  app.post("/neta", async (req, reply) => {
    const p = netaInput.safeParse(req.body);
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
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.get("/facets", async () => core.facets());

  app.get("/neta/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const n = core.getNeta(id);
    if (!n) return reply.code(404).send({ error: "not found" });
    return n;
  });

  app.patch("/neta/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = netaInput.partial().safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    const n = core.updateNeta(id, p.data);
    if (!n) return reply.code(404).send({ error: "not found" });
    return n;
  });

  app.delete("/neta/:id", async (req) => {
    const { id } = req.params as { id: string };
    return { deleted: core.deleteNeta(id) };
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
    core.placeChild(p.data.parent, p.data.child, p.data.position, p.data.ord);
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

  // --- ジョブ（投げて→受け取る）---
  app.post("/job", async (req, reply) => {
    const p = jobInput.safeParse(req.body);
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

  // #45: ジョブが人に質問して待つ
  app.post("/job/:id/ask", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ question: z.string() }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    const j = core.askQuestion(id, p.data.question);
    if (!j) return reply.code(404).send({ error: "not found" });
    return j;
  });

  // #45: 待機中ジョブへの回答（継続ジョブを積む）
  app.post("/job/:id/answer", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ answer: z.string() }).safeParse(req.body);
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
    const keyword = core.listNeta({ q, limit });
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
    return reply.send(createReadStream(a.path));
  });

  app.delete("/asset/:id", async (req) => {
    const { id } = req.params as { id: string };
    const a = core.getAsset(id);
    if (a) rmSync(a.path, { force: true });
    return { deleted: core.deleteAsset(id) };
  });

  return app;
}
