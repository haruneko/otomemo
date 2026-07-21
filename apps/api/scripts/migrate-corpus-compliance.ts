// コーパス著作権コンプライアンス移行（2026-07-21）。CLAUDE.md「他者コーパスからは統計のみ抽出＝リテラルな
// 旋律/モチーフは保存しない」に合わせ、他者の literal メロ（POP909 pop・game）を cm.sqlite から撤去し git外へ退避。
// 生成が要る"肌触り"は motif モデル(rhythm+move の count Map＝復元不能な統計)だけ焼いて残す＝生成は bit 不変。
// PD の irish 句は残置（placeable 可）。
//
// 手順: ①full library から style 別 motif モデルを焼く(data/corpus-stats/motif-model.json)
//       ②pop+game の literal メロを data/backups/ へ ndjson 退避（git外）
//       ③cm.sqlite から pop+game の melody(scope=library) を DELETE
// 使い方: CM_DB=data/cm.sqlite apps/api/node_modules/.bin/tsx apps/api/scripts/migrate-corpus-compliance.ts [--dry]
import { writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildMotifModel, serializeMotifModel, deserializeMotifModel, type MotifModelStat } from "../src/music/corpusBias";

// 撤去対象タグ＝既定 pop+game（他者copyright）。`--tags=irish` 等で上書き（irish転写も消す等）。
const tagsArg = process.argv.find((a) => a.startsWith("--tags="));
const REMOVE_TAGS = tagsArg ? tagsArg.slice("--tags=".length).split(",").map((s) => s.trim()).filter(Boolean) : ["pop", "game"];
const scriptDir = dirname(fileURLToPath(import.meta.url));

function deepEqualModel(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

function main(): void {
  const dbPath = process.env.CM_DB;
  if (!dbPath) { console.error("usage: CM_DB=<path> tsx scripts/migrate-corpus-compliance.ts [--dry]"); process.exit(1); }
  const dry = process.argv.includes("--dry");
  // --no-stats＝motif-model.json を焼かない（既に full library から焼き済みの時＝2回目以降の撤去で stats を壊さない）。
  const noStats = process.argv.includes("--no-stats");
  const db = openDb(dbPath);
  const core = new Core(db);

  const allMels = core.listNeta({ kind: "melody", scope: "library", limit: 999999 } as never);
  const styleTags = ["pop", "irish", "game"];
  console.log(`library melody: ${allMels.length}（${styleTags.map((t) => `${t}=${allMels.filter((m) => (m.tags ?? []).includes(t)).length}`).join(" / ")}）／remove tags=${REMOVE_TAGS.join("+")}${noStats ? " ／ --no-stats(既存statsを保持)" : ""}`);

  // ① style 別 motif モデルを焼く（__all__＝全 library・各 style＝タグ絞り）。serialize は配列＝順序保持。
  // ※--no-stats 時はスキップ＝既存 motif-model.json(full library 由来) を壊さない。
  const stats: Record<string, MotifModelStat> = {};
  const put = (key: string, mels: typeof allMels) => {
    const m = buildMotifModel(mels);
    if (!m) { console.log(`  skip "${key}"（モデル生成不能・素材不足）`); return; }
    const ser = serializeMotifModel(m);
    if (!deepEqualModel(serializeMotifModel(deserializeMotifModel(ser)), ser)) throw new Error(`round-trip mismatch for "${key}"`); // 順序保持の検証
    stats[key] = ser;
    console.log(`  "${key}": rhythm ${ser.rhythm.length}パターン / move ${ser.move.length}遷移`);
  };
  if (!noStats) {
    put("__all__", allMels);
    for (const t of styleTags) put(t, allMels.filter((m) => (m.tags ?? []).includes(t)));
    const statsPath = join(scriptDir, "..", "..", "..", "data", "corpus-stats", "motif-model.json");
    if (dry) console.log(`[dry] would write ${statsPath}`);
    else { mkdirSync(dirname(statsPath), { recursive: true }); writeFileSync(statsPath, JSON.stringify(stats)); console.log(`wrote ${statsPath}`); }
  } else console.log("  --no-stats: motif-model.json は既存を保持（再計算しない）");

  // ② pop+game の literal メロを git外(data/backups)へ退避＋③ DELETE。
  const removeMels = allMels.filter((m) => (m.tags ?? []).some((t) => REMOVE_TAGS.includes(t)));
  console.log(`remove target (${REMOVE_TAGS.join("+")}): ${removeMels.length} melodies`);
  if (removeMels.length === 0) { console.log("nothing to remove."); return; }

  const backupDir = join(dirname(dbPath), "backups");
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14).replace(/(\d{8})(\d{6})/, "$1-$2");
  if (!dry) copyFileSync(dbPath, join(backupDir, `cm-precompliance-${ts}.sqlite`)); // DB 丸ごとも保険で
  const dumpPath = join(backupDir, `corpus-literal-melodies-${ts}.ndjson`);
  const ndjson = removeMels.map((m) => JSON.stringify(m)).join("\n");
  if (dry) { console.log(`[dry] would backup ${removeMels.length} melodies → ${dumpPath}, then DELETE from DB`); return; }
  writeFileSync(dumpPath, ndjson);
  console.log(`backup(git外): ${dumpPath}`);

  // ③ DELETE（neta 本体＋タグ行）。core に delete API があればそれ、無ければ SQL。
  const del = db.transaction((ids: string[]) => {
    const dn = db.prepare(`DELETE FROM neta WHERE id=?`);
    const dt = db.prepare(`DELETE FROM neta_tag WHERE neta_id=?`);
    for (const id of ids) { dt.run(id); dn.run(id); }
  });
  del(removeMels.map((m) => m.id));
  const left = core.listNeta({ kind: "melody", scope: "library", limit: 999999 } as never);
  console.log(`deleted ${removeMels.length}. library melody now: ${left.length}（irish 等 PD 残置）`);
}

main();
