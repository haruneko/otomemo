// ドラムフィルの耳確認用 MIDI 書き出し（M2）。otomemo 側 TS（drumFill.ts + humanizeFill.ts）が
// 生成した note 列を GM ドラム ch10 の .mid にする。owner が vendored fluidsynth で WAV 化し、
// phrase_maker 原音（experiments/drums/fills/out/*.wav）と並べて A/B する。
//
// 出力：<outdir>/otomemo-fill-<kind>.mid（既定 kind＝tom_descent/snare_roll/triplet_cascade/buildup）。
// 構成：リードイン1小節の素グルーヴ → フィル本体（bar1・length=bar）→ 着地頭（bar2 beat0 の crash+kick）。
// テンポ 140bpm・seed 文字列 "otomemo-fill-<kind>"。ヒューマナイズ（相関 Breath＋voice別オフセット）適用。
//
// 実行：packages/music-core で  npx tsx scripts/exportFillMidi.ts [outdir] [--all] [--intensity=medium]
import { writeFileSync } from "node:fs";
import {
  placeFill, applyFills, fillMeter, GM_NOTE, DUR_S, type FillEvent, type DrumVoice,
} from "../src/drumFill";
import { Breath, stableSeed, humanizeSeconds } from "../src/humanizeFill";

// ---- 最小 SMF(format 0) writer -------------------------------------------
function varLen(n: number): number[] {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) { bytes.unshift((n & 0x7f) | 0x80); n >>= 7; }
  return bytes;
}

interface MidiNote { tick: number; durTick: number; pitch: number; vel: number }

function writeSmf(notes: MidiNote[], bpm: number, division = 480): Uint8Array {
  type Ev = { tick: number; data: number[]; order: number };
  const evs: Ev[] = [];
  for (const n of notes) {
    evs.push({ tick: n.tick, data: [0x99, n.pitch, n.vel], order: 1 }); // note-on ch10 (0x99=ch9)
    evs.push({ tick: n.tick + Math.max(1, n.durTick), data: [0x89, n.pitch, 0], order: 0 }); // note-off
  }
  evs.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const track: number[] = [];
  // tempo meta
  const usPerQ = Math.round(60000000 / bpm);
  track.push(0x00, 0xff, 0x51, 0x03, (usPerQ >> 16) & 0xff, (usPerQ >> 8) & 0xff, usPerQ & 0xff);
  let last = 0;
  for (const e of evs) {
    track.push(...varLen(e.tick - last));
    track.push(...e.data);
    last = e.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00); // end of track
  const header = [
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (division >> 8) & 0xff, division & 0xff,
  ];
  const len = track.length;
  const trkHdr = [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff];
  return Uint8Array.from([...header, ...trkHdr, ...track]);
}

// ---- 素グルーヴ（リードイン用・qb）----------------------------------------
function grooveBar(barStartQb: number): FillEvent[] {
  const ev: FillEvent[] = [];
  const push = (off: number, voice: DrumVoice, velocity: number) => ev.push({ beat: barStartQb + off, voice, velocity });
  push(0, "kick", 100); push(2, "kick", 96);
  push(1, "snare", 104); push(3, "snare", 104);
  for (let i = 0; i < 8; i++) push(i * 0.5, "chh", i % 2 === 0 ? 78 : 66);
  return ev;
}

// ---- build one kind -> notes ---------------------------------------------
const BPM = 140;
const DIVISION = 480;

function buildKind(kind: string, intensity: string): MidiNote[] {
  const fm = fillMeter("4/4");
  // リードイン bar0 グルーヴ、フィル bar1（length=bar）、着地 bar2 beat0。
  const groove = grooveBar(0);
  const p = placeFill(1, 0.0, "bar", intensity, kind, fm);
  const { merged } = applyFills(groove, [p]);
  // ヒューマナイズ（qb→秒）＋ SMF ノート化。
  const breath = new Breath(stableSeed(`otomemo-fill-${kind}`));
  const spb = 60.0 / BPM; // 秒/四分
  const notes: MidiNote[] = [];
  for (const e of merged) {
    const tSec = e.beat * spb;
    const h = humanizeSeconds(e.voice, tSec, e.velocity, breath);
    const start = h.t;
    const durSec = DUR_S[e.voice] ?? 0.1;
    notes.push({
      tick: Math.round((start / spb) * DIVISION),
      durTick: Math.round((durSec / spb) * DIVISION),
      pitch: GM_NOTE[e.voice],
      vel: h.velocity,
    });
  }
  notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
  return notes;
}

function main() {
  const args = process.argv.slice(2);
  const outdir = args.find((a) => !a.startsWith("--")) ?? ".";
  const all = args.includes("--all");
  const intenArg = args.find((a) => a.startsWith("--intensity="));
  const kinds = all
    ? ["snare_roll", "snare_roll_32", "tom_descent", "triplet_cascade", "flam_accents", "sixteenth_groove", "herta", "gallop", "offbeat_syncopated", "buildup"]
    : ["tom_descent", "snare_roll", "triplet_cascade", "buildup"];
  for (const kind of kinds) {
    const intensity = intenArg ? intenArg.split("=")[1]! : (kind === "buildup" ? "flashy" : "medium");
    const notes = buildKind(kind, intensity);
    const smf = writeSmf(notes, BPM, DIVISION);
    const path = `${outdir}/otomemo-fill-${kind}.mid`;
    writeFileSync(path, smf);
    console.log(`wrote ${path}  (${notes.length} notes, ${intensity}, ${BPM}bpm)`);
  }
}

main();
