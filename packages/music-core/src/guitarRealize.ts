// ギター型の実音化（M5）＝相対形の content（ChordHit＋voice/riff 注記）を**進行に当てて**音にする。
// api は音高を返さない（分業維持）＝web の `resolveChordPattern` と api の検算（5f の通知）が**この1本**を呼ぶ
// （二重実装を作らない＝M4 の番人の趣旨）。
//
// 2つの音高の出所：
//   "chordfollow"（既定）＝`assignGuitarPitches`（源流 chordfollow の移植・py-parity 済み）
//   "handshape"（opt-in・耳未判定）＝`solveHandShapes`（枠のみ・重みは otomemo 仮置き）。候補が1つも無い層は
//                chordfollow の音へ落とし、その数を report に返す（5f で告げる）。

import { assignGuitarPitches, gtrChordOf, gtrHitsToOnsets, gtrRootLow, GTR_VEL, type GtrChord, type GtrHitRiff, type GtrOnset, type GtrVoice } from "./guitarRiff";
import { shapeLayer, solveHandShapes, SHAPE_PHYSICS_OTOMEMO, SHAPE_WEIGHTS_OTOMEMO, type ShapeDomain, type ShapePhysics, type ShapeWeights } from "./guitarHandshape";
import { shapePitches, type GtrForm, type HandShape } from "./guitarForms";
import { TUNING_GUITAR6, type Tuning } from "./verify/fretboard";

export interface GtrChordRef { readonly root: number | string; readonly quality?: string | null; readonly bass?: number | null }
export interface GtrRealizeHit { step: number; dur: number; vel?: number; voice?: GtrVoice; riff?: Partial<GtrHitRiff> }
export interface GtrNote { pitch: number; start: number; dur: number; vel: number }

export interface GtrRealizeOpts {
  /** step（16分）→ そこで鳴っているコード（無ければ null＝調の主音メジャー） */
  chordAtStep: (step: number) => GtrChordRef | null;
  keyPc?: number;
  /** BPM（音価の下限 0.05 秒と、handshape の移動時間に使う）。未指定＝120 */
  tempo?: number;
  engine?: "chordfollow" | "handshape";
  seed?: number;
  weights?: ShapeWeights;
  physics?: ShapePhysics;
  tuning?: Tuning;
}

export interface GtrRealizeReport {
  /** ギター表に無く層Bのスケールで代用したクオリティ */
  layerBQualities: string[];
  /** otomemo でも知らないクオリティ（メジャー扱い） */
  unknownQualities: string[];
  /** handshape 使用時のみ */
  /** totalCost＝ソルバの最小コスト（seed に依らない＝seed は同コストの解の選び分けだけ・2026-09-13 監査 軽微-4） */
  shape?: { tier: 0 | 1 | 2; emptyLayers: number; layers: number; totalCost: number };
}

const ROOT_ROLES = new Set(["head", "pedal", "chug", "chord", "dead"]);
const n12 = (x: number): number => ((Math.trunc(x) % 12) + 12) % 12;

function domainOf(o: GtrOnset, ch: GtrChord, t0: number): ShapeDomain {
  if (o.voicing !== "mono") {
    return { pcs: new Set([ch.pedalPc]), lo: t0, hi: t0 + 12, forms: (ch.perfectFifth ? ["power2", "power3", "octave"] : ["octave"]) as GtrForm[] };
  }
  if (ROOT_ROLES.has(o.role)) return { pcs: new Set([ch.pedalPc]), lo: t0, hi: t0 + 12, forms: ["mono", "open"] };
  if (o.strong) return { pcs: ch.tonePcs, lo: t0, hi: t0 + 24, forms: ["mono", "open"] };
  return { pcs: ch.scalePcs, lo: t0, hi: t0 + 24, forms: ["mono", "open"] };
}

export function realizeGuitarRiff(hits: readonly GtrRealizeHit[], opts: GtrRealizeOpts): { notes: GtrNote[]; report: GtrRealizeReport } {
  const onsets = gtrHitsToOnsets(hits);
  const velOf = new Map<number, number | undefined>();
  for (const h of hits) velOf.set(h.step, h.vel);
  const tempo = typeof opts.tempo === "number" && opts.tempo > 0 ? opts.tempo : 120;
  const report: GtrRealizeReport = { layerBQualities: [], unknownQualities: [] };
  const cache = new Map<number, GtrChord>();
  const chordAt = (step: number): GtrChord => {
    const hit = cache.get(step);
    if (hit) return hit;
    const ref = opts.chordAtStep(step);
    const ch = ref ? gtrChordOf(ref.root, ref.quality ?? "", ref.bass ?? null) : gtrChordOf(opts.keyPc ?? 0, "", null);
    if (ch.fallback === "layerB" && !report.layerBQualities.includes(ch.quality)) report.layerBQualities.push(ch.quality);
    if (ch.fallback === "unknown" && !report.unknownQualities.includes(ch.quality)) report.unknownQualities.push(ch.quality);
    cache.set(step, ch);
    return ch;
  };
  const base = assignGuitarPitches(onsets, chordAt);
  // 各オンセットの鳴る音（絶対）
  const sounding: number[][] = onsets.map((_, i) => base.voicings[i]!.map((v) => base.pitches[i]! + v));

  if (opts.engine === "handshape" && onsets.length > 0) {
    const t = opts.tuning ?? TUNING_GUITAR6;
    const w = opts.weights ?? SHAPE_WEIGHTS_OTOMEMO;
    const t0 = t.openMidi[0]!;
    const layers: HandShape[][] = [];
    const bias: number[][] = [];
    onsets.forEach((o) => {
      const ch = chordAt(o.step);
      const layer = shapeLayer(domainOf(o, ch, t0), t);
      layers.push(layer);
      const want = n12(gtrRootLow(ch.rootPc) + o.deg);
      bias.push(layer.map((sh) => { const d = Math.abs(n12(shapePitches(sh, t)[0]!) - want); return w.degBias * Math.min(d, 12 - d); }));
    });
    const secPerStep = 60 / tempo / 4;
    const dts = onsets.map((o, i) => (i === 0 ? 0 : (o.step - onsets[i - 1]!.step) * secPerStep));
    const sol = solveHandShapes(layers, dts, w, opts.physics ?? SHAPE_PHYSICS_OTOMEMO, { seed: opts.seed ?? 0, tuning: t, nodeBias: bias });
    sol.shapes.forEach((sh, i) => { if (sh) sounding[i] = shapePitches(sh, t); });
    report.shape = { tier: sol.tier, emptyLayers: sol.empty.length, layers: layers.length, totalCost: sol.totalCost };
  }

  const minDurBeats = 0.05 * tempo / 60;
  const notes: GtrNote[] = [];
  onsets.forEach((o, i) => {
    const start = Math.round(o.step * 0.25 * 1000) / 1000;
    const dur = Math.round(Math.max(minDurBeats, o.durSteps * 0.25) * 1000) / 1000;
    const vel = velOf.get(o.step) ?? GTR_VEL[o.kind];
    for (const p of sounding[i]!) notes.push({ pitch: p, start, dur, vel });
  });
  return { notes, report };
}
