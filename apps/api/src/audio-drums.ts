// #S12改 ドラム抽出の interpretation 層（純関数）。Python(perception)が出す生オンセット
// (drum_onsets = [t_sec, "kick"|"snare"|"hihat", strength]) から、窓分割×正準パターン型照合で
// {meter, sub, downbeat, confidence, rhythm} を導く。
//
// 設計（design.md #S12改・2026-07-08）：
//  ① 窓分割(~16拍・hop8拍)：窓ごとに局所自己相関で拍周期→円形平均で位相＝局所グリッド。
//     自己相関は平行移動不変＝周期誤差が累積しない（全曲一発の剛体グリッドは実録音のドリフトで破綻する・実測）。
//  ② sub∈{4=16分, 3=シャッフル3連}を位相集中度で検出（シャッフル曲は16分格子に永遠に乗らない・実測）。
//  ③ 窓ごとに正準型（スネア=バックビート/キック=頭）と照合＝**型が downbeat を決める**。
//     zero-mean相関（一様ノイズ=0点）＋kick/snare重複ペナルティ（分離ブリード対策）＋
//     小節出現率ファクタ（6拍ループが4/4 rockに縮退して見える折り畳みエイリアスを弾く）。
//  ④ 各窓を自分の downbeat へ回転→スコア重み付き集約。meter 決定＝窓スコア平均×支持率×窓間一致。
//     変拍子は窓内 fold の時点で滲む→支持率が立たない→低信頼（グレースフルに諦める・捏造しない）。
// 音モデル（分離器/検出器）を差し替えても facts 契約の内側で完結＝この層のテストは不変。

export type DrumKind = "kick" | "snare" | "hihat";
/** 生ドラムオンセット＝[時刻(秒), 種別, 強さ]。facts.drum_onsets の1要素。 */
export type DrumOnset = readonly [t: number, kind: string, strength: number];

export interface RhythmContentLite {
  steps: number;
  lanes: { name: string; midi: number; hits: number[] }[];
}

export interface DrumPatternResult {
  meter: number; // 1小節の拍数（3/4/6）
  sub: 3 | 4; // 拍の分割（4=16分ストレート・3=シャッフル3連）
  confidence: number; // 0..1。低いほど手動へ落とすべき（変拍子→低い）
  bpm: number; // 局所周期の中央値から
  downbeat: number | null; // 推定小節頭の時刻(秒・最初の高信頼窓)。アンカー初期値用
  template: string | null; // 照合した正準型の名前（rock/four/half/waltz/six-*）
  rhythm: RhythmContentLite; // 1step=16分の既存契約。sub=3はスイング写像で16分格子へ
  /** opts.debug 時のみ：meter別の内部スコア＋集約ヒスト（評価ハーネス/研究用） */
  diag?: {
    sub: { s4: number; s3: number };
    windows: { total: number; good: number };
    meters: Record<number, { score: number; meanSc: number; support: number; agreement: number; coherence: number; agg: Record<DrumKind, number[]> }>;
  };
}

const KIND_MIDI: Record<DrumKind, { name: string; midi: number }> = {
  kick: { name: "Kick", midi: 36 },
  snare: { name: "Snare", midi: 38 },
  hihat: { name: "HiHat", midi: 42 },
};
const LANES: DrumKind[] = ["kick", "snare", "hihat"];

const normKind = (k: string): DrumKind | null =>
  k === "kick" || k === "snare" || k === "hihat" ? k : null;

/** 検出 meter(拍数) → ネタの meter 文字列。3→3/4・4→4/4・6→6/8。 */
export function meterString(meter: number): string {
  return meter === 6 ? "6/8" : `${meter}/4`;
}

// ---------------------------------------------------------------------------
// 正準パターン型ライブラリ（拍単位で定義・sub 倍して step ベクトルへ）。
// スネア=バックビート/キック=頭 という「よくある型」が拍子と downbeat を決める強い手がかり。
// ---------------------------------------------------------------------------
interface DrumTemplate {
  name: string;
  kick: number[]; // 拍位置（実数拍・小節内）
  snare: number[];
}
const TEMPLATES: Record<number, DrumTemplate[]> = {
  4: [
    { name: "rock", kick: [0, 2], snare: [1, 3] },
    { name: "four", kick: [0, 1, 2, 3], snare: [1, 3] },
    { name: "half", kick: [0], snare: [2] },
    { name: "rock+", kick: [0, 2, 2.5], snare: [1, 3] },
  ],
  3: [{ name: "waltz", kick: [0], snare: [1, 2] }],
  6: [
    { name: "six-a", kick: [0], snare: [3] },
    { name: "six-b", kick: [0, 4], snare: [2] },
    { name: "six-c", kick: [0], snare: [3, 5] },
    { name: "six-d", kick: [0, 3], snare: [1.5, 4.5] },
  ],
};

