// 辞書→ライブラリネタのシードパイプライン（Task2/L2・2026-07-23）。正典＝docs/design.md
//   「### Task2/L2＝辞書→ライブラリネタのシードパイプライン」＋「### Task2/L1＝…タグ/scope 設計」（タグ文字列 SSOT）。
// コード内3辞書（chordLibrary 26型／bassLibrary 33型／drumLibrary 18型）を生成器に通して content 化し、
//   scope:"library"＋lib:factory タグのネタへ一括変換する冪等スクリプト（ingest-falcom-chords.ts を雛形）。
// 使い方: CM_DB=<path> npx tsx scripts/seed-pattern-library.ts
// 鉄則：scope:"library"＋lib:factory のネタだけを作る/消す。project scope の既存ネタには一切触らない。
import { pathToFileURL } from "node:url";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import type { NetaInput } from "../src/types";
import { COMP_TYPES } from "../src/music/chordLibrary";
import { BASS_TYPES } from "../src/music/bassLibrary";
import { BEAT_PATTERNS } from "../src/music/drumLibrary";
import { genChordPattern, genBass, genDrums, type Frame } from "../src/music/generate";

// L1 SSOT のタグ接頭辞。
const LIB_FACTORY = "lib:factory"; // 工場出荷（来歴）＝この seed が作る/消す唯一のマーカー。
const tempoTag = (min: number, max: number): string => `tempo:${min}-${max}`;

export interface SeedCounts { deleted: number; chord: number; bass: number; drum: number }

/**
 * 3辞書をライブラリネタ（scope:"library"）へ冪等 seed する本体。スクリプトは env を読んでこれを呼ぶ薄いラッパ。
 * - 冪等：投入前に scope:"library"＋lib:factory の旧 seed を全削除→再投入（再実行で件数が増えない）。
 * - タグ（L1 SSOT）：lib:factory／genre:<g>／scene:<role>（複数 role は複数）／tempo:<min>-<max>／pat:<型ID>。
 * - 4/4系のみ（L3 ピッカーが4/4前提）：chord/bass は全型4/4・drum は meter:"4/4" の型のみ（6/8=six8.ballad は除外）。
 * - フィル型（FILL_TYPES・BASS_FILLS）は base 型のみの今回シードには含めない（BEAT_PATTERNS/BASS_TYPES に限定）。
 */
export function seedPatternLibrary(core: Core): SeedCounts {
  // ── 冪等削除（既存ネタ不可侵）：scope:"library" かつ lib:factory で厳格に絞ってから消す。 ──
  const old = core.listNeta({ scope: "library", tags: [LIB_FACTORY], limit: 99999 });
  for (const n of old) core.deleteNeta(n.id);

  const seed = 1; // 型ID直指定なので content は決定的（seed は content に影響しない）。
  let chord = 0, bass = 0, drum = 0;

  // ── コード楽器（kind:"chord_pattern"・COMP_TYPES＝鍵盤13＋ギター13＝26型・全4/4） ──
  //   genChordPattern が型ID→content（mode/voicing/steps/hits/patternId・keyboard は voicing.top=72＋lh）を組む。
  for (const t of COMP_TYPES) {
    const frame: Frame = { key: 0, meter: "4/4", bars: 1, tempo: t.tempoMin, section: { role: t.roles[0] } };
    const content = genChordPattern(frame, seed, { pattern: t.id }).items[0]!.content;
    core.createNeta(withLib({
      kind: "chord_pattern",
      title: `${t.id} ${t.scenes}`,
      content,
      key: 0,
      meter: "4/4",
      tempo: t.tempoMin,
      tags: [`genre:${t.genre}`, ...t.roles.map((r) => `scene:${r}`), tempoTag(t.tempoMin, t.tempoMax), `pat:${t.id}`],
    }));
    chord++;
  }

  // ── ベース（kind:"bass"・BASS_TYPES 33型・全4/4）＝相対 content（mode:"relative"・度数×step）のみ。 ──
  //   relative:true で実音化せず相対 content を出す。絶対 notes が来たら設計違反＝捨てる（throw）。
  for (const t of BASS_TYPES) {
    const frame: Frame = { key: 0, meter: "4/4", bars: 1, tempo: t.tempoMin, section: { role: t.roles[0] } };
    const content = genBass(frame, undefined, seed, undefined, { style: t.id, relative: true }).items[0]!.content;
    if ((content as { mode?: string })?.mode !== "relative") {
      throw new Error(`seed-pattern-library: bass ${t.id} の content が relative でない（絶対 notes は捨てる）`);
    }
    core.createNeta(withLib({
      kind: "bass",
      title: `${t.id} ${t.genre} ${t.roles.join("/")}`,
      content,
      key: 0,
      meter: "4/4",
      tempo: t.tempoMin,
      tags: [`genre:${t.genre}`, ...t.roles.map((r) => `scene:${r}`), tempoTag(t.tempoMin, t.tempoMax), `pat:${t.id}`],
    }));
    bass++;
  }

  // ── ドラム（kind:"rhythm"・BEAT_PATTERNS）＝meter:"4/4" の型のみ（6/8=six8.ballad は L3 4/4前提でスキップ）。 ──
  //   BeatPattern は roles を持たない（ジャンル×役割の対応は GENRE_TABLE 側）＝scene タグは付けない。
  //   genres は配列＝genre タグは複数付く。bars=型の bars（amen/bossa=2）。
  for (const t of BEAT_PATTERNS) {
    if (t.meter !== "4/4") continue; // 非4/4（6/8）は L3 ピッカーが4/4前提ゆえスキップ。
    const frame: Frame = { key: 0, meter: "4/4", bars: t.bars, tempo: t.tempoMin };
    const content = genDrums(frame, seed, { style: t.id }).items[0]!.content;
    core.createNeta(withLib({
      kind: "rhythm",
      title: `${t.id} ${t.genres.join("/")}`,
      content,
      meter: "4/4",
      tempo: t.tempoMin,
      bars: t.bars,
      tags: [...t.genres.map((g) => `genre:${g}`), tempoTag(t.tempoMin, t.tempoMax), `pat:${t.id}`],
    }));
    drum++;
  }

  return { deleted: old.length, chord, bass, drum };
}

// scope:"library"＋lib:factory を全 seed ネタへ強制付与（作る対象を一意に固定＝既存ネタ不可侵の担保）。
function withLib(input: Omit<NetaInput, "scope"> & { tags: string[] }): NetaInput {
  return { ...input, scope: "library", tags: [LIB_FACTORY, ...input.tags] };
}

function main(): void {
  const dbPath = process.env.CM_DB;
  if (!dbPath) {
    console.error("usage: CM_DB=<path> npx tsx scripts/seed-pattern-library.ts");
    process.exit(1);
  }
  const core = new Core(openDb(dbPath));
  const r = seedPatternLibrary(core);
  console.log(
    `パターンライブラリ seed: 旧${r.deleted}削除 → chord ${r.chord}・bass ${r.bass}・drum ${r.drum}（計 ${r.chord + r.bass + r.drum}）投入 → ${dbPath}`,
  );
}

// 直接実行時のみ main（import 時＝テストからは実行しない）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
