import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import type { Core } from "./core";

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
});

// 意味検索のPython窓口（docs/design.md #16）。localhost のみ、外に露出しない。
const SEARCH_URL = process.env.CM_SEARCH_URL ?? "http://127.0.0.1:8788";

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
    return core.getRelations(id);
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

  // 意味検索：Python検索サービスへproxy → neta を hydrate して順序維持で返す
  app.get("/search", async (req, reply) => {
    const { q, k } = req.query as { q?: string; k?: string };
    if (!q) return [];
    let hits: { neta_id: string; score: number }[];
    try {
      const res = await fetch(`${SEARCH_URL}/search?q=${encodeURIComponent(q)}&k=${k ?? 20}`);
      if (!res.ok) return reply.code(502).send({ error: "search backend error" });
      hits = (await res.json()) as { neta_id: string; score: number }[];
    } catch {
      return reply.code(503).send({ error: "search backend unavailable" });
    }
    return hits
      .map((h) => {
        const n = core.getNeta(h.neta_id);
        return n ? { ...n, score: h.score } : null;
      })
      .filter((n): n is NonNullable<typeof n> => n !== null);
  });

  return app;
}