const templateVec = (beats: number[], sub: number, L: number): number[] => {
  const v = new Array<number>(L).fill(0);
  for (const b of beats) v[Math.round(b * sub) % L] = 1;
  return v;
};

// --- 小さなベクトル演算（L<=24 なので素朴で十分） ---
const zeroMeanUnit = (v: number[]): number[] => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const c = v.map((x) => x - m);
  const n = Math.sqrt(c.reduce((a, b) => a + b * b, 0));
  return n < 1e-9 ? c.map(() => 0) : c.map((x) => x / n);
};
const unit = (v: number[]): number[] => {
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  return n < 1e-9 ? v.map(() => 0) : v.map((x) => x / n);
};
const dot = (a: number[], b: number[]): number => a.reduce((s, x, i) => s + x * b[i]!, 0);
const roll = (v: number[], sh: number): number[] => {
  const L = v.length;
  const s = ((sh % L) + L) % L;
  return v.map((_, i) => v[(i + s) % L]!);
};

// ---------------------------------------------------------------------------
// 窓分割＋局所グリッド（局所自己相関で周期・円形平均で位相）
// ---------------------------------------------------------------------------
interface LocalWindow {
  t0: number;
  t1: number;
  period: number; // 局所拍周期(秒)
  sharp: Record<3 | 4, number>; // 拍/sub 格子への位相集中度（0..1）
  phase: Record<3 | 4, number>; // 格子位相（0..period/sub 秒）
}

const AC_RES = 0.005; // 自己相関の時間分解能(5ms)
const WIN_BEATS = 16; // 窓長（拍）
const HOP_BEATS = 8; // 窓hop（拍）

/** 窓内オンセット列の自己相関で局所拍周期（hint±8%→放物線補間→2倍lagで精緻化）。 */
function localPeriod(ts: number[], ws: number[], t0: number, wlen: number, hint: number): number | null {
  const n = Math.floor(wlen / AC_RES) + 4;
  const e = new Array<number>(n).fill(0);
  for (let i = 0; i < ts.length; i++) {
    const k = Math.floor((ts[i]! - t0) / AC_RES);
    if (k >= 0 && k < n) e[k] = e[k]! + ws[i]!;
  }
  // ガウス平滑（σ=10ms）＝オンセット時刻の微ジッタを吸収
  const half = 6;
  const g: number[] = [];
  for (let i = -half; i <= half; i++) g.push(Math.exp(-0.5 * ((i * AC_RES) / 0.01) ** 2));
  const sm = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (e[i]! === 0) continue;
    for (let j = -half; j <= half; j++) {
      const k = i + j;
      if (k >= 0 && k < n) sm[k] = sm[k]! + e[i]! * g[j + half]!;
    }
  }
  const ac = (lag: number): number => {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += sm[i]! * sm[i + lag]!;
    return s;
  };
  const peakNear = (lo: number, hi: number): number | null => {
    const ilo = Math.max(1, Math.floor(lo / AC_RES));
    const ihi = Math.min(n - 2, Math.ceil(hi / AC_RES));
    if (ihi <= ilo) return null;
    let bi = ilo, bv = -Infinity;
    for (let i = ilo; i <= ihi; i++) {
      const v = ac(i);
      if (v > bv) { bv = v; bi = i; }
    }
    if (bv <= 0) return null;
    const y0 = ac(bi - 1), y1 = bv, y2 = ac(bi + 1);
    const den = y0 - 2 * y1 + y2;
    const d = Math.abs(den) < 1e-12 ? 0 : (y0 - y2) / (2 * den);
    return (bi + Math.max(-0.5, Math.min(0.5, d))) * AC_RES;
  };
  let p = peakNear(hint * 0.92, hint * 1.08);
  if (p == null) return null;
  const p2 = peakNear(2 * p * 0.97, 2 * p * 1.03); // 2倍lagで周期精度を倍に
  if (p2 != null) p = p2 / 2;
  return p;
}

