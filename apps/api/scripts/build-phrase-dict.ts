// フレーズ・パターン辞書の本ロード（S6-b コーパス圧縮）。
// 使い方: CM_DB=... npx tsx scripts/build-phrase-dict.ts <irish.json> <pop909-dir> <falcom-dir>
// 各源を「正しい拍子」で4小節フレーズ化 → style別クラスタ → recurring(count≥N) に圧縮 →
// library の旧メロ(irish/game/pop)を辞書パターンで置き換える。拍子源：irish=ABC M:、pop=beatファイル、game=MIDI time-sig。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { parseAbcTune, tonicPcOf, modeOf } from "../src/music/abc";
import { parseMidi, meterOf, leadChannelMelody, skylineMelody, notesOfTrackNamed, makeTickToSeconds } from "../src/music/midi";
import { isStandardMeter, segmentByBars, clusterPhrases, beatsPerBarFromBeats, firstDownbeatFromBeats, beatTimesFromBeats, remapToBeatGrid, phraseHasDownbeatOnset, scoreDurations } from "../src/music/phrase";
import { detectKeyFromNotes } from "../src/music";
import { normalizeToC } from "../src/music/melodyEssence";
import { meterInfo } from "../src/music/meter";

type Mode = "major" | "minor";
type Note = { pitch: number; start: number; dur: number };
type Phrase = { notes: Note[]; style: string; meter: string; mode: Mode };

// POP909 key_audio.txt（"start end Root:mode" 例 "Gb:m"）→ 主音pc＋mode。先頭(支配的)を採用。
function keyFromPop909(text: string): { keyPc: number; mode: Mode } {
  const label = (text.trim().split(/\r?\n/)[0] ?? "").trim().split(/\s+/)[2] ?? "C:maj";
  const [root, m] = label.split(":");
  const mode: Mode = (m ?? "").toLowerCase() === "m" || (m ?? "").toLowerCase().startsWith("min") ? "minor" : "major";
  return { keyPc: tonicPcOf(root ?? "C"), mode };
}
const MIN_COUNT: Record<string, number> = { irish: 3, pop: 3, game: 2 };
// フレーズが「メロらしい」か：音種が4つ以上＝ペダル/オスティナート/同音連打の区間を弾く。
const MELODIC = (ph: Note[]): boolean => new Set(ph.map((n) => ((n.pitch % 12) + 12) % 12)).size >= 4;

// IrishMAN json（[{ "abc notation" }]）→ irish フレーズ。拍子は ABC M:。
function irishPhrases(jsonPath: string): Phrase[] {
  const data = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, string>[];
  const out: Phrase[] = [];
  for (const e of data) {
    const abc = e["abc notation"];
    if (!abc) continue;
    const t = parseAbcTune(abc);
    if (!t.meter || !isStandardMeter(t.meter) || t.notes.length < 8) continue;
    const notesC = normalizeToC(t.notes, tonicPcOf(t.key)); // ABC は楽譜長＝音長復元は不要
    const mode = modeOf(t.key);
    for (const ph of segmentByBars(notesC, t.meter, 4).filter(MELODIC)) out.push({ notes: ph, style: "irish", meter: t.meter, mode });
  }
  return out;
}

// POP909（曲別フォルダ NNN/NNN.mid + beat_midi.txt）→ pop フレーズ。拍子は beat ファイルから復元。
// **位相の核（R0・2026-07-14）**：beat_midi.txt は 1列目=秒。MIDI拍(tick/division)は表情テンポ/曲頭
// オフセットで注釈拍に整数対応しない → テンポマップで note を秒化 → beat秒列へ内挿して「注釈拍座標」へ
// 写像（この座標で downbeat が整数拍=行index に乗る）→ anchor=firstDownbeat行index で 4小節分割。
// 旧実装は行index を MIDI拍と混同（anchor直流用）で位相が 0.25/0.75 に散っていた（拍0被覆54%→93%）。
function popPhrases(dir: string): Phrase[] {
  const out: Phrase[] = [];
  for (const id of readdirSync(dir).filter((d) => /^\d{3}$/.test(d))) {
    const base = join(dir, id);
    let bpb: number | null = null;
    let anchor: number | null = null;
    let beatTimes: number[] = [];
    try {
      const bt = readFileSync(join(base, "beat_midi.txt"), "utf8");
      bpb = beatsPerBarFromBeats(bt);
      anchor = firstDownbeatFromBeats(bt); // 注釈拍座標では行index（整数）が正しいアンカー
      beatTimes = beatTimesFromBeats(bt);
    } catch { continue; }
    if (!bpb || beatTimes.length < 4 || anchor === null) continue;
    const meter = `${bpb}/4`;
    const parsed = parseMidi(new Uint8Array(readFileSync(join(base, `${id}.mid`))));
    const melMidi = skylineMelody(notesOfTrackNamed(parsed, "MELODY"));
    if (melMidi.length < 8) continue;
    // MIDI拍 → 注釈拍座標へ写像（テンポマップ＋beat秒列内挿）。ここで拍位相が正しく揃う。
    const mel = remapToBeatGrid(melMidi, makeTickToSeconds(parsed), parsed.division, beatTimes);
    let kp = { keyPc: 0, mode: "major" as Mode };
    try { kp = keyFromPop909(readFileSync(join(base, "key_audio.txt"), "utf8")); } catch { /* 無ければ既定 */ }
    const notesC = normalizeToC(mel, kp.keyPc);
    // 音長復元はフレーズ単位（フレーズ内の音長相対で上限）。phase_ok（拍0近傍オンセット）ゲートで拍が食う句を捨てる。
    for (const ph of segmentByBars(notesC, meter, 4, 4, anchor).filter(MELODIC)) {
      const sc = scoreDurations(ph);
      if (!phraseHasDownbeatOnset(sc, bpb)) continue; // メトリック健全ゲート（R0§6.2(A)）
      out.push({ notes: sc, style: "pop", meter, mode: kp.mode });
    }
  }
  return out;
}

