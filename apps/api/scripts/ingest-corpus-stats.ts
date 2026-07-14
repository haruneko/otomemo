// コーパス遷移統計テーブル（WP-0・design #21）への投入スクリプト。
// data/corpus-stats/*.json（M2 骨格 bigram/trigram＋分布・M9 変換文法）→ corpus_* テーブルへ INSERT OR REPLACE（冪等）。
// **DB 変更前にバックアップ**（data/backups/ へ日時つき cp）。既存 neta 不可侵・project 自作データ不可侵（新テーブルへの追加のみ）。
// 使い方: CM_DB=<path> npx tsx scripts/ingest-corpus-stats.ts [--no-backup]
import { readFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/db";

const scriptDir = dirname(fileURLToPath(import.meta.url)); // apps/api/scripts
import { ingestCorpusStats, type SkeletonStatsJson, type MotifStatsJson } from "../src/music/corpusStats";

function readJson<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, "utf8")) as T; } catch { return null; }
}

function main(): void {
  const dbPath = process.env.CM_DB;
  if (!dbPath) { console.error("usage: CM_DB=<path> tsx scripts/ingest-corpus-stats.ts [--no-backup]"); process.exit(1); }
  const noBackup = process.argv.includes("--no-backup");

  // 素材（リポジトリ相対＝apps/api/scripts から見て ../../../data/corpus-stats）
  const statsDir = join(scriptDir, "..", "..", "..", "data", "corpus-stats");
  const skeleton = readJson<SkeletonStatsJson>(join(statsDir, "skeleton-corpus-stats-20260714.json"));
  const motif1 = readJson<MotifStatsJson>(join(statsDir, "motif-transform-stats-1bar.json"));
  const motif2 = readJson<MotifStatsJson>(join(statsDir, "motif-transform-stats-2bar.json"));
  if (!skeleton && !motif1 && !motif2) { console.error(`no corpus-stats JSON found under ${statsDir}`); process.exit(1); }

  // バックアップ（DB 変更前・必須）
  if (!noBackup && existsSync(dbPath)) {
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14).replace(/(\d{8})(\d{6})/, "$1-$2");
    const backupDir = join(dirname(dbPath), "backups");
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    const dest = join(backupDir, `cm-corpus-stats-preingest-${ts}.sqlite`);
    copyFileSync(dbPath, dest);
    console.log(`backup: ${dest}`);
  }

  const db = openDb(dbPath); // openDb が CREATE TABLE IF NOT EXISTS で corpus_* を用意
  const res = ingestCorpusStats(db, { skeleton, motif1, motif2 });
  console.log(`ingested: note_transition=${res.noteTransitions} skeleton_prior=${res.skeletonPriors} motif_transform=${res.motifTransforms}`);
  db.close();
}

main();
