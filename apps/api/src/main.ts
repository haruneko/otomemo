import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { openDb } from "./db";
import { Core } from "./core";
import { buildHttp } from "./http";

const dbPath = process.env.CM_DB ?? "./data/cm.sqlite";
const port = Number(process.env.PORT ?? 8787);
// 到達は Tailscale tailnet 限定（design #18）。既定 localhost＝LANにもネットにも晒さない。
// 外へは `tailscale serve 8787`(tailnet限定) で出す。LAN直開放したい時だけ CM_HOST=0.0.0.0。
const host = process.env.CM_HOST ?? "127.0.0.1";

if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

const core = new Core(openDb(dbPath));
const app = buildHttp(core);

async function start() {
  // 単一オリジン配信：web ビルド(apps/web/dist)があれば api が静的配信も担う。
  // ＝外部公開は :8787 の1ポートだけ（Tailscale 設定が楽・本番で vite 不要）。dev は従来どおり vite。
  const webDist = process.env.CM_WEB_DIST ?? join(import.meta.dirname, "../../web/dist");
  if (existsSync(webDist)) {
    const fastifyStatic = (await import("@fastify/static")).default;
    await app.register(fastifyStatic, { root: webDist });
    // API以外の GET(html要求) は SPA の index.html を返す（直リンク/リロード用）。
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && (req.headers.accept ?? "").includes("text/html")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not found" });
    });
    console.log(`serving web from ${webDist}`);
  }
  const addr = await app.listen({ host, port });
  console.log(`cm api listening on ${addr} (db: ${dbPath}, host: ${host})`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

// 受け取り：非同期で進んだ生成（おまかせ/plan の子など）の結果をネタ化する常駐ループ。
// #80 同じ interval で schedule の期日チェック（生産者=TS、Pythonは純消費者のまま）。
setInterval(() => {
  try {
    const n = core.reapResults();
    if (n > 0) console.log(`reaped ${n} async generation result(s) into neta`);
  } catch (e) {
    console.error("reap error", e);
  }
  try {
    const s = core.tickSchedules();
    if (s > 0) console.log(`scheduled ${s} job(s) from continuous research`);
  } catch (e) {
    console.error("schedule tick error", e);
  }
}, 5000).unref();
