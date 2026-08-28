// 一時スクリプト（試聴ページ素材生成）。物理フィルの生成→MIDI 書き出し。
import { writeFileSync } from "node:fs";
import { genDrums } from "./src/music/generate";

const OUT = process.argv[2]!;
const DRUM_VEL_DEFAULT = 100;
const FILL_NOTE_DUR = 0.1;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const snapBps = (b?: number) => (b == null ? 0.25 : Math.abs(b - 1 / 3) < 1e-3 ? 1 / 3 : b);

type Lane = { name: string; midi: number; hits: number[]; vel?: number; velCurve?: number[]; divs?: Record<string, 2 | 3> };
type R = { steps: number; bars?: number; beatsPerStep?: number; lanes: Lane[]; fillNotes?: { beat: number; midi: number; velocity: number }[]; fillBar?: number; fillKind?: string };
type N = { pitch: number; start: number; dur: number; vel: number };

function rhythmToNotes(r: R): N[] {
  const bps = snapBps(r.beatsPerStep);
  const grid: N[] = r.lanes.flatMap((l) =>
    l.hits.flatMap((step, i) => {
      const v = l.velCurve?.[i] ?? l.vel ?? DRUM_VEL_DEFAULT;
      const note: N = { pitch: l.midi, start: round3(step * bps), dur: bps, vel: v };
      const d = l.divs?.[String(step)];
      if (d !== 2 && d !== 3) return [note];
      return Array.from({ length: d }, (_, k) => ({ ...note, start: round3(step * bps + (k * bps) / d), dur: round3(bps / d), vel: k === 0 ? v : Math.round(v * 0.85) }));
    }),
  );
  if (!r.fillNotes?.length) return grid;
  return grid.concat(r.fillNotes.map((fn) => ({ pitch: fn.midi, start: round3(fn.beat), dur: FILL_NOTE_DUR, vel: fn.velocity })));
}

// 最小 MIDI ライター（format0・ch10 ドラム）
function writeMidi(notes: N[], tempo: number, path: string) {
  const TPQ = 480;
  const evs: { t: number; d: number[] }[] = [];
  for (const n of notes) {
    const on = Math.round(n.start * TPQ), off = Math.round((n.start + Math.max(n.dur, 0.05)) * TPQ);
    evs.push({ t: on, d: [0x99, n.pitch, Math.max(1, Math.min(127, Math.round(n.vel)))] });
    evs.push({ t: off, d: [0x89, n.pitch, 0] });
  }
  evs.sort((a, b) => a.t - b.t || (a.d[0]! & 0xf0) - (b.d[0]! & 0xf0));
  const bytes: number[] = [];
  const vlq = (v: number) => { const b = [v & 0x7f]; v >>= 7; while (v > 0) { b.unshift((v & 0x7f) | 0x80); v >>= 7; } return b; };
  const us = Math.round(60000000 / tempo);
  bytes.push(0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255);
  let last = 0;
  for (const e of evs) { bytes.push(...vlq(e.t - last), ...e.d); last = e.t; }
  bytes.push(0, 0xff, 0x2f, 0);
  const hdr = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (TPQ >> 8) & 255, TPQ & 255];
  const len = bytes.length;
  const trk = [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...bytes];
  writeFileSync(path, Buffer.from([...hdr, ...trk]));
}

type Spec = { id: string; title: string; note: string; frame: Record<string, unknown>; seed: number; opts?: Record<string, unknown> };
const F = (o: Record<string, unknown>) => ({ meter: "4/4", bars: 4, mood: "明るい", ...o });
const cue = (intensity: number, aim?: "up" | "down") => ({ cues: [{ bar: 2, kind: "fill", intensity, ...(aim ? { aim } : {}) }] });

