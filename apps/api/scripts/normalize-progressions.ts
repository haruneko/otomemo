// 進行コーパスの在DB正規化（R0・2026-07-14）。U-FRET 生データ消失で再ingest不能 → 既存 neta を畳む。
// 断片(≤2)除去・品質語彙正準化・six-based署名で dedup(count集約)。対象は scope=library の chord_progression のみ
// （project の自作進行は絶対に触らない）。
// 使い方: CM_DB=<path> npx tsx scripts/normalize-progressions.ts [--apply]
//   --apply 無し＝DRY（集計のみ・DB無変更）。--apply でDB更新。
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { normalizeProgressions, type ProgItem, type ProgChord } from "../src/corpus-normalize";

function main(): void {
  const dbPath = process.env.CM_DB;
  const apply = process.argv.includes("--apply");
  if (!dbPath) { console.error("usage: CM_DB=<path> tsx scripts/normalize-progressions.ts [--apply]"); process.exit(1); }
  const core = new Core(openDb(dbPath));

  const rows = core.listNeta({ kind: "chord_progression", scope: "library", limit: 99999 });
  const items: ProgItem[] = [];
  const contentById = new Map<string, Record<string, unknown>>();
  for (const n of rows) {
    const content = (n.content ?? {}) as Record<string, unknown>;
    const chords = (content.chords as ProgChord[] | undefined) ?? [];
    const mode = n.mode === "minor" ? "minor" : "major";
    const count = typeof content.count === "number" ? content.count : 1;
    items.push({ id: n.id, mode, chords, count });
    contentById.set(n.id, content);
  }

  const before = { total: items.length, fragments: items.filter((i) => i.chords.length < 3).length };
  const { keep, drop } = normalizeProgressions(items);
  const merged = drop.length - before.fragments; // 断片以外の削除＝dedup で畳んだ相方

  console.log(`進行コーパス正規化（scope=library, ${apply ? "APPLY" : "DRY"}）`);
  console.log(`  before: ${before.total}件（うち断片≤2和音: ${before.fragments}）`);
  console.log(`  drop  : ${drop.length}件（断片 ${before.fragments} ＋ 重複/長短分裂の相方 ${merged}）`);
  console.log(`  after : ${keep.length}件（dedup後・count集約済）`);
  console.log(`  参考: after の断片率=0%（length≥3ゲート）・完全重複率=0%（署名dedup）`);

  if (!apply) { console.log("  (DRY＝DB無変更。--apply で反映)"); return; }

  let updated = 0, deleted = 0;
  for (const k of keep) {
    const content = contentById.get(k.id) ?? {};
    core.updateNeta(k.id, { content: { ...content, chords: k.chords, count: k.count }, mode: k.mode });
    updated++;
  }
  for (const id of drop) { core.deleteNeta(id); deleted++; }
  console.log(`  適用: 更新 ${updated}件 / 削除 ${deleted}件 → ${dbPath}`);
}

main();
