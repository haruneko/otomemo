// MIDI(SMF) → library melody 取り込み実行部（S6-b コーパス・ゲーム音楽/Falcom）。
// 使い方: CM_DB=./data/cm.sqlite npx tsx scripts/ingest-midi.ts <style> <dir|file.mid> [...]
//   例:   CM_DB=./data/cm.sqlite npx tsx scripts/ingest-midi.ts game /tmp/MIDI/SC-88
// 著作権：Falcom=使用OK・MIDI再配布NG。本取り込みは手元でエッセンス化のみ（MIDIは残さない/再配布しない）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { midiToNeta } from "../src/ingest-midi";

function collect(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      if (/(^|\/)versions$/.test(p)) continue; // POP909 の versions/（同曲の別アレンジ＝メロ重複）は除外
      for (const f of readdirSync(p)) collect([join(p, f)]).forEach((x) => out.push(x)); // 再帰（POP909=曲別サブフォルダ）
    } else if (/\.midi?$/i.test(p)) out.push(p);
  }
  return out;
}

function main(): void {
  const [style, ...paths] = process.argv.slice(2);
  const dbPath = process.env.CM_DB;
  if (!style || !paths.length || !dbPath) {
    console.error("usage: CM_DB=<path> tsx scripts/ingest-midi.ts <style> <dir|file.mid> [...]");
    process.exit(1);
  }
  const core = new Core(openDb(dbPath));
  const track = process.env.CM_MIDI_TRACK; // 例 MELODY（POP909）。無指定=lead ch 推定。
  const files = collect(paths);
  let created = 0;
  let skipped = 0;
  for (const f of files) {
    let input = null;
    try {
      input = midiToNeta(new Uint8Array(readFileSync(f)), f.split("/").pop() ?? f, style, track ? { track } : undefined);
    } catch (e) {
      console.error(`  ${f}: parse error ${(e as Error).message}`);
    }
    if (input) {
      core.createNeta(input);
      created++;
    } else skipped++;
  }
  console.log(`done: ${files.length} files → +${created} melodies, skipped ${skipped} (style=${style}) → ${dbPath}`);
}

main();
