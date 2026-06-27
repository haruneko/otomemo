// ABCコレクション → library melody 取り込み実行部（S6-b コーパス・実例）。
// 使い方: CM_DB=./data/cm.sqlite npx tsx scripts/ingest-abc.ts <style> <file.abc> [file2.abc ...]
//   例:   CM_DB=./data/cm.sqlite npx tsx scripts/ingest-abc.ts irish irishman.abc
//   env:  CM_INGEST_LIMIT(1ファイルあたり最大曲数・既定なし=全部)
// 著作権：PD旋律(IrishMAN等)はそのまま。Falcom等はエッセンスのみ保存の別経路に（§3-4）＝本スクリプトは notes 保存。
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { splitAbcTunes, abcTuneToNeta, abcStringsFromJson } from "../src/ingest-abc";

function main(): void {
  const [style, ...files] = process.argv.slice(2);
  const dbPath = process.env.CM_DB;
  if (!style || !files.length || !dbPath) {
    console.error("usage: CM_DB=<path> tsx scripts/ingest-abc.ts <style> <file.abc> [...]");
    process.exit(1);
  }
  const limit = process.env.CM_INGEST_LIMIT ? Number(process.env.CM_INGEST_LIMIT) : Infinity;
  mkdirSync(dirname(dbPath), { recursive: true });
  const core = new Core(openDb(dbPath));
  let total = 0;
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const tunes = f.toLowerCase().endsWith(".json") ? abcStringsFromJson(text) : splitAbcTunes(text);
    let created = 0;
    for (const tune of tunes) {
      if (created >= limit) break;
      const input = abcTuneToNeta(tune, style);
      if (input) {
        core.createNeta(input);
        created++;
      }
    }
    console.log(`${f}: ${tunes.length} tunes → +${created} melodies`);
    total += created;
  }
  console.log(`done: ${total} melodies (style=${style}, scope=library) → ${dbPath}`);
}

main();