/** 円形平均で位相＋集中度（sub分割格子への乗り）。 */
function circularPhase(ts: number[], ws: number[], t0: number, unitSec: number): { phase: number; sharp: number } {
  let re = 0, im = 0, W = 0;
  for (let i = 0; i < ts.length; i++) {
    const ang = (((ts[i]! - t0) % unitSec) / unitSec) * 2 * Math.PI;
    re += ws[i]! * Math.cos(ang);
    im += ws[i]! * Math.sin(ang);
    W += ws[i]!;
  }
  if (W < 1e-9) return { phase: 0, sharp: 0 };
  const sharp = Math.sqrt(re * re + im * im) / W;
  let phase = (Math.atan2(im, re) / (2 * Math.PI)) * unitSec;
  if (phase < 0) phase += unitSec;
  return { phase, sharp };
}

/** 窓分割して局所グリッド列を作る（全レーンを時計に使う＝ハットは最良のタイムキーパー）。 */
function localWindows(onsets: DrumOnset[], hint: number, winBeats = WIN_BEATS, hopBeats = HOP_BEATS): LocalWindow[] {
  const ks = onsets
    .map(([t, k, s]) => ({ t, kind: normKind(k), w: s > 0 ? s : 1 }))
    .filter((p) => p.kind !== null);
  if (ks.length < 16) return [];
  const ts = ks.map((p) => p.t);
  const ws = ks.map((p) => p.w);
  const tMin = Math.min(...ts), tMax = Math.max(...ts);
  const wlen = hint * winBeats;
  const hop = hint * hopBeats;
  // 末尾に届かない時は tMax 終端でアンカーした窓を足す（短い曲の証拠を捨てない）
  const starts: number[] = [];
  for (let t0 = tMin; t0 + wlen <= tMax + 1e-9; t0 += hop) starts.push(t0);
  const lastStart = tMax - wlen;
  if (lastStart > tMin + 1e-9 && (starts.length === 0 || lastStart - starts[starts.length - 1]! > hop * 0.3)) starts.push(lastStart);
  const out: LocalWindow[] = [];
  for (const t0 of starts) {
    const idx: number[] = [];
    for (let i = 0; i < ts.length; i++) if (ts[i]! >= t0 && ts[i]! < t0 + wlen) idx.push(i);
    if (idx.length < 8) continue;
    const wts = idx.map((i) => ts[i]!);
    const wws = idx.map((i) => ws[i]!);
    const period = localPeriod(wts, wws, t0, wlen, hint);
    if (period == null) continue;
    const p4 = circularPhase(wts, wws, t0, period / 4);
    const p3 = circularPhase(wts, wws, t0, period / 3);
    out.push({
      t0, t1: t0 + wlen, period,
      sharp: { 4: p4.sharp, 3: p3.sharp },
      phase: { 4: p4.phase, 3: p3.phase },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 窓 fold（lane×step 強度ヒスト＋小節出現 presence）とテンプレ照合
// ---------------------------------------------------------------------------
interface WindowFold {
  hist: Record<DrumKind, number[]>; // 強度和
  pres: Record<DrumKind, number[]>; // stepが鳴った小節数
  bars: number; // 窓内の小節数（presence の分母）
  repeat: number; // 隣接小節の類似度（kick+snare・0..1）＝「小節でパターンが繰り返っているか」
}

const QUANT_TOL = 0.3; // 格子から unit の±30% 以内だけ採用

function foldWindow(onsets: DrumOnset[], win: LocalWindow, sub: 3 | 4, L: number): WindowFold {
  const unitSec = win.period / sub;
  const origin = win.t0 + win.phase[sub];
  const hist: Record<DrumKind, number[]> = {
    kick: new Array(L).fill(0), snare: new Array(L).fill(0), hihat: new Array(L).fill(0),
  };
  const presSets: Record<DrumKind, Map<number, Set<number>>> = { kick: new Map(), snare: new Map(), hihat: new Map() };
  const barVecs = new Map<number, { kick: number[]; snare: number[] }>(); // 小節ごとの kick/snare stepベクトル
  for (const [t, k, s] of onsets) {
    const kind = normKind(k);
    if (!kind || t < win.t0 || t >= win.t1) continue;
    const pos = (t - origin) / unitSec;
    const step = Math.round(pos);
    if (Math.abs(pos - step) > QUANT_TOL) continue;
    const fold = ((step % L) + L) % L;
    const w = s > 0 ? s : 1;
    hist[kind][fold] = hist[kind][fold]! + w;
    const barIdx = Math.floor(step / L);
    let set = presSets[kind].get(fold);
    if (!set) presSets[kind].set(fold, (set = new Set()));
    set.add(barIdx);
    if (kind !== "hihat") {
      let bv = barVecs.get(barIdx);
      if (!bv) barVecs.set(barIdx, (bv = { kick: new Array(L).fill(0), snare: new Array(L).fill(0) }));
      bv[kind][fold] = bv[kind][fold]! + w;
    }
  }
  const bars = Math.max(1, Math.round(((win.t1 - win.t0) / win.period / L) * sub));
  const pres: Record<DrumKind, number[]> = {
    kick: new Array(L).fill(0), snare: new Array(L).fill(0), hihat: new Array(L).fill(0),
  };
  for (const kind of LANES) for (const [st, set] of presSets[kind]) pres[kind][st] = set.size;
  // 隣接小節の類似度：定拍子＝小節ごとにほぼ同じ形（フィルでやや下がる）／
  // 変拍子を間違った bar 長で畳む＝小節ごとに中身がずれて全く違う形＝低い。
  const idxs = [...barVecs.keys()].sort((a, b) => a - b);
  let repSum = 0, repN = 0;
  for (let i = 1; i < idxs.length; i++) {
    if (idxs[i]! !== idxs[i - 1]! + 1) continue;
    const a = barVecs.get(idxs[i - 1]!)!, b = barVecs.get(idxs[i]!)!;
    repSum += (dot(unit(a.kick), unit(b.kick)) + dot(unit(a.snare), unit(b.snare))) / 2;
    repN += 1;
  }
  const repeat = repN ? repSum / repN : 0;
  return { hist, pres, bars, repeat };
}

interface TemplateMatch {
  score: number;
  name: string | null;
  ph: number; // fold の step index ＝ この窓の downbeat 位相
}

const OVERLAP_LAMBDA = 0.5; // kick/snareヒストの重なり（回転不変）ペナルティ＝ブリード/塗り潰し対策
const MIN_LANE_CORR = 0.1; // kick/snare **両方**が型に合う最低ライン（片レーンだけの偶然一致を弾く）

/** 窓foldに最良の正準型（位相込み）。score = zero-mean相関 − 重なり、× 小節出現率ファクタ。 */
function matchTemplates(fold: WindowFold, meter: number, sub: 3 | 4, presFloor = PRES_FLOOR): TemplateMatch {
  const L = meter * sub;
  const ov = dot(unit(fold.hist.kick), unit(fold.hist.snare));
  let best: TemplateMatch = { score: -9, name: null, ph: 0 };
  for (const T of TEMPLATES[meter] ?? []) {
    const tk = zeroMeanUnit(templateVec(T.kick, sub, L));
    const tsn = zeroMeanUnit(templateVec(T.snare, sub, L));
    for (let ph = 0; ph < L; ph++) {
      const hk = zeroMeanUnit(roll(fold.hist.kick, ph));
      const hs = zeroMeanUnit(roll(fold.hist.snare, ph));
      const ck = dot(hk, tk), cs = dot(hs, tsn);
      // 型はキック骨格とスネア骨格の**両方**に合うこと（スネアだけの偶然一致＝変拍子foldの
      // 滲んだ一様キックにスネア1山、を positives に数えない）
      if (ck < MIN_LANE_CORR || cs < MIN_LANE_CORR) continue;
      const corr = (ck + cs) / 2 - OVERLAP_LAMBDA * ov;
      if (corr <= best.score) continue;
      // 小節出現率：型のkick/snare位置が「毎小節鳴っているか」。折り畳みエイリアス
      // （6拍ループを4/4に畳むと rock に見えるが各stepは1/3の小節でしか鳴らない）を弾く。
      let pSum = 0, pN = 0;
      for (const [beats, lane] of [[T.kick, "kick"], [T.snare, "snare"]] as const) {
        for (const b of beats) {
          const st = (Math.round(b * sub) + ph) % L;
          pSum += Math.min(1, (fold.pres[lane][st] ?? 0) / fold.bars);
          pN += 1;
        }
      }
      const presFactor = pN ? presFloor + (1 - presFloor) * (pSum / pN) : 1;
      const sc = corr * presFactor;
      if (sc > best.score) best = { score: sc, name: T.name, ph };
    }
  }
  return best;
}

/** 内部ヘルパ（研究ハーネス/デバッグ用・API安定保証なし）。 */
export const _internals = { localWindows, foldWindow, matchTemplates };

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------
const POSITIVE_SC = 0.2; // 窓が「型に合った」とみなす下限
const HIT_FRAC = 0.45; // lane最大値に対する hit 採用閾値
const CONF_SCALE = 2.0; // score→confidence の較正（実3曲＋合成でグリッドサーチ・research doc参照）
const PRES_FLOOR = 0.15; // 小節出現率ファクタの床
const REPEAT_FLOOR = 0.5; // 隣接小節反復度ファクタの床（フィル/展開で満点は出ない前提の緩い係数）

/** 較正ノブ（研究ハーネス用・省略時は定数）。 */
export interface DrumTune {
  positiveSc?: number;
  presFloor?: number;
  repeatFloor?: number;
  confScale?: number;
}

export function extractDrumPattern(
  beatTimes: number[],
  onsets: DrumOnset[],
  opts: { forceMeter?: number; debug?: boolean; tune?: DrumTune } = {},
): DrumPatternResult {
  const T = {
    positiveSc: opts.tune?.positiveSc ?? POSITIVE_SC,
    presFloor: opts.tune?.presFloor ?? PRES_FLOOR,
    repeatFloor: opts.tune?.repeatFloor ?? REPEAT_FLOOR,
    confScale: opts.tune?.confScale ?? CONF_SCALE,
  };
  const diffs: number[] = [];
  for (let i = 1; i < beatTimes.length; i++) diffs.push(beatTimes[i]! - beatTimes[i - 1]!);
  diffs.sort((a, b) => a - b);
  const hint = diffs[Math.floor(diffs.length / 2)] || 0.5;

  const fallbackMeter = opts.forceMeter && opts.forceMeter > 0 ? opts.forceMeter : 4;
  const empty = (): DrumPatternResult => ({
    meter: fallbackMeter, sub: 4, confidence: 0, bpm: Math.round((60 / hint) * 10) / 10,
    downbeat: null, template: null, rhythm: { steps: fallbackMeter * 4, lanes: [] },
  });

  // 通常は16拍窓。短い素材（〜8小節）で窓が3枚立たない時は8拍窓に落として証拠を確保。
  let wins = localWindows(onsets, hint);
  if (wins.length < 3) wins = localWindows(onsets, hint, 8, 4);
  if (!wins.length) return empty();

  // sub 検出：全窓の位相集中度の平均（4=16分 vs 3=シャッフル3連）
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const s4 = mean(wins.map((w) => w.sharp[4]));
  const s3 = mean(wins.map((w) => w.sharp[3]));
  // シャッフル判定はマージン必須（拍上のみのオンセットは両格子で同点＝既定は16分）。
  // 実測ではシャッフル曲は劇的に差が付く（SURFACE: s4=0.11 vs s3=0.78）。
  const sub: 3 | 4 = s3 > s4 * 1.15 ? 3 : 4;
  const good = wins.filter((w) => w.sharp[sub] > 0.3);
  if (good.length < 3) return empty();

  const bpm = (() => {
    const ps = good.map((w) => w.period).sort((a, b) => a - b);
    return Math.round((60 / ps[Math.floor(ps.length / 2)]!) * 10) / 10;
  })();

  const candidates = opts.forceMeter && opts.forceMeter > 0 ? [opts.forceMeter] : [4, 3, 6];
  interface MeterResult {
    score: number; meanSc: number; support: number; agreement: number; coherence: number;
    template: string | null; agg: Record<DrumKind, number[]>; downbeat: number | null;
  }
  const results = new Map<number, MeterResult>();
  for (const meter of candidates) {
    const L = meter * sub;
    const folds = good.map((w) => ({ w, fold: foldWindow(onsets, w, sub, L) }));
    const matched = folds.map((f) => {
      const m0 = matchTemplates(f.fold, meter, sub, T.presFloor);
      // 隣接小節反復度＝「この bar 長で畳むと小節が繰り返って見えるか」。変拍子を誤った
      // bar 長で畳むと隣接小節の中身がズレて全く違う形＝型の偶然一致をここで落とす。
      const repFactor = T.repeatFloor + (1 - T.repeatFloor) * Math.max(0, f.fold.repeat);
      return { ...f, m: { ...m0, score: m0.score > 0 ? m0.score * repFactor : m0.score } };
    });
    let positive = matched.filter((e) => e.m.score > T.positiveSc);
    if (!positive.length && opts.forceMeter) positive = matched.filter((e) => e.m.score > 0);
    const support = positive.length / matched.length;
    const meanSc = positive.length ? mean(positive.map((e) => e.m.score)) : 0;
    // 集約：各窓を自分の downbeat へ回転し、スコア重みで足す
    const agg: Record<DrumKind, number[]> = {
      kick: new Array(L).fill(0), snare: new Array(L).fill(0), hihat: new Array(L).fill(0),
    };
    for (const e of positive) {
      const wgt = Math.max(0, e.m.score);
      for (const kind of LANES) {
        const r = roll(e.fold.hist[kind], e.m.ph);
        for (let i = 0; i < L; i++) agg[kind][i] = agg[kind][i]! + wgt * r[i]!;
      }
    }
    // 窓間一致：回転後ヒスト（kick/snare）の最良窓との余弦の平均
    let agreement = 0;
    if (positive.length >= 2) {
      const ref = positive.reduce((a, b) => (b.m.score > a.m.score ? b : a));
      const refK = unit(roll(ref.fold.hist.kick, ref.m.ph));
      const refS = unit(roll(ref.fold.hist.snare, ref.m.ph));
      agreement = mean(
        positive.map(
          (e) =>
            (dot(unit(roll(e.fold.hist.kick, e.m.ph)), refK) +
              dot(unit(roll(e.fold.hist.snare, e.m.ph)), refS)) / 2,
        ),
      );
    }
    // 多数派の型名・窓ごとの downbeat 時刻
    let template: string | null = null;
    if (positive.length) {
      const cnt = new Map<string, number>();
      for (const e of positive) if (e.m.name) cnt.set(e.m.name, (cnt.get(e.m.name) ?? 0) + 1);
      template = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }
    // 2パス目：各窓を**集約パターン（この曲自身の型）**へ再整列＝位相を安定させる。
    // 抽象テンプレは位相タイ（4つ打ち等）で窓ごとに±1拍揺れるが、実パターン（ハット含む
    // 3レーン）との相関はタイが少ない＝coherence/downbeat 用の位相はこちらで取る。
    const aggZ: Record<DrumKind, number[]> = {
      kick: zeroMeanUnit(agg.kick), snare: zeroMeanUnit(agg.snare), hihat: zeroMeanUnit(agg.hihat),
    };
    const ph2 = new Map<(typeof matched)[number], number>();
    for (const e of positive) {
      let bp = e.m.ph, bv = -Infinity;
      for (let ph = 0; ph < L; ph++) {
        let v = 0;
        for (const kind of LANES) v += dot(zeroMeanUnit(roll(e.fold.hist[kind], ph)), aggZ[kind]);
        if (v > bv) { bv = v; bp = ph; }
      }
      ph2.set(e, bp);
    }
    // fold で roll(hist, ph) が step0=downbeat になる ⇔ 実 step index ≡ -ph (mod L)
    const dbOf = (e: (typeof matched)[number]): number =>
      e.w.t0 + e.w.phase[sub] + (((L - (ph2.get(e) ?? e.m.ph)) % L) * (e.w.period / sub));
    const sorted = [...positive].sort((a, b) => a.w.t0 - b.w.t0);
    const downbeat = sorted.length ? dbOf(sorted[0]!) : null;
    // 小節線コヒーレンス：正窓の downbeat が等差格子（小節の繰り返し）に乗るか。
    // 定拍子＝残差が0付近／変拍子（6+5等）＝小節頭が漂い散る＝原理的な判別子。
    // 半小節単位で見て（バックビートの半小節両義タイを罰しない）、±20%の許容内に収まる
    // ペアの重み付き割合（円形平均だと3連1step分の推定揺れ≈17%まで過剰減点＝実曲SFで実測）。
    let coherence = 1;
    if (sorted.length >= 2) {
      let inTol = 0, W = 0;
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1]!, b = sorted[i]!;
        const halfBar = ((a.w.period / sub) * L) / 2;
        const res = (dbOf(b) - dbOf(a)) / halfBar;
        const frac = res - Math.floor(res); // 0..1
        const dist = Math.min(frac, 1 - frac); // 円距離
        const w = Math.min(a.m.score, b.m.score);
        if (dist <= 0.2) inTol += w;
        W += w;
      }
      coherence = W > 1e-9 ? inTol / W : 0;
    }
    // support は 0.5 で飽和＝「半分の窓で型が合えば十分」（静かなセクション/フィルで二重に罰しない）。
    // coherence はソフト係数（0.5+0.5·coh）＝実曲でも窓間の周期微差で満点は出ない（実測 LM 0.65・SF 0.32）。
    const supportSat = Math.min(1, support / 0.5);
    results.set(meter, {
      score: meanSc * supportSat * agreement * (0.5 + 0.5 * coherence),
      meanSc, support, agreement, coherence, template, agg, downbeat,
    });
  }

  let bestMeter = candidates[0]!;
  for (const m of candidates) if (results.get(m)!.score > results.get(bestMeter)!.score) bestMeter = m;
  const r = results.get(bestMeter)!;
  const confidence = Math.max(0, Math.min(1, Math.round(T.confScale * r.score * 1000) / 1000));

  // hits 抽出（lane最大の45%以上）→ sub=3 はスイング写像で 1step=16分 契約へ
  const L = bestMeter * sub;
  const swingMap = [0, 1, 3]; // 3連{0,1,2}→16分{0,1,3}（シャッフルの標準近似）
  const lanes: RhythmContentLite["lanes"] = [];
  for (const kind of LANES) {
    const v = r.agg[kind];
    const max = Math.max(...v);
    if (max <= 0) continue;
    const hits: number[] = [];
    for (let i = 0; i < L; i++) {
      if (v[i]! < HIT_FRAC * max) continue;
      const out16 = sub === 4 ? i : Math.floor(i / 3) * 4 + swingMap[i % 3]!;
      if (!hits.includes(out16)) hits.push(out16);
    }
    if (hits.length) lanes.push({ ...KIND_MIDI[kind], hits: hits.sort((a, b) => a - b) });
  }
  const res: DrumPatternResult = {
    meter: bestMeter, sub, confidence, bpm,
    downbeat: r.downbeat, template: r.template,
    rhythm: { steps: bestMeter * 4, lanes },
  };
  if (opts.debug) {
    const meters: NonNullable<DrumPatternResult["diag"]>["meters"] = {};
    for (const [m, v] of results) meters[m] = { score: v.score, meanSc: v.meanSc, support: v.support, agreement: v.agreement, coherence: v.coherence, agg: v.agg };
    res.diag = { sub: { s4, s3 }, windows: { total: wins.length, good: good.length }, meters };
  }
  return res;
}

// ---------------------------------------------------------------------------
// 全曲書き起こし（#S12改2・2026-07-08）
// 理想＝1小節ループでなく「曲の実ドラムを最後まで書き起こす」。ループ折り畳みは拍子/downbeat/
// グリッドをロバストに決めるための**内部中間物**であって出力ではない（曲の中にループは存在しない）。
// ここは extractDrumPattern が確定した (meter, sub, downbeat) の上で、**局所テンポを積分して全曲の
// 連続グリッド**を作り（実録音のドリフトを局所テンポ追従で吸収）、**実オンセットを各小節へ量子化**する
// ＝畳まない・タイル展開しない。各小節の生パターンも返す（後段の音楽的区間分解の入力）。
// ---------------------------------------------------------------------------
export interface FullTranscription {
  meter: number;
  sub: 3 | 4;
  bars: number; // 総小節数
  steps: number; // 全曲の16分step数 = bars*meter*4
  lanes: { name: string; midi: number; hits: number[] }[]; // hits=全曲通しの16分step index
  barPatterns: Record<DrumKind, number[]>[]; // 各小節の16分step集合（0..bars-1・区間分解用）
}

/** 窓の局所テンポ(period/sub=16分秒)を時間で線形補間する曲線。 */
function sixteenthCurve(wins: LocalWindow[], sub: 3 | 4): (t: number) => number {
  const ctrl = wins.map((w) => ({ t: (w.t0 + w.t1) / 2, s: w.period / sub })).sort((a, b) => a.t - b.t);
  return (t: number): number => {
    if (t <= ctrl[0]!.t) return ctrl[0]!.s;
    if (t >= ctrl[ctrl.length - 1]!.t) return ctrl[ctrl.length - 1]!.s;
    let lo = 0, hi = ctrl.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ctrl[mid]!.t <= t) lo = mid; else hi = mid; }
    const f = (t - ctrl[lo]!.t) / (ctrl[hi]!.t - ctrl[lo]!.t || 1);
    return ctrl[lo]!.s + f * (ctrl[hi]!.s - ctrl[lo]!.s);
  };
}

