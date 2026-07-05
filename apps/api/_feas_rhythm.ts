// ① リズム細胞語彙が小さいか の測定。各小節を16分グリッドのパターン("x.x.")に量子化し、
// (style,meter)別に 異なりパターン数・topKカバレッジ・上位パターン・小節あたり音数分布 を出す。
// 音数分布＝「歌詞の音数指定」設計の素データ（セルを onset数でインデックスする布石）。
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseMidi, notesOfTrackNamed, skylineMelody } from "./src/music/midi";
import { parseAbcTune, tonicPcOf } from "./src/music/abc";
import { beatsPerBarFromBeats, isStandardMeter, segmentByBars } from "./src/music/phrase";
import { meterInfo } from "./src/music/meter";
import { normalizeToC } from "./src/music/melodyEssence";

type Note = { pitch: number; start: number; dur: number };
const NAME_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = (r: string): number | null => { const m = /^([A-G])([#b]?)/.exec(r.trim()); if (!m) return null; let pc = NAME_PC[m[1]!]!; if (m[2] === "#") pc++; else if (m[2] === "b") pc--; return ((pc % 12) + 12) % 12; };
const QUAL: Record<string, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], "7": [0, 4, 7, 10], hdim7: [0, 3, 6, 10], maj6: [0, 4, 7, 9], min6: [0, 3, 7, 9], sus2: [0, 2, 7], sus4: [0, 5, 7], "sus4(b7)": [0, 5, 7, 10], dim7: [0, 3, 6, 9], minmaj7: [0, 3, 7, 11] };

type Acc = { patterns: Map<string, number>; onsetsPerBar: Map<number, number>; bars: number };
const mk = (): Acc => ({ patterns: new Map(), onsetsPerBar: new Map(), bars: 0 });
const groups = new Map<string, Acc>();

// 1小節分の音 → 16分グリッドのパターン文字列。bpb=小節の拍数。
function barPattern(starts: number[], bpb: number, barStart: number): string {
  const slots = Math.round(bpb / 0.25); // 16分スロット数（4/4→16, 6/8(bpb3)→12, 3/4→12）
  const grid = new Array(slots).fill(".");
  for (const s of starts) { const rel = s - barStart; const idx = Math.round(rel / 0.25); if (idx >= 0 && idx < slots) grid[idx] = "x"; }
  return grid.join("");
}
function addBars(key: string, notes: Note[], bpb: number, phi: number): void {
  const acc = groups.get(key) ?? mk(); groups.set(key, acc);
  const ns = [...notes].filter((n) => n.start >= 0).sort((a, b) => a.start - b.start);
  if (!ns.length) return;
  const first = ns[0]!.start;
  let origin = phi + Math.floor((first - phi + 1e-6) / bpb) * bpb;
  const last = ns[ns.length - 1]!.start;
  for (let b = origin; b <= last + 1e-6; b += bpb) {
    const inBar = ns.filter((n) => n.start >= b - 1e-6 && n.start < b + bpb - 1e-6).map((n) => n.start);
    if (!inBar.length) continue;
    const pat = barPattern(inBar, bpb, b);
    acc.patterns.set(pat, (acc.patterns.get(pat) ?? 0) + 1);
    const cnt = (pat.match(/x/g) ?? []).length;
    acc.onsetsPerBar.set(cnt, (acc.onsetsPerBar.get(cnt) ?? 0) + 1);
    acc.bars++;
  }
}

// --- POP909 (4/4 pop) : 整列φを求めて小節化 ---
function pop(dir: string, N: number): void {
  for (const id of readdirSync(dir).filter((d) => /^\d{3}$/.test(d)).slice(0, N)) {
    const base = join(dir, id);
    let bt: string, chTxt: string;
    try { bt = readFileSync(join(base, "beat_midi.txt"), "utf8"); chTxt = readFileSync(join(base, "chord_midi.txt"), "utf8"); } catch { continue; }
    const bpb = beatsPerBarFromBeats(bt); if (!bpb) continue;
    const beatSec = bt.trim().split(/\r?\n/).map((l) => Number(l.trim().split(/\s+/)[0]));
    const s2b = (sec: number): number => { if (sec <= beatSec[0]!) return 0; for (let i = 1; i < beatSec.length; i++) if (sec < beatSec[i]!) return i - 1 + (sec - beatSec[i - 1]!) / (beatSec[i]! - beatSec[i - 1]! || 1); return beatSec.length - 1; };
    const chords = chTxt.trim().split(/\r?\n/).map((l) => { const [s, e, lab] = l.trim().split(/\s+/); if (!lab || lab === "N") return null; const root = pcOf(lab.split(":")[0]!); const q = (lab.split(":")[1] ?? "maj").split("/")[0]!; const ints = QUAL[q]; if (root == null || !ints) return null; return { sB: s2b(Number(s)), eB: s2b(Number(e)), pcs: ints.map((i) => (root + i) % 12) }; }).filter(Boolean) as { sB: number; eB: number; pcs: number[] }[];
    if (chords.length < 4) continue;
    const mel = skylineMelody(notesOfTrackNamed(parseMidi(new Uint8Array(readFileSync(join(base, `${id}.mid`)))), "MELODY")).sort((a: Note, b: Note) => a.start - b.start);
    if (mel.length < 16) continue;
    const at = (b: number) => chords.find((c) => b >= c.sB - 1e-6 && b < c.eB);
    let best = { phi: 0, rate: 0 };
    for (let k = -8; k <= 8; k++) for (let phi = 0; phi < bpb; phi++) { let ct = 0, t = 0; for (const n of mel) { const pos = (((n.start - phi) % bpb) + bpb) % bpb; if (!(Math.abs(pos) < 0.12 || Math.abs(pos - 2) < 0.12)) continue; const c = at(n.start + k); if (!c) continue; t++; if (c.pcs.includes(((n.pitch % 12) + 12) % 12)) ct++; } if (t >= 8 && ct / t > best.rate) best = { phi, rate: ct / t }; }
    if (best.rate < 0.85) continue;
    addBars("pop 4/4", mel, bpb, best.phi);
  }
}

// --- Irish (各拍子) ---
function irish(jsonPath: string): void {
  const data = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, string>[];
  for (const e of data) {
    const abc = e["abc notation"]; if (!abc) continue;
    let t; try { t = parseAbcTune(abc); } catch { continue; }
    if (!t.meter || !isStandardMeter(t.meter) || t.notes.length < 16) continue;
    const bpb = meterInfo(t.meter).beatsPerBar; if (!(bpb > 0)) continue;
    const notesC = normalizeToC(t.notes, tonicPcOf(t.key));
    addBars(`irish ${t.meter}`, notesC, bpb, 0);
  }
}

const popDir = process.argv[2]!, irishJson = process.argv[3]!, N = Number(process.argv[4] ?? 200);
pop(popDir, N);
irish(irishJson);

console.log(`# ① リズム細胞語彙（小節を16分パターンに量子化）\n`);
for (const [key, a] of [...groups.entries()].sort((x, y) => y[1].bars - x[1].bars)) {
  if (a.bars < 100) continue;
  const sorted = [...a.patterns.entries()].sort((x, y) => y[1] - x[1]);
  const cum = (frac: number) => { let s = 0, k = 0; for (const [, c] of sorted) { s += c; k++; if (s / a.bars >= frac) break; } return k; };
  const opb = [...a.onsetsPerBar.entries()].sort((x, y) => x[0] - y[0]).map(([n, c]) => `${n}:${Math.round(100 * c / a.bars)}%`).join(" ");
  console.log(`## ${key}  (${a.bars}小節, 異なりパターン ${a.patterns.size})`);
  console.log(`  カバレッジ: 上位 ${cum(0.5)}種で50% / ${cum(0.8)}種で80% / ${cum(0.9)}種で90%`);
  console.log(`  上位8パターン: ${sorted.slice(0, 8).map(([p, c]) => `${p}(${Math.round(100 * c / a.bars)}%)`).join("  ")}`);
  console.log(`  小節あたり音数: ${opb}\n`);
}
