// (A) メロ句辞書（#21拡張・design「コーパス遷移統計テーブル 第2弾」(A)）の在DB集計＋投入スクリプト。
// 在DB neta(kind=melody, scope=library) の phase_ok な pop 句を **度数+リズム** へ相対化して corpus_phrase_pattern へ
// INSERT OR REPLACE（冪等・同型句は count 加算で畳む）。リテラル絶対pitchは非保存。**在DB neta は読むだけ**・バックアップ付き。
// pop 先行（game/irish は phase 再正規化が M2 raw 依存で保留）。
// 使い方: CM_DB=data/cm.sqlite apps/api/node_modules/.bin/tsx apps/api/scripts/build-phrase-pattern.ts [--no-backup]
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildPhrasePatterns, ingestPhrasePatterns, type CorpusMelody } from "../src/music/corpusStats";

function main(): void {
  const dbPath = process.env.CM_DB;
  if (!dbPath) { console.error("usage: CM_DB=<path> tsx scripts/build-phrase-pattern.ts [--no-backup]"); process.exit(1); }
  const noBackup = process.argv.includes("--no-backup");

  if (!noBackup && existsSync(dbPath)) {
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14).replace(/(\d{8})(\d{6})/, "$1-$2");
    const backupDir = join(dirname(dbPath), "backups");
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    const dest = join(backupDir, `cm-phrase-pattern-prebuild-${ts}.sqlite`);
    copyFileSync(dbPath, dest);
    console.log(`backup: ${dest}`);
  }

  const db = openDb(dbPath);
  const core = new Core(db);
  const netas = core.listNeta({ kind: "melody", scope: "library", limit: 100000 } as never);
  console.log(`library melody neta: ${netas.length}`);

  const melodies: CorpusMelody[] = [];
  let skipNoNotes = 0, skipNotPop = 0, skipNoPhase = 0;
  for (const n of netas) {
    const isPop = (n.tags ?? []).some((t) => /pop/i.test(t)); // pop 先行
    if (!isPop) { skipNotPop++; continue; }
    const content = n.content as { notes?: { pitch?: number; start?: number; dur?: number }[]; count?: number; pickup?: number; phase_ok?: boolean } | null;
    if (!content?.phase_ok) { skipNoPhase++; continue; } // メトリック健全ゲート（R0§2.1）
    const notes = content?.notes;
    if (!Array.isArray(notes) || notes.length === 0) { skipNoNotes++; continue; }
    melodies.push({
      notes: notes.filter((x) => Number.isFinite(x?.pitch)).map((x) => ({ pitch: Number(x.pitch), start: Number(x.start ?? 0), dur: Number(x.dur ?? 0) })),
      mode: n.mode === "minor" ? "minor" : "major",
      count: Number(content?.count) > 0 ? Number(content!.count) : 1,
      meter: n.meter ?? "4/4",
      bars: Number.isFinite(n.bars) ? Number(n.bars) : 4,
      pickup: Number(content?.pickup) || 0,
      phaseOk: true,
    });
  }
  console.log(`usable pop phrases: ${melodies.length}（skip: not-pop=${skipNotPop} / no-phase_ok=${skipNoPhase} / no-notes=${skipNoNotes}）`);

  const rows = buildPhrasePatterns(melodies);
  const inserted = ingestPhrasePatterns(db, rows, "pop");
  const modes = rows.reduce((m, r) => ((m[r.mode] = (m[r.mode] ?? 0) + 1), m), {} as Record<string, number>);
  const dedup = melodies.length - rows.length;
  console.log(`corpus_phrase_pattern rows: ${inserted}（mode=${JSON.stringify(modes)} / 同型畳み込み=${dedup}）`);
  const sample = rows.slice().sort((a, b) => b.count - a.count).slice(0, 3);
  for (const s of sample) console.log(`  top count=${s.count} mode=${s.mode} bars=${s.bars} notes=${(JSON.parse(s.degrees) as unknown[]).length} degrees[0..3]=${JSON.stringify((JSON.parse(s.degrees) as unknown[]).slice(0, 3))}`);
}

main();