const SPECS: Spec[] = [
  { id: "a1-grid", title: "① 従来グリッド（比較用）", note: "beat8.basic / 120BPM / fill=0.5。既存の16分格子フィル。", frame: F({ tempo: 120 }), seed: 7, opts: { style: "beat8.basic", fill: 0.5 } },
  { id: "a2-phys", title: "② 物理フィル・同条件", note: "①と同じ型・同じseedで fillStyle=physical に切替。型はseed選抜。", frame: F({ tempo: 120 }), seed: 7, opts: { style: "beat8.basic", fill: 0.5, fillStyle: "physical" } },
  { id: "b1-up", title: "③ aim=up（サビへ突っ込む）", note: "cue.aim=up → buildup/gallop/snare_roll/herta のプール。intensity 0.8。", frame: F({ tempo: 128, section: cue(0.8, "up") }), seed: 3, opts: { style: "four.rock", fillStyle: "physical" } },
  { id: "b2-down", title: "④ aim=down（落とす）", note: "cue.aim=down → tom_descent/triplet_cascade/offbeat のプール。intensity 0.5。", frame: F({ tempo: 128, section: cue(0.5, "down") }), seed: 3, opts: { style: "four.rock", fillStyle: "physical" } },
  { id: "c1-tom", title: "⑤ tom_descent（タム下降）", note: "型を明示指定。phrase_maker fills.py の忠実移植。", frame: F({ tempo: 110 }), seed: 11, opts: { style: "beat16.basic", fill: 0.6, fillStyle: "physical", fillKind: "tom_descent" } },
  { id: "c2-tri", title: "⑥ triplet_cascade（三連カスケード）", note: "同上・型違い。", frame: F({ tempo: 110 }), seed: 11, opts: { style: "beat16.basic", fill: 0.6, fillStyle: "physical", fillKind: "triplet_cascade" } },
  { id: "c3-herta", title: "⑦ herta（ヘルタ）", note: "同上・型違い。粒が細かい。", frame: F({ tempo: 110 }), seed: 11, opts: { style: "beat16.basic", fill: 0.6, fillStyle: "physical", fillKind: "herta" } },
  { id: "c4-roll", title: "⑧ snare_roll（スネアロール）", note: "同上・型違い。クレッシェンドあり。", frame: F({ tempo: 110 }), seed: 11, opts: { style: "beat16.basic", fill: 0.6, fillStyle: "physical", fillKind: "snare_roll" } },
  { id: "c5-gallop", title: "⑨ gallop（ギャロップ）", note: "同上・型違い。速い曲で映える。", frame: F({ tempo: 168 }), seed: 5, opts: { style: "dbeat.basic", fill: 0.8, fillStyle: "physical", fillKind: "gallop" } },
  { id: "d1-ballad", title: "⑩ 6/8 バラード・subtle", note: "六八・70BPM・intensity 0.2（=subtle）。拍子違いの動作確認も兼ねる。", frame: F({ meter: "6/8", tempo: 70, mood: "切ない", section: cue(0.2) }), seed: 9, opts: { style: "six8.ballad", fillStyle: "physical" } },
  { id: "d2-34", title: "⑪ 3/4・物理フィル", note: "三拍子。fillMeter の 3/4 対応。", frame: F({ meter: "3/4", tempo: 100, section: cue(0.6) }), seed: 2, opts: { fillStyle: "physical" } },
  { id: "d3-flashy", title: "⑫ buildup・flashy", note: "intensity 1.0 の派手側。ラスサビ前を想定。", frame: F({ tempo: 140 }), seed: 21, opts: { style: "four.edm16", fill: 1.0, fillStyle: "physical", fillKind: "buildup" } },
];

const manifest = SPECS.map((s) => {
  const res = genDrums(s.frame as never, s.seed, s.opts as never);
  const r = (res.items[0]!.content as { rhythm: R }).rhythm;
  const notes = rhythmToNotes(r);
  const tempo = (s.frame.tempo as number) ?? 120;
  writeMidi(notes, tempo, `${OUT}/${s.id}.mid`);
  return { id: s.id, title: s.title, note: s.note, tempo, meter: s.frame.meter, bars: r.bars, fillBar: r.fillBar ?? null, fillKind: r.fillKind ?? null, fillNotes: r.fillNotes?.length ?? 0, notes: notes.length, endQb: Math.max(...notes.map((n) => n.start + n.dur)), qbPerBar: (Math.max(...notes.map((n) => n.start + n.dur))) / (r.bars ?? 4), roll: notes.map((n) => [round3(n.start), n.pitch, n.vel]), fillFrom: r.fillNotes?.length ?? 0 };
});
console.log(JSON.stringify(manifest, null, 1));
