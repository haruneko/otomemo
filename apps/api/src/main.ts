import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { openDb } from "./db";
import { Core } from "./core";
import { buildHttp } from "./http";
import { runResearchJob } from "./research-runner";
import { parseMidiImport } from "./midi-import";

// CM_DB 未指定なら **リポジトリルートの data/cm.sqlite を絶対パスで**（cwd 依存で apps/api/data 等に
// rogue DB を作る事故を断つ・docs/design「アーキ是正 決定4」）。import.meta.dirname=apps/api/src。
const dbPath = process.env.CM_DB ?? join(import.meta.dirname, "../../../data/cm.sqlite");
const port = Number(process.env.PORT ?? 8787);
// 到達は Tailscale tailnet 限定（design #18）。既定 localhost＝LANにもネットにも晒さない。
// 外へは `tailscale serve 8787`(tailnet限定) で出す。LAN直開放したい時だけ CM_HOST=0.0.0.0。
const host = process.env.CM_HOST ?? "127.0.0.1";

// 公開ガード（design「アーキ是正 決定4」）：LAN直開放(0.0.0.0)でトークン無しは事故＝起動拒否。
// Tailscale IP 等の非loopbackは tailnet が境界＝設計どおり許容だが、トークン無しは警告。
const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
if (!loopback && !process.env.CM_TOKEN) {
  if (host === "0.0.0.0") {
    console.error("拒否: CM_HOST=0.0.0.0(LAN開放) で CM_TOKEN 未設定は危険。CM_TOKEN を設定して起動してください。");
    process.exit(1);
  }
  console.warn(`警告: CM_HOST=${host}(非loopback) で CM_TOKEN 未設定。Tailscale tailnet 限定前提。LAN/funnel 公開なら CM_TOKEN を設定すべき。`);
}

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
  pumpImportMidi();
  pumpResearch();
}, 5000).unref();

// #30後続 MIDI取込を api 内で（worker撤去の最後）。決定的・高速＝溜まってる分を一気に処理（busy不要・
// 遅い research の後ろで待たせない）。parse→completeJob({tracks})→reaper が melody/rhythm ネタに materialize。
function pumpImportMidi(): void {
  for (let i = 0; i < 20; i++) {
    let job;
    try {
      job = core.claimQueued(["import_midi"]);
    } catch (e) {
      console.error("import_midi claim error", e);
      return;
    }
    if (!job) return;
    try {
      const p = (job.params ?? {}) as { midi_b64?: string; filename?: string };
      core.completeJob(job.id, parseMidiImport(p.midi_b64 ?? "", p.filename ?? "midi"));
    } catch (e) {
      core.failJob(job.id, e instanceof Error ? e.message : String(e));
    }
  }
}

// #30 継続調査の consumer＝api が queued の research/collect を1件ずつ claude で実行（worker 置換）。
// 直列（researchBusy）＝claude を同時多発させない。claim は原子的（queued→running）で二重取りしない。
// runResearchJob が done/failed に確定→次tickで reaper が reference ネタ化しトレイへ。
let researchBusy = false;
function pumpResearch(): void {
  if (researchBusy) return;
  let job;
  try {
    job = core.claimQueued(["research", "collect"]);
  } catch (e) {
    console.error("research claim error", e);
    return;
  }
  if (!job) return;
  researchBusy = true;
  console.log(`research: running job ${job.id} (${job.intent})`);
  void runResearchJob(core, job).finally(() => {
    researchBusy = false;
    console.log(`research: job ${job.id} settled`);
  });
}
