// (D) コード遷移統計（#21拡張・design「コーパス遷移統計テーブル 第2弾」）の在DB集計＋投入スクリプト。
// 在DB neta(kind=chord_progression, scope=library) の正規化済み進行（root=C相対度数/正準quality/count）を読み、
// root+品質トークンの bi/tri-gram を count 重みで数えて corpus_chord_transition へ INSERT OR REPLACE（冪等）。
// **在DB neta は読むだけ・書かない**／project 自作進行は不可侵（scope=library のみ集計）。DB 変更前にバックアップ。
// 使い方: CM_DB=data/cm.sqlite apps/api/node_modules/.bin/tsx apps/api/scripts/build-chord-transition.ts [--no-backup]
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildChordTransitions, ingestChordTransitions, type CorpusProgression } from "../src/music/corpusStats";

function main(): void {
  const dbPath = process.env.CM_DB;
  if (!dbPath) { console.error("usage: CM_DB=<path> tsx scripts/build-chord-transition.ts [--no-backup]"); process.exit(1); }
  const noBackup = process.argv.includes("--no-backup");

  if (!noBackup && existsSync(dbPath)) {
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14).replace(/(\d{8})(\d{6})/, "$1-$2");
    const backupDir = join(dirname(dbPath), "backups");
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    const dest = join(backupDir, `cm-chord-transition-prebuild-${ts}.sqlite`);
    copyFileSync(dbPath, dest);
    console.log(`backup: ${dest}`);
  }

  const db = openDb(dbPath); // openDb が corpus_chord_transition を CREATE TABLE IF NOT EXISTS で用意
  const core = new Core(db);
  const netas = core.listNeta({ kind: "chord_progression", scope: "library", limit: 100000 } as never);
  console.log(`library chord_progression neta: ${netas.length}`);

  const progs: CorpusProgression[] = [];
  let skippedNoChords = 0, skippedShort = 0;
  for (const n of netas) {
    const content = n.content as { chords?: { root?: number; quality?: string }[]; count?: number } | null;
    const chords = content?.chords;
    if (!Array.isArray(chords) || chords.length === 0) { skippedNoChords++; continue; }
    const clean = chords
      .filter((c) => Number.isFinite(c?.root))
      .map((c) => ({ root: Number(c.root), quality: String(c.quality ?? "") }));
    if (clean.length < 2) { skippedShort++; continue; } // 遷移が無い（1和音）＝スキップ
    progs.push({ chords: clean, mode: n.mode === "minor" ? "minor" : "major", count: Number(content?.count) > 0 ? Number(content!.count) : 1 });
  }
  console.log(`usable progressions: ${progs.length}（skip: no-chords=${skippedNoChords} / <2和音=${skippedShort}）`);

  const rows = buildChordTransitions(progs);
  const inserted = ingestChordTransitions(db, rows, "pop");
  const modes = rows.reduce((m, r) => ((m[r.mode] = (m[r.mode] ?? 0) + 1), m), {} as Record<string, number>);
  const ngrams = rows.reduce((m, r) => ((m[r.ngram] = (m[r.ngram] ?? 0) + 1), m), {} as Record<number, number>);
  console.log(`corpus_chord_transition rows: ${inserted}（mode=${JSON.stringify(modes)} / ngram=${JSON.stringify(ngrams)}）`);
  // 目視サンプル：major の I(0q) から最も来やすい遷移 top5
  const sample = rows.filter((r) => r.mode === "major" && r.ngram === 2 && r.from_ctx === "0q").sort((a, b) => b.count - a.count).slice(0, 5);
  console.log(`I(0q)→ top5(major bigram):`, sample.map((r) => `${r.to_tok}:${r.count}`).join("  "));
}

main();
