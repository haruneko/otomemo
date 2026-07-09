// 一度きり保守（2026-07-09）：job.params に残った base64 音声を asset(data/assets/) へ移し、
// content-hash で重複排除して1本化し、job.params からは base64 を除去する。
// 設計思想「音源は捨てて派生事実だけ残す」の消し忘れ回収＋ユーザー選択「asset に移して1本化」。
//
// 使い方：
//   DRY（既定・書き込まない）: pnpm exec tsx scripts/migrate-audio-to-assets.ts
//   本実行                  : MIGRATE_APPLY=1 pnpm exec tsx scripts/migrate-audio-to-assets.ts
// 本実行は **api 停止中・バックアップ後** に限る（WAL 競合と事故防止）。
import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const APPLY = process.env.MIGRATE_APPLY === "1";
const DB_PATH = process.env.CM_DB ?? join("data", "cm.sqlite");
const ASSETS_DIR = process.env.CM_ASSETS_DIR ?? join(dirname(DB_PATH), "assets");
const now = () => new Date().toISOString();

const db = new Database(DB_PATH, { readonly: !APPLY });
if (APPLY) db.pragma("journal_mode = WAL");

type Job = { id: string; intent: string; params: string };
const jobs = db.prepare(`SELECT id, intent, params FROM job WHERE params IS NOT NULL`).all() as Job[];

// audio_b64 を含む各「音源」を (jobId, ラベル, bytes) で列挙。study=works[].audio_b64／audio_analyze=audio_b64。
type Blob = { jobId: string; intent: string; label: string; b64: string };
const blobs: Blob[] = [];
const jobsToStrip = new Set<string>();
for (const j of jobs) {
  let p: unknown;
  try { p = JSON.parse(j.params); } catch { continue; }
  if (!p || typeof p !== "object") continue;
  const o = p as Record<string, unknown>;
  if (Array.isArray(o.works)) {
    for (const w of o.works as Record<string, unknown>[]) {
      if (typeof w.audio_b64 === "string" && w.audio_b64.length > 1000) {
        blobs.push({ jobId: j.id, intent: j.intent, label: String(w.title ?? "audio"), b64: w.audio_b64 });
        jobsToStrip.add(j.id);
      }
    }
  }
  if (typeof o.audio_b64 === "string" && o.audio_b64.length > 1000) {
    blobs.push({ jobId: j.id, intent: j.intent, label: String(o.filename ?? "audio"), b64: o.audio_b64 });
    jobsToStrip.add(j.id);
  }
}

// content-hash で厳密重複排除（タイトル一致でなく実バイトで判定）。
type Uniq = { sha: string; bytes: Buffer; label: string; jobIds: Set<string> };
const byHash = new Map<string, Uniq>();
let totalBase64Bytes = 0;
for (const b of blobs) {
  const bytes = Buffer.from(b.b64, "base64");
  totalBase64Bytes += b.b64.length;
  const sha = createHash("sha256").update(bytes).digest("hex");
  const u = byHash.get(sha) ?? { sha, bytes, label: b.label, jobIds: new Set<string>() };
  u.jobIds.add(b.jobId);
  byHash.set(sha, u);
}

// 既存 asset に同一 sha があれば再利用（再実行の冪等性）。
const existingBySha = new Map<string, string>();
for (const a of db.prepare(`SELECT id, meta FROM asset WHERE kind='audio'`).all() as { id: string; meta: string | null }[]) {
  try { const m = a.meta ? JSON.parse(a.meta) : null; if (m?.sha256) existingBySha.set(m.sha256, a.id); } catch { /* ignore */ }
}

// 生存する結果ネタ（job_result → neta 実在）を job ごとに集める＝source リンク先。
const survivingNetaOfJob = (jobId: string): string[] =>
  (db.prepare(
    `SELECT jr.neta_id FROM job_result jr JOIN neta n ON n.id = jr.neta_id WHERE jr.job_id = ?`,
  ).all(jobId) as { neta_id: string }[]).map((r) => r.neta_id);

console.log(`\n=== migrate-audio-to-assets (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
console.log(`DB=${DB_PATH}  assets=${ASSETS_DIR}`);
console.log(`base64音源の出現: ${blobs.length}個 / ユニーク(sha): ${byHash.size}個 / params保持job: ${jobsToStrip.size}件`);
console.log(`base64合計: ${(totalBase64Bytes / 1e6).toFixed(1)}MB → 回収見込み（重複+全params除去後）\n`);

if (APPLY && !existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });

const insertAsset = db.prepare(
  `INSERT INTO asset (id,kind,name,path,size,mime,meta,created) VALUES (@id,@kind,@name,@path,@size,@mime,@meta,@created)`,
);
const linkStmt = db.prepare(
  `INSERT INTO neta_asset (neta_id, asset_id, role, created) VALUES (?,?,?,?) ON CONFLICT(neta_id, asset_id, role) DO NOTHING`,
);
const updateParams = db.prepare(`UPDATE job SET params=@params, updated=@u WHERE id=@id`);

const run = db.transaction(() => {
  // ① ユニーク音源を asset 化（既存 sha は再利用）＋生存ネタへ source リンク。
  for (const u of byHash.values()) {
    let assetId = existingBySha.get(u.sha);
    if (!assetId) {
      assetId = randomUUID();
      const path = join(ASSETS_DIR, `${assetId}.mp3`);
      if (APPLY) {
        writeFileSync(path, u.bytes);
        insertAsset.run({ id: assetId, kind: "audio", name: u.label, path, size: u.bytes.length, mime: "audio/mpeg", meta: JSON.stringify({ sha256: u.sha, source: "migrated-from-job-params", label: u.label }), created: now() });
      }
      console.log(`  asset+ ${u.label}  ${(u.bytes.length / 1e6).toFixed(1)}MB  (${[...u.jobIds].length}件のjobで共有) -> ${assetId}${APPLY ? "" : " [dry]"}`);
    } else {
      console.log(`  asset= ${u.label}  既存 asset を再利用 -> ${assetId}`);
    }
    // 生存ネタへ source リンク
    const netas = new Set<string>();
    for (const jid of u.jobIds) for (const nid of survivingNetaOfJob(jid)) netas.add(nid);
    for (const nid of netas) { if (APPLY) linkStmt.run(nid, assetId, "source", now()); console.log(`    link source -> neta ${nid}${APPLY ? "" : " [dry]"}`); }
  }
  // ② 全 job.params から base64 を除去（他の params は温存）。
  let stripped = 0;
  for (const jid of jobsToStrip) {
    const row = db.prepare(`SELECT params FROM job WHERE id=?`).get(jid) as { params: string } | undefined;
    if (!row) continue;
    let p: Record<string, unknown>;
    try { p = JSON.parse(row.params); } catch { continue; }
    if (Array.isArray(p.works)) p.works = (p.works as Record<string, unknown>[]).map((w) => { const { audio_b64, ...rest } = w; return rest; });
    delete p.audio_b64;
    if (APPLY) updateParams.run({ id: jid, params: JSON.stringify(p), u: now() });
    stripped++;
  }
  console.log(`\n  params から base64 除去: ${stripped}件${APPLY ? "" : " [dry]"}`);
});

run();

if (APPLY) {
  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log("\nVACUUM 実行中…");
  db.exec("VACUUM");
  console.log("VACUUM 完了。");
}
db.close();
console.log(`\n=== 完了 (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);
