// 拍子の検証：Irish(ABC・整列問題なし)を拍子別に分け、onset位置・IOI・輪郭が拍子で違うか。
// 4/4ポップスの所見が 3/4・6/8 に当たらない、という批判を実データで確かめる。
import { readFileSync } from "node:fs";
import { parseAbcTune, tonicPcOf } from "./src/music/abc";
import { isStandardMeter, segmentByBars } from "./src/music/phrase";
import { meterInfo } from "./src/music/meter";
import { normalizeToC } from "./src/music/melodyEssence";

type Note = { pitch: number; start: number; dur: number };
const data = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as Record<string, string>[];

type Acc = { onset: Map<number, number>; ioi: Map<number, number>; contour: { sum: number; n: number }[]; phrases: number; tunes: number; notes: number };
const mk = (): Acc => ({ onset: new Map(), ioi: new Map(), contour: Array.from({ length: 8 }, () => ({ sum: 0, n: 0 })), phrases: 0, tunes: 0, notes: 0 });
const byMeter = new Map<string, Acc>();

for (const e of data) {
  const abc = e["abc notation"]; if (!abc) continue;
  let t; try { t = parseAbcTune(abc); } catch { continue; }
  if (!t.meter || !isStandardMeter(t.meter) || t.notes.length < 16) continue;
  const bpb = meterInfo(t.meter).beatsPerBar; if (!(bpb > 0)) continue;
  const notesC = normalizeToC(t.notes, tonicPcOf(t.key));
  const acc = byMeter.get(t.meter) ?? mk(); byMeter.set(t.meter, acc);
  acc.tunes++;
  for (const n of notesC) {
    acc.notes++;
    const pos = ((n.start % bpb) + bpb) % bpb; // 小節内位置（拍）
    const frac = Math.round((pos / bpb) * 12) / 12; // 小節を12分割した相対位置
    acc.onset.set(frac, (acc.onset.get(frac) ?? 0) + 1);
  }
  const ns = [...notesC].sort((a, b) => a.start - b.start);
  for (let i = 1; i < ns.length; i++) { const d = Math.round((ns[i]!.start - ns[i - 1]!.start) * 4) / 4; if (d > 0) acc.ioi.set(d, (acc.ioi.get(d) ?? 0) + 1); }
  const span = bpb * 4;
  for (const ph of segmentByBars(notesC, t.meter, 4, 4)) {
    const body = ph.filter((x) => x.start >= 0); if (body.length < 4) continue;
    acc.phrases++;
    const mean = body.reduce((s, x) => s + x.pitch, 0) / body.length;
    for (const x of body) { const bin = Math.min(7, Math.floor((x.start / span) * 8)); acc.contour[bin]!.sum += x.pitch - mean; acc.contour[bin]!.n++; }
  }
}

const barF = (v: number, mx: number) => "█".repeat(Math.max(0, Math.round((v / (mx || 1)) * 16)));
const topMap = (m: Map<number, number>, n = 8) => { const t = [...m.values()].reduce((a, b) => a + b, 0) || 1; return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k}:${Math.round(100 * c / t)}%`).join("  "); };
const ordMap = (m: Map<number, number>) => { const t = [...m.values()].reduce((a, b) => a + b, 0) || 1; return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, c]) => `${k}:${Math.round(100 * c / t)}%`).join(" "); };

console.log(`# Irish 拍子別（ABC・整列問題なし）`);
for (const [meter, a] of [...byMeter.entries()].sort((x, y) => y[1].tunes - x[1].tunes)) {
  if (a.tunes < 20) continue;
  const cv = a.contour.map((c) => (c.n ? c.sum / c.n : 0));
  const cmax = Math.max(...cv.map(Math.abs));
  console.log(`\n## ${meter}  (${a.tunes}曲 / ${a.notes}音 / ${a.phrases}フレーズ)  bpb=${meterInfo(meter).beatsPerBar}`);
  console.log(`  IOI(拍): ${ordMap(a.ioi)}`);
  console.log(`  onset小節内位置(0..1, 上位): ${topMap(a.onset, 8)}`);
  console.log(`  4小節輪郭(正規化ピッチ): ${cv.map((v, i) => `${(i / 8).toFixed(2)}:${v >= 0 ? "+" : ""}${v.toFixed(2)}`).join("  ")}`);
  console.log(`            ${cv.map((v) => (v >= 0 ? "▲" : "▽")).join("       ")}`);
}
