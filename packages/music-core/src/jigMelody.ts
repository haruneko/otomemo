// ジグの主旋律（段1＝関数だけ）。正典＝docs/design.md「ジグの主旋律の様式＝段1」／
// docs/drafts/2026-09-16-celtic-jig-reel-design.md（耳判定 2026-09-17 で芯確定）。
//
// 耳で「ジグらしい」と判定された試作（scratch の Python）の手順を移植した純関数：
//  骨格＝部ごとに中心の音を1つ決め、半小節ごとの16点をその上下1〜2段で交互に振る。
//  表面＝半小節（8分3つ）ずつ、次の要所へ残りの音数で届く範囲だけから1音ずつ引く（同音か順次で着く）。
// 固定の旋律の表は持たない。乱数列は試作（Python random）と一致させない＝性質は diagnoseJigMelody で見る。
// 既存のメロディ生成には一切触れない（到達口は段2以降）。
import { PyRandom, stableSeed } from "./humanizeFill";

export const JIG_MODES = ["ionian", "dorian", "mixolydian", "aeolian"] as const;
export type JigMode = (typeof JIG_MODES)[number];

const MODE_STEPS: Record<JigMode, number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};

export interface JigMelodyInput {
  /** 主音の音名クラス 0〜11（D=2） */
  tonic: number;
  mode: JigMode;
  seed: number;
  /** 付点4分の BPM（既定 110） */
  tempo?: number;
}
export interface JigNote { pitch: number; start: number; dur: number; velocity: number }
export interface JigPart {
  part: "A" | "B";
  /** 部の開始拍（4分音符単位） */
  startBeat: number;
  /** 中心の音（MIDI） */
  center: number;
  /** 半小節ごとの要所の音（MIDI・16点） */
  anchors: number[];
}
export interface JigMelody {
  meter: "6/8";
  bars: 16;
  tempoQuarterBpm: number;
  notes: JigNote[];
  parts: JigPart[];
}

// 音域＝音階の段 0..12（主音から旋法の12段上）。
const LO = 0, HI = 12;
const BUNDLE = 3; // 8分3つ＝半小節
const HALF_BARS = 16; // 1部＝8小節＝半小節16

function choice<T>(rng: PyRandom, xs: readonly T[]): T {
  return xs[Math.floor(rng.random() * xs.length)]!;
}
function weighted<T>(rng: PyRandom, xs: readonly T[], ws: readonly number[]): T {
  const total = ws.reduce((a, b) => a + b, 0);
  let r = rng.random() * total;
  for (let i = 0; i < xs.length; i++) { r -= ws[i]!; if (r < 0) return xs[i]!; }
  return xs[xs.length - 1]!;
}
const clamp = (x: number) => Math.max(LO, Math.min(HI, x));

/** 骨格：中心の音（段）と16点の要所（段）。 */
function skeleton(rng: PyRandom, part: "A" | "B"): { anc: number[]; axis: number } {
  const role = weighted(rng, [0, 4, 2], [33, 21, 19]); // 主音／5度／3度
  const reg = part === "B" ? 7 : 0;
  let axis = role + reg <= HI - 2 ? role + reg : role + reg - 7;
  if (part === "A" && axis < 2) axis += role === 0 ? 7 : 0;
  const pos = choice(rng, [0, 1]);
  const slots = [0, 2, 4, 6].map((b) => b * 2 + pos);
  let alt = choice(rng, [1, -1]);
  const nb = new PyRandom(Math.floor(rng.random() * 4294967296));
  const anc: number[] = [];
  for (let i = 0; i < HALF_BARS; i++) {
    const d = alt * choice(nb, [1, 1, 2]);
    alt = -alt;
    let n = axis + d;
    if (Math.floor(i / 2) >= 4 && Math.floor(i / 2) <= 5) n = axis + choice(nb, [2, 3, 4]); // 3句目は上へ
    anc.push(clamp(n));
  }
  anc[7] = part === "A" ? 4 : 11; // 4小節目末＝5度（開く）
  anc[15] = axis >= 5 ? 7 : 0; // 8小節目末＝主音
  for (let i = 0; i < HALF_BARS; i++) {
    if (anc[i] === axis && !slots.includes(i) && i !== 15) anc[i] = axis + (axis < HI ? 1 : -1); // 中心に居座らない
  }
  return { anc, axis };
}

