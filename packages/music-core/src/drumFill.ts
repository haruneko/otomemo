// ドラムフィル＝phrase_maker `experiments/drums/fills/src/fills.py` の忠実移植（M2）。
// 移植方針：再発明でなく phrase_maker の実アルゴリズム（KINDS の数式・INTENSITY 定数・place_fill/
// apply_fills・四肢検証）を数値までそのまま TS へ移す。qb（四分音符拍）ベースの note レベル表現で、
// otomemo の step-grid ドラムとは別レイヤー（float オフセット＝三連/32分/フラムの装飾音を保持できる）。
//
// 忠実性の要：
//  - 速度は Python の round()＝**round-half-to-even（銀行丸め）**。Math.round(半上げ)では 104.5→105 と
//    ずれるので pyRound を実装（round(104.5)=104 / round(81.5)=82）。
//  - オフセットは Python の round(x,6)。
//  - イベントの**挿入順**を fills.py と一致させる（flam=grace,main / buildup=snares,kick の順）。
// 検証：python place_fill と (offset,voice,vel) 列を突き合わせ（scratchpad/fill-golden.json＝363 配置）
// ＝clean グリッドは完全一致（本ファイルの下部テストで代表ベクトルを固定）。
//
// ヒューマナイズ（相関 Breath＋voice別オフセット）は決定論の都合で別モジュール（humanizeFill.ts）。
// 本モジュールは純関数・決定的（乱数/Date 不使用）。

// ---------------------------------------------------------------------------
// GM ドラムマップ・四肢割当・ノート長（gen2 gm.py の忠実コピー）
// ---------------------------------------------------------------------------
export type DrumVoice =
  | "kick" | "snare" | "ghost" | "sidestick" | "chh" | "ohh" | "phh"
  | "ride" | "ridebell" | "crash" | "tom_hi" | "tom_mid" | "tom_lo" | "floor";

/** GM ドラム番号（ch10）。gm.py GM_NOTE と 1バイト一致。 */
export const GM_NOTE: Record<DrumVoice, number> = {
  kick: 36, snare: 38, ghost: 38, sidestick: 37, chh: 42, ohh: 46, phh: 44,
  ride: 51, ridebell: 53, crash: 49, tom_hi: 50, tom_mid: 47, tom_lo: 43, floor: 41,
};

/** 四肢割当（RF=右足/LF=左足/HAND=両手のいずれか）。gm.py LIMB。 */
export const LIMB: Record<DrumVoice, "RF" | "LF" | "HAND"> = {
  kick: "RF", phh: "LF", snare: "HAND", ghost: "HAND", sidestick: "HAND",
  chh: "HAND", ohh: "HAND", ride: "HAND", ridebell: "HAND", crash: "HAND",
  tom_hi: "HAND", tom_mid: "HAND", tom_lo: "HAND", floor: "HAND",
};

/** note-off 用の公称長（秒）。gm.py DUR_S。 */
export const DUR_S: Record<DrumVoice, number> = {
  kick: 0.10, snare: 0.12, ghost: 0.08, sidestick: 0.08, chh: 0.05, ohh: 0.30,
  phh: 0.06, ride: 0.25, ridebell: 0.20, crash: 1.20, tom_hi: 0.18, tom_mid: 0.20,
  tom_lo: 0.24, floor: 0.30,
};

// ---------------------------------------------------------------------------
// Python 互換の丸め
// ---------------------------------------------------------------------------
/** Python round()（0桁・round-half-to-even）。速度の丸めに必須（Math.round は半上げでずれる）。 */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1; // 端数ちょうど 0.5 は偶数側へ
}

