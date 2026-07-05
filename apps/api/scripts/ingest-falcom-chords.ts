// Falcom MIDI → コード進行 取り込み（S6-b コーパス）。多声から各小節のコードを検出しCへ正規化して投入。
// 使い方: CM_DB=... npx tsx scripts/ingest-falcom-chords.ts <falcom-dir> [style=game]
// 著作権：Falcom 使用OK・MIDI再配布NG。本取り込みは度数列（C基準）＝抽象のみ保存・MIDIは残さない。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { parseMidi, meterOf } from "../src/music/midi";
import { isStandardMeter } from "../src/music/phrase";
import { midiBarChords } from "../src/music/chordDetect";
import { detectKeyFromNotes } from "../src/music";

function main(): void {
  const [dir, style = "game"] = process.argv.slice(2);
  const dbPath = process.env.CM_DB;
  if (!dir || !dbPath) {
    console.error("usage: CM_DB=<path> tsx scripts/ingest-falcom-chords.ts <falcom-dir> [style]");
    process.exit(1);
  }
  const core = new Core(openDb(dbPath));
  const files: string[] = [];
  const walk = (p: string): void => { for (const f of readdirSync(p)) { const fp = join(p, f); if (statSync(fp).isDirectory()) walk(fp); else if (/\.midi?$/i.test(f)) files.push(fp); } };
  walk(dir);

  // 既存の Falcom コード進行（再実行で重複しないよう削除）
  const old = core.listNeta({ kind: "chord_progression", scope: "library", limit: 99999 })
    .filter((n) => (n.tags ?? []).includes("Falcom"));
  for (const n of old) core.deleteNeta(n.id);

  let created = 0;
  const seen = new Set<string>();
  for (const f of files) {
    const parsed = parseMidi(new Uint8Array(readFileSync(f)));
    const meter = meterOf(parsed);
    if (!meter || !isStandardMeter(meter)) continue;
    const key = detectKeyFromNotes(parsed.notes);
    const bars = midiBarChords(parsed.notes, meter, 1);
    if (bars.length < 4) continue;
    // Cへ正規化（root - key）して先頭16小節を代表に。
    const chords = bars.slice(0, 16).map((c) => ({ root: ((c.root - key.key) % 12 + 12) % 12, quality: c.quality, start: c.start, dur: c.dur }));
    const sig = chords.map((c) => `${c.root}:${c.quality}`).join("|");
    if (seen.has(sig)) continue; // 完全重複は1つに
    seen.add(sig);
    const name = f.split("/").pop() ?? f;
    core.createNeta({
      kind: "chord_progression",
      title: `Falcom ${name}`,
      content: { chords, source: { artist: "Falcom", song: name } },
      key: 0,
      mode: key.mode,
      meter,
      scope: "library",
      tags: ["取込", style, "Falcom"],
    });
    created++;
  }
  console.log(`Falcom コード進行: ${files.length}ファイル → 旧${old.length}削除 → ${created}件 投入 → ${dbPath}`);
}

main();
