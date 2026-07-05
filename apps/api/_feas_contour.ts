// アーチ否定の検証：①頂点位置を first/last/centroid で測り tie バイアスを暴く
// ②頂点1点でなく「フレーズ内の平均輪郭」（全音・正規化ピッチ）で形を直接見る。
// POP909(4/4)の整列済み集合で。phrase長 4小節 と 2小節 両方。
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseMidi, notesOfTrackNamed, skylineMelody } from "./src/music/midi";
import { beatsPerBarFromBeats, segmentByBars } from "./src/music/phrase";

type Note = { pitch: number; start: number; dur: number };
const NAME_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = (r: string): number | null => { const m = /^([A-G])([#b]?)/.exec(r.trim()); if (!m) return null; let pc = NAME_PC[m[1]!]!; if (m[2] === "#") pc++; else if (m[2] === "b") pc--; return ((pc % 12) + 12) % 12; };
const QUAL: Record<string, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], "7": [0, 4, 7, 10], hdim7: [0, 3, 6, 10], maj6: [0, 4, 7, 9], min6: [0, 3, 7, 9], sus2: [0, 2, 7], sus4: [0, 5, 7], "sus4(b7)": [0, 5, 7, 10], dim7: [0, 3, 6, 9], minmaj7: [0, 3, 7, 11] };
type Chord = { sB: number; eB: number; pcs: number[] };

function alignedPhi(dir: string, id: string): { bpb: number; mel: Note[]; phi: number } | null {
  const base = join(dir, id);
  let bt: string, chTxt: string;
  try { bt = readFileSync(join(base, "beat_midi.txt"), "utf8"); chTxt = readFileSync(join(base, "chord_midi.txt"), "utf8"); } catch { return null; }
  const bpb = beatsPerBarFromBeats(bt); if (!bpb) return null;
  const beatSec = bt.trim().split(/\r?\n/).map((l) => Number(l.trim().split(/\s+/)[0]));
  const s2b = (sec: number): number => { if (sec <= beatSec[0]!) return 0; for (let i = 1; i < beatSec.length; i++) if (sec < beatSec[i]!) return i - 1 + (sec - beatSec[i - 1]!) / (beatSec[i]! - beatSec[i - 1]! || 1); return beatSec.length - 1; };
  const chords: Chord[] = chTxt.trim().split(/\r?\n/).map((l) => { const [s, e, lab] = l.trim().split(/\s+/); if (!lab || lab === "N") return null; const root = pcOf(lab.split(":")[0]!); const q = (lab.split(":")[1] ?? "maj").split("/")[0]!; const ints = QUAL[q]; if (root == null || !ints) return null; return { sB: s2b(Number(s)), eB: s2b(Number(e)), pcs: ints.map((i) => (root + i) % 12) }; }).filter(Boolean) as Chord[];
  if (chords.length < 4) return null;
  const mel = skylineMelody(notesOfTrackNamed(parseMidi(new Uint8Array(readFileSync(join(base, `${id}.mid`)))), "MELODY")).sort((a: Note, b: Note) => a.start - b.start);
  if (mel.length < 16) return null;
  const at = (b: number) => chords.find((c) => b >= c.sB - 1e-6 && b < c.eB);
  let best = { phi: 0, rate: 0 };
  for (let k = -8; k <= 8; k++) for (let phi = 0; phi < bpb; phi++) {
    let ct = 0, t = 0;
    for (const n of mel) { const pos = (((n.start - phi) % bpb) + bpb) % bpb; if (!(Math.abs(pos) < 0.12 || Math.abs(pos - 2) < 0.12)) continue; const c = at(n.start + k); if (!c) continue; t++; if (c.pcs.includes(((n.pitch % 12) + 12) % 12)) ct++; }
    if (t >= 8 && ct / t > best.rate) best = { phi, rate: ct / t };
  }
  if (best.rate < 0.85) return null;
  return { bpb, mel, phi: best.phi };
}

const dir = process.argv[2]!;
const N = Number(process.argv[3] ?? 120);
const BINS = 8;
for (const barsPerPhrase of [4, 2]) {
  const contour = Array.from({ length: BINS }, () => ({ sum: 0, n: 0 })); // 正規化ピッチの平均輪郭
  const peakFirst = new Array(BINS).fill(0), peakLast = new Array(BINS).fill(0), peakCentroid = new Array(BINS).fill(0);
  let phrases = 0;
  for (const id of readdirSync(dir).filter((d) => /^\d{3}$/.test(d)).slice(0, N)) {
    const a = alignedPhi(dir, id); if (!a) continue;
    const span = a.bpb * barsPerPhrase;
    for (const ph of segmentByBars(a.mel, `${a.bpb}/4`, barsPerPhrase, 4, a.phi)) {
      const body = ph.filter((x) => x.start >= 0); if (body.length < 4) continue;
      phrases++;
      const mean = body.reduce((s, x) => s + x.pitch, 0) / body.length;
      const top = Math.max(...body.map((x) => x.pitch));
      const tops = body.filter((x) => x.pitch === top);
      for (const x of body) { const bin = Math.min(BINS - 1, Math.floor((x.start / span) * BINS)); contour[bin]!.sum += x.pitch - mean; contour[bin]!.n++; }
      const binOf = (x: Note) => Math.min(BINS - 1, Math.floor((x.start / span) * BINS));
      peakFirst[binOf(tops[0]!)]++;
      peakLast[binOf(tops[tops.length - 1]!)]++;
      peakCentroid[binOf(tops[Math.floor(tops.length / 2)]!)]++;
    }
  }
  const barOf = (v: number, mx: number) => "█".repeat(Math.max(0, Math.round((v / (mx || 1)) * 20)));
  const cvals = contour.map((c) => (c.n ? c.sum / c.n : 0));
  const cmax = Math.max(...cvals.map(Math.abs));
  console.log(`\n### ${barsPerPhrase}小節フレーズ（${phrases}フレーズ）`);
  console.log(`平均輪郭（正規化ピッチ・全音／+が高い）：アーチなら山型・前のめりなら頭高→下降`);
  cvals.forEach((v, i) => console.log(`  pos${(i / BINS).toFixed(2)} | ${v >= 0 ? "+" : ""}${v.toFixed(2).padStart(5)} ${v >= 0 ? barOf(v, cmax) : ""}`));
  const pct = (arr: number[]) => { const t = arr.reduce((a, b) => a + b, 0) || 1; return arr.map((c) => Math.round(100 * c / t)); };
  console.log(`頂点位置%（tie処理で比較・前のめりが本物なら first/last で割れる）`);
  console.log(`  first   :`, pct(peakFirst).map((p, i) => `${(i / BINS).toFixed(2)}:${p}`).join(" "));
  console.log(`  last    :`, pct(peakLast).map((p, i) => `${(i / BINS).toFixed(2)}:${p}`).join(" "));
  console.log(`  centroid:`, pct(peakCentroid).map((p, i) => `${(i / BINS).toFixed(2)}:${p}`).join(" "));
}
