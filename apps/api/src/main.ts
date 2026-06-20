import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openDb } from "./db";
import { Core } from "./core";
import { buildHttp } from "./http";

const dbPath = process.env.CM_DB ?? "./data/cm.sqlite";
const port = Number(process.env.PORT ?? 8787);

if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

const core = new Core(openDb(dbPath));
const app = buildHttp(core);

app
  .listen({ host: "0.0.0.0", port })
  .then((addr) => console.log(`cm api listening on ${addr} (db: ${dbPath})`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

// 受け取り：非同期で進んだ生成（おまかせ/plan の子など）の結果をネタ化する常駐ループ
setInterval(() => {
  try {
    const n = core.reapResults();
    if (n > 0) console.log(`reaped ${n} async generation result(s) into neta`);
  } catch (e) {
    console.error("reap error", e);
  }
}, 5000).unref();