const SWING16 = [0, 1, 3]; // 3連{0,1,2}→16分{0,1,3}（シャッフルの標準近似）

export function transcribeFullSong(
  beatTimes: number[],
  onsets: DrumOnset[],
  grid: { meter: number; sub: 3 | 4; downbeat: number | null },
): FullTranscription | null {
  if (grid.downbeat == null) return null;
  const { meter, sub, downbeat } = grid;
  const diffs: number[] = [];
  for (let i = 1; i < beatTimes.length; i++) diffs.push(beatTimes[i]! - beatTimes[i - 1]!);
  diffs.sort((a, b) => a - b);
  const hint = diffs[Math.floor(diffs.length / 2)] || 0.5;
  let wins = localWindows(onsets, hint);
  if (wins.length < 3) wins = localWindows(onsets, hint, 8, 4);
  if (!wins.length) return null;

  const s16 = sixteenthCurve(wins, sub);
  // 全オンセットを時刻順に。局所テンポの逆数を台形積分して φ(t)=downbeatからの累積16分step数。
  const pts = onsets
    .map(([t, k]) => ({ t, kind: normKind(k) }))
    .filter((p): p is { t: number; kind: DrumKind } => p.kind !== null)
    .sort((a, b) => a.t - b.t);
  if (!pts.length) return null;
  const cum = new Array<number>(pts.length).fill(0);
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i]!.t - pts[i - 1]!.t;
    cum[i] = cum[i - 1]! + dt * 0.5 * (1 / s16(pts[i - 1]!.t) + 1 / s16(pts[i]!.t)); // 台形則
  }
  // downbeat 位置の累積値（φ(downbeat)=0 になるようオフセット）。cum は pts に対してだけ持つので線形補間。
  const phiAt = (t: number): number => {
    if (t <= pts[0]!.t) return cum[0]! - (pts[0]!.t - t) / s16(pts[0]!.t);
    if (t >= pts[pts.length - 1]!.t) return cum[pts.length - 1]! + (t - pts[pts.length - 1]!.t) / s16(t);
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid]!.t <= t) lo = mid; else hi = mid; }
    const f = (t - pts[lo]!.t) / (pts[hi]!.t - pts[lo]!.t || 1);
    return cum[lo]! + f * (cum[hi]! - cum[lo]!);
  };
  const phiDb = phiAt(downbeat);

  const subPerBar = meter * sub;
  const steps16PerBar = meter * 4;
  // onset → (bar, 16分step)。downbeat=step0=bar0。pickup(前)は落とす（v1）。
  const barHits: Record<DrumKind, Set<number>>[] = [];
  const ensureBar = (bar: number) => {
    while (barHits.length <= bar) barHits.push({ kick: new Set(), snare: new Set(), hihat: new Set() });
    return barHits[bar]!;
  };
  for (let i = 0; i < pts.length; i++) {
    const gstep = Math.round(cum[i]! - phiDb); // グローバルsub-step
    if (gstep < 0) continue;
    const bar = Math.floor(gstep / subPerBar);
    const subInBar = gstep % subPerBar;
    const step16 = sub === 4 ? subInBar : Math.floor(subInBar / 3) * 4 + SWING16[subInBar % 3]!;
    ensureBar(bar)[pts[i]!.kind].add(step16);
  }
  const bars = barHits.length;
  if (!bars) return null;
  const barPatterns: FullTranscription["barPatterns"] = barHits.map((b) => ({
    kick: [...b.kick].sort((x, y) => x - y),
    snare: [...b.snare].sort((x, y) => x - y),
    hihat: [...b.hihat].sort((x, y) => x - y),
  }));
  // 全曲通しの hits（bar*steps16PerBar + step16）
  const lanes: FullTranscription["lanes"] = [];
  for (const kind of LANES) {
    const hits: number[] = [];
    for (let bar = 0; bar < bars; bar++) for (const s of barPatterns[bar]![kind]) hits.push(bar * steps16PerBar + s);
    if (hits.length) lanes.push({ ...KIND_MIDI[kind], hits: hits.sort((a, b) => a - b) });
  }
  return { meter, sub, bars, steps: bars * steps16PerBar, lanes, barPatterns };
}