/** 表面：[段, 8分の個数] の列。 */
function surface(rng: PyRandom, anc: number[]): [number, number][] {
  const L = BUNDLE;
  const notes: [number, number][] = [];
  let dirn = 1;
  const memory = new Map<number, number>();
  for (let i = 0; i < HALF_BARS; i++) {
    const cur = anc[i]!;
    if (i === 15) { notes.push([cur, L]); break; }
    const tgt = anc[i + 1]!;
    let seqStart: number;
    if (i === 7) { notes.push([cur, 2]); seqStart = 2; } else { notes.push([cur, 1]); seqStart = 1; }
    const want = tgt > cur ? 1 : tgt < cur ? -1 : dirn;
    let d = choice(rng, [want, dirn]);
    if (memory.get(cur) === d && rng.random() < 0.7) d = -d; // 同じ音から出るときは違う続き
    memory.set(cur, d);
    dirn = d;
    let x = cur;
    for (let k = seqStart; k < L; k++) {
      const r = L - k;
      const dist = tgt - x;
      const opts: { nx: number; w: number; mv: number }[] = [];
      for (const [mv, w] of [[dirn, 5], [2 * dirn, 2], [0, 1], [-dirn, 1]] as const) {
        const nx = x + mv;
        if (nx < LO || nx > HI) continue;
        if (Math.abs(tgt - nx) <= 2 * r) opts.push({ nx, w, mv });
      }
      let nx: number, mv: number;
      if (Math.abs(dist) >= r * 2 - 1 || opts.length === 0) {
        mv = dist ? Math.sign(dist) * Math.min(2, Math.abs(dist)) : 0;
        nx = x + mv;
      } else {
        const o = weighted(rng, opts, opts.map((q) => q.w));
        nx = o.nx; mv = o.mv;
      }
      if (mv && (mv > 0) !== (dirn > 0) && k === Math.floor(L / 2)) dirn = -dirn;
      x = clamp(nx);
      notes.push([x, 1]);
    }
  }
  return notes;
}

export function generateJigMelody(input: JigMelodyInput): JigMelody {
  const steps = MODE_STEPS[input.mode];
  const base = 60 + (((input.tonic % 12) + 12) % 12);
  const pitch = (i: number) => base + 12 * Math.floor(i / 7) + steps[i % 7]!;
  const notes: JigNote[] = [];
  const parts: JigPart[] = [];
  let pos8 = 0;
  for (const part of ["A", "B"] as const) {
    const startBeat = pos8 / 2;
    const { anc, axis } = skeleton(new PyRandom(stableSeed(`${input.seed}-jig-${part}`)), part);
    for (const [idx, len] of surface(new PyRandom(stableSeed(`${input.seed}-jig-${part}-surf`)), anc)) {
      notes.push({ pitch: pitch(idx), start: pos8 / 2, dur: len / 2, velocity: pos8 % BUNDLE === 0 ? 96 : 78 });
      pos8 += len;
    }
    parts.push({ part, startBeat, center: pitch(axis), anchors: anc.map(pitch) });
  }
  return { meter: "6/8", bars: 16, tempoQuarterBpm: (input.tempo ?? 110) * 1.5, notes, parts };
}

export interface JigDiagnostics {
  /** 中心の音から旋法の±2段以内に居る音の割合 */
  nearCenter: number;
  /** 隣り合う音の音程（旋法の段）の割合 */
  intervals: { same: number; step: number; third: number; wider: number };
  /** 要所の音（半小節の頭）の直前の音からの着き方の割合 */
  landing: { same: number; step: number; leap: number };
  /** 長さが8分ちょうどの音の割合 */
  evenEighths: number;
}

/** 診断値（合否にしない）。notes が旋法外の音を含んでも半音から近似で段を数える。 */
export function diagnoseJigMelody(m: Pick<JigMelody, "notes" | "parts">): JigDiagnostics {
  const deg = (p: number, ref: number) => {
    // 音階の段の差を半音差から近似（2半音以内＝1段・4半音以内＝2段 …）。同じ旋法内なら正確。
    const s = p - ref, a = Math.abs(s);
    const oct = Math.floor(a / 12), rem = a % 12;
    const d = oct * 7 + [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6][rem]!;
    return d;
  };
  const ns = m.notes;
  const partOf = (t: number) => [...m.parts].reverse().find((p) => t >= p.startBeat - 1e-9)!;
  let near = 0;
  for (const n of ns) if (deg(n.pitch, partOf(n.start).center) <= 2) near++;
  const iv = { same: 0, step: 0, third: 0, wider: 0 };
  for (let i = 1; i < ns.length; i++) {
    if (Math.abs(ns[i]!.start - ns[i - 1]!.start - ns[i - 1]!.dur) > 1e-9) continue;
    const d = deg(ns[i]!.pitch, ns[i - 1]!.pitch);
    if (d === 0) iv.same++; else if (d === 1) iv.step++; else if (d === 2) iv.third++; else iv.wider++;
  }
  const ivN = Math.max(1, iv.same + iv.step + iv.third + iv.wider);
  const ld = { same: 0, step: 0, leap: 0 };
  for (const p of m.parts) {
    for (let h = 1; h < p.anchors.length; h++) {
      const t = p.startBeat + h * 1.5;
      const k = ns.findIndex((n) => Math.abs(n.start - t) < 1e-9);
      if (k <= 0) continue;
      const d = deg(ns[k]!.pitch, ns[k - 1]!.pitch);
      if (d === 0) ld.same++; else if (d === 1) ld.step++; else ld.leap++;
    }
  }
  const ldN = Math.max(1, ld.same + ld.step + ld.leap);
  return {
    nearCenter: ns.length ? near / ns.length : 0,
    intervals: { same: iv.same / ivN, step: iv.step / ivN, third: iv.third / ivN, wider: iv.wider / ivN },
    landing: { same: ld.same / ldN, step: ld.step / ldN, leap: ld.leap / ldN },
    evenEighths: ns.length ? ns.filter((n) => Math.abs(n.dur - 0.5) < 1e-9).length / ns.length : 0,
  };
}
