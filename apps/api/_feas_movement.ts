// メロ生成フィジビリ v2：POP909 から ①リズム骨格 ②コード条件付き動き ③音高骨格/最初の音 を測る。
// 配管の肝＝MIDI拍 と 秒ベース注釈(chord/beat) の per-song 整数オフセット。
//   → 各曲で (chordシフトk, 小節位相φ) を「強拍コードトーン率最大」で探索し、
//     高信頼(≥85%)で整列できた曲だけ採用。rhythm/movement/開始音/輪郭 をその集合で集計。
//   注: 採用は chord-tone で選別するので「強拍コードトーン率」自体は選別で釣り上がる＝整列確認用。
//       rhythm/IOI/音程/開始音度数/頂点位置 は選別軸でない＝素直な分布。
// DB に一切書かない。使い方: npx tsx _feas_movement.ts <POP909-dir> [N=60] > report.md
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseMidi, notesOfTrackNamed, skylineMelody } from "./src/music/midi";
import { beatsPerBarFromBeats, segmentByBars } from "./src/music/phrase";

type Note = { pitch: number; start: number; dur: number };
const NAME_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = (r: string): number | null => { const m = /^([A-G])([#b]?)/.exec(r.trim()); if (!m) return null; let pc = NAME_PC[m[1]!]!; if (m[2] === "#") pc++; else if (m[2] === "b") pc--; return ((pc % 12) + 12) % 12; };
const QUAL: Record<string, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], "7": [0, 4, 7, 10], hdim7: [0, 3, 6, 10], maj6: [0, 4, 7, 9], min6: [0, 3, 7, 9], sus2: [0, 2, 7], sus4: [0, 5, 7], "sus4(b7)": [0, 5, 7, 10], dim7: [0, 3, 6, 9], minmaj7: [0, 3, 7, 11] };
type Chord = { sB: number; eB: number; root: number; pcs: number[] };

class Hist {
  m = new Map<string, number>();
  add(k: string | number, w = 1) { const s = String(k); this.m.set(s, (this.m.get(s) ?? 0) + w); }
  total() { return [...this.m.values()].reduce((a, b) => a + b, 0); }
  top(n = 99, byKeyNum = false) { let e = [...this.m.entries()]; e = byKeyNum ? e.sort((a, b) => Number(a[0]) - Number(b[0])) : e.sort((a, b) => b[1] - a[1]); const t = this.total() || 1; return e.slice(0, n).map(([k, c]) => [k, c, (100 * c) / t] as [string, number, number]); }
}
const bar = (p: number) => "█".repeat(Math.round(p / 2));
const fmt = (h: Hist, byKeyNum = false, n = 20, lab = (k: string) => k) => h.top(n, byKeyNum).map(([k, c, p]) => `  ${lab(k).padStart(8)} | ${p.toFixed(1).padStart(5)}% ${bar(p)} (${c})`).join("\n");
const COLOR = ["1(R)", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"];
const DEG = ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"];

// 集計器
const onsetInBar = new Hist(), ioi = new Hist();
const ctStrong = [0, 0], ctWeak = [0, 0];
const colorStrong = new Hist(), colorWeak = new Hist();
const intStrong = new Hist(), intWeak = new Hist();
const vlAtChange = new Hist();
const openColor = new Hist(), openDeg = new Hist();
const peakPos = new Hist(), skelColor = new Hist();
let kept = 0, scanned = 0, totNotes = 0;
const alignRates: number[] = [];

function loadSong(dir: string, id: string) {
  const base = join(dir, id);
  let bt: string, chTxt: string, keyTxt: string;
  try { bt = readFileSync(join(base, "beat_midi.txt"), "utf8"); chTxt = readFileSync(join(base, "chord_midi.txt"), "utf8"); } catch { return null; }
  try { keyTxt = readFileSync(join(base, "key_audio.txt"), "utf8"); } catch { keyTxt = "0 0 C:maj"; }
  const bpb = beatsPerBarFromBeats(bt); if (!bpb) return null;
  const beatSec = bt.trim().split(/\r?\n/).map((l) => Number(l.trim().split(/\s+/)[0]));
  const s2b = (sec: number): number => { if (sec <= beatSec[0]!) return 0; for (let i = 1; i < beatSec.length; i++) if (sec < beatSec[i]!) return i - 1 + (sec - beatSec[i - 1]!) / (beatSec[i]! - beatSec[i - 1]! || 1); return beatSec.length - 1; };
  const chords: Chord[] = chTxt.trim().split(/\r?\n/).map((l) => { const [s, e, lab] = l.trim().split(/\s+/); if (!lab || lab === "N") return null; const root = pcOf(lab.split(":")[0]!); const q = (lab.split(":")[1] ?? "maj").split("/")[0]!; const ints = QUAL[q]; if (root == null || !ints) return null; return { sB: s2b(Number(s)), eB: s2b(Number(e)), root, pcs: ints.map((i) => (root + i) % 12) }; }).filter(Boolean) as Chord[];
  if (chords.length < 4) return null;
  const mel = skylineMelody(notesOfTrackNamed(parseMidi(new Uint8Array(readFileSync(join(base, `${id}.mid`)))), "MELODY")).sort((a: Note, b: Note) => a.start - b.start);
  if (mel.length < 16) return null;
  const keyPc = pcOf((keyTxt.trim().split(/\r?\n/)[0] ?? "").split(/\s+/)[2]?.split(":")[0] ?? "C") ?? 0;
  return { bpb, chords, mel, keyPc };
}

function alignedChordAt(chords: Chord[], b: number): Chord | null { for (const c of chords) if (b >= c.sB - 1e-6 && b < c.eB) return c; return null; }

function analyze(dir: string, id: string): void {
  scanned++;
  const s = loadSong(dir, id); if (!s) return;
  const { bpb, chords, mel, keyPc } = s;
  // (k,φ) 探索：強拍コードトーン率最大
  let best = { k: 0, phi: 0, rate: 0 };
  for (let k = -8; k <= 8; k++) for (let phi = 0; phi < bpb; phi++) {
    let ct = 0, t = 0;
    for (const n of mel) { const pos = (((n.start - phi) % bpb) + bpb) % bpb; const strong = bpb === 4 ? (Math.abs(pos) < 0.12 || Math.abs(pos - 2) < 0.12) : Math.abs(pos) < 0.12; if (!strong) continue; const c = alignedChordAt(chords, n.start + k); if (!c) continue; t++; if (c.pcs.includes(((n.pitch % 12) + 12) % 12)) ct++; }
    if (t >= 8 && ct / t > best.rate) best = { k, phi, rate: ct / t };
  }
  alignRates.push(best.rate);
  if (best.rate < 0.85) return; // 高信頼で整列できた曲だけ採用
  kept++;
  const { k, phi } = best;
  const isStrong = (pos: number) => bpb === 4 ? (Math.abs(pos) < 0.12 || Math.abs(pos - 2) < 0.12) : Math.abs(pos) < 0.12;
  let prevChordStart = -1;
  for (let i = 0; i < mel.length; i++) {
    const n = mel[i]!, pc = ((n.pitch % 12) + 12) % 12;
    const pos = (((n.start - phi) % bpb) + bpb) % bpb;
    const strong = isStrong(pos);
    const c = alignedChordAt(chords, n.start + k);
    onsetInBar.add(Math.round(pos * 4) / 4);
    if (i + 1 < mel.length) { const d = mel[i + 1]!.start - n.start; if (d > 0) ioi.add(Math.round(d * 4) / 4); (strong ? intStrong : intWeak).add(Math.max(-12, Math.min(12, mel[i + 1]!.pitch - n.pitch))); }
    if (!c) continue;
    totNotes++;
    const color = ((pc - c.root) % 12 + 12) % 12, isCt = c.pcs.includes(pc);
    if (strong) { ctStrong[1]++; if (isCt) ctStrong[0]++; colorStrong.add(color); skelColor.add(color); }
    else { ctWeak[1]++; if (isCt) ctWeak[0]++; colorWeak.add(color); }
    if (c.sB !== prevChordStart && i > 0) vlAtChange.add(Math.max(-12, Math.min(12, n.pitch - mel[i - 1]!.pitch)));
    prevChordStart = c.sB;
  }
  for (const ph of segmentByBars(mel, `${bpb}/4`, 4, 4, phi)) {
    const body = ph.filter((x) => x.start >= 0); if (body.length < 4) continue;
    const first = body[0]!, fpc = ((first.pitch % 12) + 12) % 12;
    openDeg.add(((fpc - keyPc) % 12 + 12) % 12);
    const c = alignedChordAt(chords, phi + first.start + k); if (c) openColor.add(((fpc - c.root) % 12 + 12) % 12);
    const peak = body.reduce((mx, x) => (x.pitch > mx.pitch ? x : mx), body[0]!);
    peakPos.add(Math.round((body.indexOf(peak) / body.length) * 4) / 4);
  }
}

const dir = process.argv[2]!;
const N = Number(process.argv[3] ?? 60);
for (const id of readdirSync(dir).filter((d) => /^\d{3}$/.test(d)).slice(0, N)) analyze(dir, id);

const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
console.log(`# メロ生成フィジビリ v2（POP909 ${scanned}曲走査 → 高信頼整列 ${kept}曲採用 / ${totNotes}音）
整列率の中央値=${(100 * med(alignRates)).toFixed(0)}%・採用率=${(100 * kept / scanned).toFixed(0)}%（残りは MIDI↔注釈の整列が信頼できず除外）

## A. リズム骨格（縦の線）※選別軸でない＝素直
### A1. 拍内 onset 位置（φ補正済・4/4で0=頭,2=3拍が強拍）
${fmt(onsetInBar, true, 16)}
### A3. IOI（音→次音の拍＝リズム細胞）
${fmt(ioi, true, 12)}

## B. コード条件付きの動き
### B1. コードトーン率（強拍 vs 弱拍）※整列確認用（選別で釣り上がり）
  強拍: ${(100 * ctStrong[0] / (ctStrong[1] || 1)).toFixed(1)}% (${ctStrong[0]}/${ctStrong[1]})   弱拍: ${(100 * ctWeak[0] / (ctWeak[1] || 1)).toFixed(1)}% (${ctWeak[0]}/${ctWeak[1]})
### B-color 強拍の chordalTone（骨格の色）
${fmt(colorStrong, false, 12, (k) => COLOR[Number(k)] ?? k)}
### B-color 弱拍の chordalTone
${fmt(colorWeak, false, 12, (k) => COLOR[Number(k)] ?? k)}
### B4. 次音への音程：強拍発 ※素直
${fmt(intStrong, true, 18)}
### B4. 次音への音程：弱拍発 ※素直
${fmt(intWeak, true, 18)}
### B2. コードチェンジ直後の音程（ボイスリーディング）※素直
${fmt(vlAtChange, true, 16)}

## C. 音高骨格 / 最初の音（疑う）
### C-open フレーズ頭：key度数 ※素直
${fmt(openDeg, false, 12, (k) => DEG[Number(k)] ?? k)}
### C-open フレーズ頭：chordalTone
${fmt(openColor, false, 12, (k) => COLOR[Number(k)] ?? k)}
### C-peak 頂点(最高音)のフレーズ内位置(0頭..1末) ※素直＝アーチ検証
${fmt(peakPos, true, 6)}
### C-skel 強拍=骨格の chordalTone
${fmt(skelColor, false, 12, (k) => COLOR[Number(k)] ?? k)}
`);