/** Python round(x, 6)。オフセットの丸めに使用（6桁目のタイは実データ上発生しない）。 */
export function round6(x: number): number {
  return pyRound(x * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// 拍子シム：(bar,beat)->qb、名前つき尺の解決。core.chart.Meter 相当を最小移植。
//   4/4→4拍・6/8→2付点拍・3/4→3拍。qb_per_unit＝qbeats_per_bar/beat_units。
// ---------------------------------------------------------------------------
const METER_TABLE: Record<string, { qbeatsPerBar: number; beatUnits: number }> = {
  "4/4": { qbeatsPerBar: 4.0, beatUnits: 4 },
  "3/4": { qbeatsPerBar: 3.0, beatUnits: 3 },
  "6/8": { qbeatsPerBar: 3.0, beatUnits: 2 },
};

export type FillLengthName = "beat" | "2beat" | "half_bar" | "bar";

export class FillMeter {
  readonly symbol: string;
  readonly qbeatsPerBar: number;
  readonly beatUnits: number;
  constructor(symbol: string) {
    const t = METER_TABLE[symbol];
    if (!t) throw new Error(`unsupported meter ${symbol}; have ${Object.keys(METER_TABLE).join(",")}`);
    this.symbol = symbol;
    this.qbeatsPerBar = t.qbeatsPerBar;
    this.beatUnits = t.beatUnits;
  }
  get qbPerUnit(): number { return this.qbeatsPerBar / this.beatUnits; }
  toQb(bar: number, beat: number): number { return bar * this.qbeatsPerBar + beat * this.qbPerUnit; }
  lengthUnits(name: string): number {
    const table: Record<string, number> = {
      beat: 1.0, "2beat": 2.0, half_bar: this.beatUnits / 2.0, bar: this.beatUnits,
    };
    const v = table[name];
    if (v === undefined) throw new Error(`unknown fill length ${name}`);
    return v;
  }
}

export function fillMeter(symbol = "4/4"): FillMeter { return new FillMeter(symbol); }

// ---------------------------------------------------------------------------
// INTENSITY（盛り上げ度）。fills.py INTENSITY と数値一致。
// ---------------------------------------------------------------------------
export interface IntensityCfg {
  vlo: number; vhi: number; curve: number; density: number;
  land_crash: number; land_kick: number;
}
export const INTENSITY: Record<string, IntensityCfg> = {
  subtle: { vlo: 48, vhi: 96, curve: 1.20, density: 0.85, land_crash: 98, land_kick: 92 },
  medium: { vlo: 70, vhi: 116, curve: 1.00, density: 1.00, land_crash: 116, land_kick: 110 },
  flashy: { vlo: 92, vhi: 127, curve: 0.82, density: 1.40, land_crash: 127, land_kick: 122 },
};
export const INTENSITIES = Object.keys(INTENSITY);

const TOM_LADDER: DrumVoice[] = ["tom_hi", "tom_hi", "tom_mid", "tom_mid", "tom_lo", "floor", "floor"];

function clampv(v: number): number { return Math.max(1, Math.min(127, pyRound(v))); }

/** 位置ベースのクレッシェンド速度。フィル頭で柔・着地直前で熱。fills.py _cresc。 */
function cresc(offQb: number, lengthQb: number, cfg: IntensityCfg, bump = 0.0): number {
  const frac = lengthQb > 0 ? offQb / lengthQb : 1.0;
  const v = cfg.vlo + (cfg.vhi - cfg.vlo) * Math.pow(frac, cfg.curve);
  return clampv(v + bump);
}

/** 密度スケール後の打点数。fills.py _n。density==1.0 は base をそのまま round。 */
function nCount(base: number, cfg: IntensityCfg, lo = 2): number {
  const x = cfg.density !== 1.0 ? base * cfg.density : base;
  return Math.max(lo, pyRound(x)); // int(round(x)) ＝正値ゆえ pyRound で足りる
}

// ---------------------------------------------------------------------------
// フィルの型（10種）。各々 [offset_qb, voice, velocity] を [0,length_qb) に返す
// （着地スロットは空ける）。挿入順は fills.py と一致。
// ---------------------------------------------------------------------------
export type Hit = [number, DrumVoice, number];
type KindFn = (lengthQb: number, cfg: IntensityCfg) => Hit[];

const k_snare_roll: KindFn = (L, cfg) => {
  const n = nCount(L * 4, cfg);
  const out: Hit[] = [];
  for (let i = 0; i < n; i++) { const off = (i / n) * L; out.push([off, "snare", cresc(off, L, cfg)]); }
  return out;
};

const k_snare_roll_32: KindFn = (L, cfg) => {
  const n = nCount(L * 8, cfg);
  const out: Hit[] = [];
  for (let i = 0; i < n; i++) { const off = (i / n) * L; const bump = i % 4 === 0 ? 8 : 0; out.push([off, "snare", cresc(off, L, cfg, bump)]); }
  return out;
};

const k_tom_descent: KindFn = (L, cfg) => {
  const n = nCount(L * 4, cfg);
  const out: Hit[] = [];
  for (let i = 0; i < n; i++) {
    const off = (i / n) * L;
    const idx = Math.min(TOM_LADDER.length - 1, Math.floor((i / Math.max(1, n)) * TOM_LADDER.length));
    out.push([off, TOM_LADDER[idx]!, cresc(off, L, cfg, 4)]);
  }
  return out;
};

const k_triplet_cascade: KindFn = (L, cfg) => {
  const perBeat = cfg.density > 1.2 ? 6 : 3;
  const n = Math.max(3, pyRound(L * perBeat));
  const voices: DrumVoice[] = ["snare", "tom_mid", "floor"];
  const out: Hit[] = [];
  for (let i = 0; i < n; i++) { const off = (i / n) * L; const bump = i % 3 === 0 ? 6 : 0; out.push([off, voices[i % 3]!, cresc(off, L, cfg, bump)]); }
  return out;
};

const k_flam_accents: KindFn = (L, cfg) => {
  const n = Math.max(2, pyRound(L * 2));
  const voices: DrumVoice[] = ["snare", "snare", "tom_hi", "tom_mid"];
  const out: Hit[] = [];
  for (let i = 0; i < n; i++) {
    const off = (i / n) * L;
    const v = voices[i % voices.length]!;
    const main = cresc(off, L, cfg, 4);
    let graceOff = off - 0.035;
    let mainOff = off;
    if (graceOff < 0.0) { graceOff = 0.0; mainOff = 0.035; } // 先頭はフィル頭に乗る
    out.push([graceOff, v, clampv(main - 34)]); // grace（弱）
    out.push([mainOff, v, main]); // main
  }
  return out;
};

const k_sixteenth_groove: KindFn = (L, cfg) => {
  const steps = Math.max(4, pyRound(L * 4));
  const voiceByR: Record<number, DrumVoice> = { 0: "snare", 1: "ghost", 2: "tom_hi", 3: "tom_mid" };
  const out: Hit[] = [];
  for (let s = 0; s < steps; s++) {
    const off = s * (L / steps);
    const r = s % 4;
    if (r === 1 && cfg.density < 1.0) continue; // subtle は 'e' を空ける
    const v = voiceByR[r]!;
    const bump = v === "ghost" ? -20 : 0;
    out.push([off, v, cresc(off, L, cfg, bump)]);
    if (s % 4 === 0) out.push([off, "kick", cresc(off, L, cfg, -6)]); // 拍頭のキックアンカー
  }
  return out;
};

const k_herta: KindFn = (L, cfg) => {
  const n = Math.max(3, pyRound(L * 6));
  const out: Hit[] = [];
  for (let i = 0; i < n; i++) {
    const off = (i / n) * L;
    const accent = i % 3 === 2 ? 10 : (i % 3 === 0 ? -6 : 0);
    out.push([off, "snare", cresc(off, L, cfg, accent)]);
  }
  return out;
};

const k_gallop: KindFn = (L, cfg) => {
  const steps = Math.max(4, pyRound(L * 4));
  const out: Hit[] = [];
  for (let s = 0; s < steps; s++) {
    const off = s * (L / steps);
    const r = s % 4;
    if (r === 0) out.push([off, "kick", cresc(off, L, cfg, 2)]);
    else if (r === 2 || r === 3) out.push([off, "snare", cresc(off, L, cfg, 2)]);
  }
  return out;
};

const k_offbeat_syncopated: KindFn = (L, cfg) => {
  const steps = Math.max(4, pyRound(L * 4));
  const toms: DrumVoice[] = ["tom_hi", "tom_mid", "tom_lo", "floor"];
  const out: Hit[] = [];
  let t = 0;
  for (let s = 0; s < steps; s++) {
    if (s % 4 === 2 || s % 4 === 3) {
      const off = s * (L / steps);
      out.push([off, toms[t % toms.length]!, cresc(off, L, cfg, 6)]);
      t += 1;
    }
  }
  return out;
};

const k_buildup: KindFn = (L, cfg) => {
  const out: Hit[] = [];
  const seg = L / 3.0;
  const rates = [2, 4, 8]; // 8分→16分→32分
  for (let si = 0; si < rates.length; si++) {
    const rate = rates[si]!;
    const segStart = si * seg;
    const cnt = Math.max(1, pyRound(seg * rate));
    for (let j = 0; j < cnt; j++) { const off = segStart + (j / cnt) * seg; out.push([off, "snare", cresc(off, L, cfg)]); }
    out.push([segStart, "kick", cresc(segStart, L, cfg, -8)]); // 各セグ頭のキックパルス
  }
  if (cfg.density > 1.2) out.push([L * 0.5, "crash", cresc(L * 0.5, L, cfg, -10)]); // flashy：中間のクラッシュスウェル
  return out;
};

export const KINDS: Record<string, KindFn> = {
  snare_roll: k_snare_roll,
  snare_roll_32: k_snare_roll_32,
  tom_descent: k_tom_descent,
  triplet_cascade: k_triplet_cascade,
  flam_accents: k_flam_accents,
  sixteenth_groove: k_sixteenth_groove,
  herta: k_herta,
  gallop: k_gallop,
  offbeat_syncopated: k_offbeat_syncopated,
  buildup: k_buildup,
};
export const KIND_NAMES = Object.keys(KINDS);

// ---------------------------------------------------------------------------
// イベント・配置 API
// ---------------------------------------------------------------------------
export interface FillEvent { beat: number; voice: DrumVoice; velocity: number }

export interface FillPlacement {
  kind: string;
  intensity: string;
  bar: number;
  beat: number;
  meter: FillMeter;
  startQb: number;
  lengthQb: number;
  landingQb: number;
  events: FillEvent[]; // フィル本体
  landing: FillEvent[]; // 直後の頭の crash+kick
}

const MAX_UNITS = 64.0;

/** フィルを (bar,beat) の任意位置に置く。fills.py place_fill の移植。 */
export function placeFill(
  bar: number, beat: number, length: FillLengthName | number,
  intensity: string, kind: string, meter?: FillMeter, opts?: { resolve?: boolean },
): FillPlacement {
  const m = meter ?? fillMeter("4/4");
  if (!(kind in KINDS)) throw new Error(`unknown fill kind ${kind}; have ${KIND_NAMES.join(",")}`);
  if (!(intensity in INTENSITY)) throw new Error(`unknown intensity ${intensity}; have ${INTENSITIES.join(",")}`);
  const cfg = INTENSITY[intensity]!;
  for (const [nm, val] of [["bar", bar], ["beat", beat]] as const) {
    if (typeof val !== "number" || !Number.isFinite(val)) throw new Error(`${nm} must be a finite number, got ${val}`);
  }
  let units: number;
  if (typeof length === "string") units = m.lengthUnits(length);
  else {
    units = Number(length);
    if (!Number.isFinite(units) || units <= 0) throw new Error(`numeric length must be finite and > 0, got ${length}`);
  }
  if (units > MAX_UNITS) throw new Error(`length ${units} beat-units exceeds cap ${MAX_UNITS}`);
  const lengthQb = units * m.qbPerUnit;
  const startQb = m.toQb(bar, beat);
  const landingQb = startQb + lengthQb;

  const hits = KINDS[kind]!(lengthQb, cfg);
  const events: FillEvent[] = hits.map(([off, v, vel]) => ({ beat: round6(startQb + off), voice: v, velocity: vel }));

  const resolve = opts?.resolve ?? true;
  const landing: FillEvent[] = resolve
    ? [{ beat: round6(landingQb), voice: "crash", velocity: cfg.land_crash }, { beat: round6(landingQb), voice: "kick", velocity: cfg.land_kick }]
    : [];

  return { kind, intensity, bar, beat, meter: m, startQb: round6(startQb), lengthQb: round6(lengthQb), landingQb: round6(landingQb), events, landing };
}

export function allEvents(p: FillPlacement): FillEvent[] { return [...p.events, ...p.landing]; }

// ---- 自己チェック（検証用・数値的）------------------------------------------
export function resolvesLanding(p: FillPlacement, eps = 1e-6): boolean {
  const voices = new Set(p.landing.filter((e) => Math.abs(e.beat - p.landingQb) < eps).map((e) => e.voice));
  return voices.has("crash") && voices.has("kick");
}
export function isCrescendo(p: FillPlacement): boolean {
  if (p.events.length < 3) return true;
  const vs = [...p.events].sort((a, b) => a.beat - b.beat).map((e) => e.velocity);
  const k = Math.max(1, Math.floor(vs.length / 3));
  const first = vs.slice(0, k).reduce((a, b) => a + b, 0) / k;
  const last = vs.slice(vs.length - k).reduce((a, b) => a + b, 0) / k;
  return first < last;
}
export function lengthOk(p: FillPlacement, eps = 1e-6): boolean {
  if (p.events.length === 0) return false;
  const last = Math.max(...p.events.map((e) => e.beat));
  const inside = p.events.every((e) => p.startQb - eps <= e.beat && e.beat < p.landingQb + eps);
  const reaches = last >= p.landingQb - p.lengthQb / 2 - eps;
  return inside && reaches;
}
export function positionOk(p: FillPlacement, reqBar: number, reqBeat: number, eps = 1e-6): boolean {
  return Math.abs(p.startQb - p.meter.toQb(reqBar, reqBeat)) < eps;
}

// ---------------------------------------------------------------------------
// 四肢検証（gen2 validate.py の忠実移植）
// ---------------------------------------------------------------------------
export interface LimbResult { ok: boolean; problems: string[]; maxSimul: number }

function round4(x: number): number { return Math.round(x * 1e4) / 1e4; }

export function validateLimbs(events: FillEvent[], eps = 1e-6): LimbResult {
  // group_by_beat：key=round(beat/eps)*eps
  const groups = new Map<number, FillEvent[]>();
  for (const e of events) {
    const key = Math.round(e.beat / eps) * eps;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }
  const keys = [...groups.keys()].sort((a, b) => a - b);
  const problems: string[] = [];
  let maxSimul = 0;
  for (const beat of keys) {
    const grp = groups.get(beat)!;
    const voices = grp.map((e) => e.voice);
    const limbs = voices.map((v) => LIMB[v]);
    const rf = limbs.filter((l) => l === "RF").length;
    const lf = limbs.filter((l) => l === "LF").length;
    const hand = limbs.filter((l) => l === "HAND").length;
    const total = grp.length;
    maxSimul = Math.max(maxSimul, total);
    const b = round4(beat);
    if (total > 4) problems.push(`beat ${b}: ${total} simultaneous voices > 4 (${voices.join(",")})`);
    if (rf > 1) problems.push(`beat ${b}: ${rf} kick voices (need 1 right foot) ${voices.join(",")}`);
    if (lf > 1) problems.push(`beat ${b}: ${lf} pedal-hat voices (need 1 left foot) ${voices.join(",")}`);
    if (hand > 2) problems.push(`beat ${b}: ${hand} hand voices > 2 hands ${voices.join(",")}`);
    if (new Set(voices).size !== voices.length) problems.push(`beat ${b}: duplicate voice at same instant ${voices.join(",")}`);
  }
  return { ok: problems.length === 0, problems, maxSimul };
}

// ---------------------------------------------------------------------------
// フィルをグルーヴにマージ（fills.py apply_fills）。フィル区間 [start,landing) の
// グルーヴを消し、着地頭のグルーヴ音も落として crash+kick を優先。
// ---------------------------------------------------------------------------
export interface ApplyResult { merged: FillEvent[]; ok: boolean; problems: string[]; maxSimul: number }

export function applyFills(groove: FillEvent[], placements: FillPlacement[], eps = 1e-6): ApplyResult {
  const spans = placements.map((p) => [p.startQb, p.landingQb] as const);
  const landings = new Set(placements.map((p) => round6(p.landingQb)));
  const kept: FillEvent[] = [];
  for (const e of groove) {
    const b = round6(e.beat);
    const covered = spans.some(([s, land]) => s - eps <= e.beat && e.beat < land - eps);
    const onLanding = landings.has(b);
    if (covered || onLanding) continue;
    kept.push(e);
  }
  const merged = [...kept];
  for (const p of placements) merged.push(...allEvents(p));
  merged.sort((a, b) => (a.beat - b.beat) || (a.voice < b.voice ? -1 : a.voice > b.voice ? 1 : 0));
  const { ok, problems, maxSimul } = validateLimbs(merged);
  return { merged, ok, problems, maxSimul };
}