// Falcom（MIDIディレクトリ・再帰）→ game フレーズ。拍子は MIDI time-sig（変更/変拍子は捨てる）。
function falcomPhrases(dir: string): Phrase[] {
  const out: Phrase[] = [];
  const files: string[] = [];
  const walk = (p: string) => { for (const f of readdirSync(p)) { const fp = join(p, f); if (statSync(fp).isDirectory()) walk(fp); else if (/\.midi?$/i.test(f)) files.push(fp); } };
  walk(dir);
  for (const f of files) {
    const parsed = parseMidi(new Uint8Array(readFileSync(f)));
    const meter = meterOf(parsed);
    if (!meter || !isStandardMeter(meter)) continue;
    const mel = leadChannelMelody(parsed.notes, parsed.programs);
    if (mel.length < 8) continue;
    const k = detectKeyFromNotes(mel); // ゲームMIDIは注釈なし＝推定
    const notesC = normalizeToC(mel, k.key);
    const mode: Mode = k.mode === "minor" ? "minor" : "major";
    // 音長復元はフレーズ単位。
    for (const ph of segmentByBars(notesC, meter, 4).filter(MELODIC)) out.push({ notes: scoreDurations(ph), style: "game", meter, mode });
  }
  return out;
}

function main(): void {
  const [irishJson, popDir, falcomDir] = process.argv.slice(2);
  const dbPath = process.env.CM_DB;
  if (!irishJson || !popDir || !falcomDir || !dbPath) {
    console.error("usage: CM_DB=<path> tsx scripts/build-phrase-dict.ts <irish.json> <pop909-dir> <falcom-dir>");
    process.exit(1);
  }
  const core = new Core(openDb(dbPath));
  const STYLES = (process.env.CM_DICT_STYLES ?? "irish,pop,game").split(",").map((s) => s.trim()).filter(Boolean);
  const t0 = Date.now();
  const all: Phrase[] = [];
  if (STYLES.includes("irish")) all.push(...irishPhrases(irishJson));
  if (STYLES.includes("pop")) all.push(...popPhrases(popDir));
  if (STYLES.includes("game")) all.push(...falcomPhrases(falcomDir));
  console.log(`フレーズ抽出(${STYLES.join(",")}): ${all.length}個 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // style別にクラスタ → recurring(count≥N) に圧縮
  const patterns: ReturnType<typeof clusterPhrases> = [];
  for (const style of STYLES) {
    const sub = all.filter((p) => p.style === style);
    if (!sub.length) continue;
    const tc = Date.now();
    const cl = clusterPhrases(sub, 0.85).filter((p) => p.count >= (MIN_COUNT[style] ?? 3));
    console.log(`  ${style}: ${sub.length}フレーズ → ${cl.length}パターン (count≥${MIN_COUNT[style]}, ${((Date.now() - tc) / 1000).toFixed(1)}s)`);
    patterns.push(...cl);
  }

  // 旧コーパス(該当 style の melody)を削除し、パターン辞書を投入（mode/meter を保存）
  const old = core.listNeta({ kind: "melody", scope: "library", limit: 99999 }).filter((n) => (n.tags ?? []).some((t) => STYLES.includes(t)));
  for (const n of old) core.deleteNeta(n.id);
  for (const p of patterns) {
    const bpb = meterInfo(p.meter ?? "4/4").beatsPerBar;
    const phaseOk = phraseHasDownbeatOnset(p.notes, bpb);
    const pickup = Math.max(0, -Math.min(0, ...p.notes.map((n) => n.start))); // 弱起量（downbeat相対の負start絶対値）
    // key=0＝C正規化済みの明示（旧NULL廃止・R0§7）／bars=4＝句の小節数（明示）／phase_ok・pickup を content に。
    core.createNeta({ kind: "melody", title: `${p.style} pattern ×${p.count}`, content: { notes: p.notes, count: p.count, phase_ok: phaseOk, pickup }, key: 0, bars: 4, meter: p.meter ?? "4/4", mode: p.mode ?? null, scope: "library", tags: ["pattern", p.style] });
  }
  console.log(`置換: 旧メロ ${old.length}件 削除 → パターン ${patterns.length}件 投入 → ${dbPath}`);
}

main();
