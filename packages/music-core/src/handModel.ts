// M6a-6d＝鍵盤の手の物理モデル（phrase_maker `experiments/piano/fingersim/handmodel.py` の忠実移植）。
//
// 位置づけ＝**土台**（手が同時に何を届くか・どれだけ無理か・手首の移動の重さ）。生成の主導権は持たない＝どの生成器にも結線しない。
// 源流の性質（計画 §6-1）：`import itertools` のみ・RNG 0件・`round()` 6箇所（:120,121,261,262,305,306）＝py-parity で列一致。
//   - `round(x, 4)` は Python の規則（2進の厳密値を10進で丸め・ちょうど半分は偶数側）＝`pyRoundDigits`。
//   - `int(round(x))`（:305-306）は `pyRound`（drumFill.ts の銀行家丸め）。
//   - Python の dict は挿入順＝指→音の割り当ては `[finger, pitch][]`（挿入順）で持つ（JS の数値キーの object は並べ替わるので使わない）。
// 参照値＝`tools/py-parity/cases-handmodel/handmodel.json`（`tools/py-parity/run_dump_handmodel.sh`）。
//
// 定数の出所（NOTICE.md）：FREST/WEIGHTS/BFACTOR と REACH の MaxPrac 列（(1,5) を除く）＝pianoplayer（Marco Musy）hand.py・MIT License。
//   REACH の MinComf/MaxComf と REACH6 の補間列＝Parncutt et al. 1997 の模型に沿った phrase_maker の値。
import { pyRound } from "./drumFill";
import { pySum } from "./pyMath";

export const PIANOPLAYER_ATTRIBUTION = "pianoplayer by Marco Musy, MIT License (https://github.com/marcomusy/pianoplayer) — see NOTICE.md";

export type Hand = "R" | "L";
/** [指 1..5, 音高]。並び＝源流 dict の挿入順。 */
export type FingerPitch = [finger: number, pitch: number];
export type SpanMode = "comfort" | "stretch" | "relaxed";
export interface HandAssignment { cost: number; assign: FingerPitch[]; wristX: number; span: number }

// --- pianoplayer の実装定数（指 1..5 → 添字 0..4） ---
export const FREST: readonly number[] = [-7.0, -2.8, 0.0, 2.8, 5.6];
export const WEIGHTS: readonly number[] = [1.1, 1.0, 1.1, 0.9, 0.8];
export const BFACTOR: readonly number[] = [0.3, 1.0, 1.1, 0.8, 0.7];
/** 弱い指（4・5）の罰（SPEC）。挿入順＝1..5。 */
export const WEAK: ReadonlyMap<number, number> = new Map([[1, 0.0], [2, 0.0], [3, 0.0], [4, 0.45], [5, 0.75]]);
const BLACK_PC = new Set([1, 3, 6, 8, 10]);

const pyMod = (a: number, m: number): number => ((a % m) + m) % m;
const key = (lo: number, hi: number): string => `${lo},${hi}`;

/**
 * Python `round(x, nd)`（nd≥0）。x の2進の厳密値を10進で丸め、ちょうど半分は偶数側。結果は最も近い double。
 * `toFixed(100)` は厳密値の10進展開（小数100桁まで）を返す＝ここで扱う大きさの値では展開が途中で切れない。
 */
export function pyRoundDigits(x: number, nd: number): number {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0 || Object.is(x, -0);
  const [ip, fp] = Math.abs(x).toFixed(100).split(".") as [string, string];
  const rest = fp.slice(nd);
  let n = BigInt(ip + fp.slice(0, nd));
  const first = rest[0] ?? "0";
  const up = first > "5" || (first === "5" && (/[1-9]/.test(rest.slice(1)) || n % 2n === 1n));
  if (up) n += 1n;
  const digits = n.toString().padStart(nd + 1, "0");
  const v = Number(nd > 0 ? `${digits.slice(0, digits.length - nd)}.${digits.slice(digits.length - nd)}` : digits);
  return neg ? -v : v;
}

export function isBlackKeyPitch(pitch: number): boolean {
  return BLACK_PC.has(pyMod(pitch, 12));
}

// --- Parncutt の到達表（指の組 (lo, hi) → (MinComf, MaxComf, MaxPrac) 半音）。挿入順＝源流 dict。
const REACH_ENTRIES: readonly [readonly [number, number], readonly [number, number, number]][] = [
  [[1, 2], [2, 8, 12]],
  [[1, 3], [3, 10, 14]],
  [[1, 4], [4, 12, 16]],
  [[1, 5], [5, 13, 17]],
  [[2, 3], [1, 3, 6]],
  [[2, 4], [2, 5, 7]],
  [[2, 5], [3, 8, 11]],
  [[3, 4], [1, 3, 5]],
  [[3, 5], [2, 5, 8]],
  [[4, 5], [1, 2, 5]],
];
export const REACH: ReadonlyMap<string, readonly [number, number, number]> = new Map(REACH_ENTRIES.map(([k, v]) => [key(k[0], k[1]), v]));
export const REACH_PAIRS: readonly (readonly [number, number])[] = REACH_ENTRIES.map(([k]) => k);
export const reachOf = (lo: number, hi: number): readonly [number, number, number] => {
  const r = REACH.get(key(lo, hi));
  if (!r) throw new Error(`REACH has no finger pair (${lo}, ${hi})`); // 源流は KeyError
  return r;
};

/** 片手で持てない壁（1-5 の MaxPrac）。 */
export const MAXPRAC_15 = reachOf(1, 5)[2];

function orientedFrest(finger: number, hand: Hand): number {
  return hand === "R" ? FREST[finger - 1]! : -FREST[finger - 1]!;
}

/** 源流 dict(pairs)＝同じ指は後勝ち・並びは最初に現れた順。 */
function toDict(pairs: Iterable<readonly [number, number]>): Map<number, number> {
  const m = new Map<number, number>();
  for (const [f, p] of pairs) m.set(f, p);
  return m;
}

function* combinations(pool: readonly number[], n: number, start = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === n) { yield [...acc]; return; }
  for (let i = start; i < pool.length; i++) { acc.push(pool[i]!); yield* combinations(pool, n, i + 1, acc); acc.pop(); }
}

const sortedUniqueInts = (pitches: Iterable<number>): number[] => [...new Set([...pitches].map((p) => Math.trunc(p)))].sort((a, b) => a - b);

/** 源流 `assignment_cost`（:73-95）。到達不能（どこかの組が MaxPrac 超え）は null。 */
export function assignmentCost(pairs: readonly (readonly [number, number])[], hand: Hand): [cost: number, wristX: number] | null {
  let cost = 0.0;
  const n = pairs.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const [fi, pi] = pairs[i]!;
      const [fj, pj] = pairs[j]!;
      const [lo, hi] = fi < fj ? [fi, fj] : [fj, fi];
      const d = Math.abs(pj - pi);
      const [minc, maxc, maxp] = reachOf(lo, hi);
      if (d > maxp) return null;
      if (d > maxc) cost += (d - maxc) * 2.0;
      else if (d < minc) cost += (minc - d) * 2.0;
    }
  }
  for (const [f, p] of pairs) {
    cost += WEAK.get(f)!;
    if (isBlackKeyPitch(p)) cost += 1.1 - BFACTOR[f - 1]!;
  }
  // 源流は組み込み sum()（3.12＝補償付き）＝pySum
  return [cost, pySum(pairs.map(([f, p]) => p - orientedFrest(f, hand))) / n];
}

/** 源流 `best_assignment`（:98-121）。1〜4音を片手に置く最安の運指、置けなければ null。 */
export function bestAssignment(pitches: Iterable<number>, hand: Hand): HandAssignment | null {
  const ps = sortedUniqueInts(pitches);
  const n = ps.length;
  if (n === 0 || n > 4) return null;
  let best: HandAssignment | null = null;
  for (const combo of combinations([1, 2, 3, 4, 5], n)) {
    const fingers = hand === "R" ? combo : [...combo].reverse();
    const pairs: FingerPitch[] = fingers.map((f, i) => [f, ps[i]!]);
    const res = assignmentCost(pairs, hand);
    if (res == null) continue;
    const [cost, wristX] = res;
    if (best == null || cost < best.cost) {
      best = { cost: pyRoundDigits(cost, 4), assign: [...toDict(pairs)], wristX: pyRoundDigits(wristX, 4), span: ps[ps.length - 1]! - ps[0]! };
    }
  }
  return best;
}

/** 源流 `shift_cost`（:124-129）＝|Δ手首| ＋ Parncutt の位置替え（4度以上=2・2度以上=1）。 */
export function shiftCost(wristA: number, wristB: number): number {
  const d = Math.abs(wristA - wristB);
  const pc = d >= 5 ? 2.0 : d >= 2 ? 1.0 : 0.0;
  return d + pc;
}

export const THUMB_PASS_PENALTY = 1.5;

export function canGrab(pitches: Iterable<number>, hand: Hand): boolean {
  return bestAssignment(pitches, hand) != null;
}

// ===========================================================================
// SPEC-piano-handframe M1 の追加（源流 :141-）。純関数のみ。
// ===========================================================================

/** 単指 ↔ 手首の帯（半音）。 */
export const SOLO_BAND = 2.0;

// REACH6＝(MinPrac, MinComf, MinRel, MaxRel, MaxComf, MaxPrac)。[1,4,5] は REACH と一致（読み込み時に検める＝源流 _assert_reach6）。
const REACH6_ENTRIES: readonly [readonly [number, number], readonly [number, number, number, number, number, number]][] = [
  [[1, 2], [-1, 2, 2, 4, 8, 12]],
  [[1, 3], [-2, 3, 3, 7, 10, 14]],
  [[1, 4], [-3, 4, 4, 10, 12, 16]],
  [[1, 5], [-4, 5, 5, 12, 13, 17]],
  [[2, 3], [1, 1, 1, 3, 3, 6]],
  [[2, 4], [2, 2, 2, 5, 5, 7]],
  [[2, 5], [3, 3, 3, 8, 8, 11]],
  [[3, 4], [1, 1, 1, 3, 3, 5]],
  [[3, 5], [2, 2, 2, 5, 5, 8]],
  [[4, 5], [1, 1, 1, 2, 2, 5]],
];
export const REACH6: ReadonlyMap<string, readonly [number, number, number, number, number, number]> = new Map(REACH6_ENTRIES.map(([k, v]) => [key(k[0], k[1]), v]));
export const REACH6_PAIRS: readonly (readonly [number, number])[] = REACH6_ENTRIES.map(([k]) => k);
const reach6Of = (lo: number, hi: number) => {
  const r = REACH6.get(key(lo, hi));
  if (!r) throw new Error(`REACH6 has no finger pair (${lo}, ${hi})`);
  return r;
};

(function assertReach6() {
  for (const [[lo, hi], six] of REACH6_ENTRIES) {
    const [minc, maxc, maxp] = reachOf(lo, hi);
    if (!(six[1] === minc && six[4] === maxc && six[5] === maxp)) {
      throw new Error(`REACH6[(${lo}, ${hi})] violates 3-point match with REACH (MinComf/MaxComf/MaxPrac must equal)`);
    }
  }
})();

/** 源流 `_reach_band`（:193-204）。 */
export function reachBand(loF: number, hiF: number, spanMode: SpanMode): [number, number] {
  if (spanMode === "relaxed") {
    const r = reach6Of(loF, hiF);
    return [r[2], r[3]];
  }
  const [minc, maxc, maxp] = reachOf(loF, hiF);
  if (spanMode === "stretch") return [maxc + 1, maxp];
  return [minc, maxc];
}

/** 源流 `thumb_cross_span`（:207-213）。spanMode は源流でも未使用。 */
export function thumbCrossSpan(hiFinger: number, _spanMode: SpanMode = "comfort"): number {
  const mp = reach6Of(1, hiFinger)[0];
  return mp < 0 ? -mp : 0;
}

function anchorFromAssign(assign: Map<number, number>, hand: Hand): number {
  if (assign.size === 0) return 0.0;
  return pySum([...assign].map(([f, p]) => p - orientedFrest(f, hand))) / assign.size;
}

/** 源流 `free_finger_reach`（:224-263）。空いている指が押せる鍵（昇順）。空＝窓の枯渇。 */
export function freeFingerReach(
  assign: Iterable<readonly [number, number]>, held: Iterable<number>, finger: number, hand: Hand, spanMode: SpanMode = "comfort",
): number[] {
  const assignMap = toDict(assign);
  const hs = [...held].filter((h) => assignMap.has(h) && h !== finger);
  if (hs.length > 0) {
    let lo: number | null = null;
    let hi: number | null = null;
    for (const h of hs) {
      const pH = assignMap.get(h)!;
      const [loF, hiF] = finger < h ? [finger, h] : [h, finger];
      const [bandLo, bandHi] = reachBand(loF, hiF, spanMode);
      const fingerHigher = hand === "R" ? finger > h : finger < h;
      const [ivLo, ivHi] = fingerHigher ? [pH + bandLo, pH + bandHi] : [pH - bandHi, pH - bandLo];
      lo = lo == null ? ivLo : Math.max(lo, ivLo);
      hi = hi == null ? ivHi : Math.min(hi, ivHi);
    }
    if (lo == null || hi == null || lo > hi) return [];
    const out: number[] = [];
    for (let p = Math.trunc(lo); p < Math.trunc(hi) + 1; p++) out.push(p);
    return out;
  }
  const center = anchorFromAssign(assignMap, hand) + orientedFrest(finger, hand);
  const lo = Math.trunc(pyRound(center - SOLO_BAND));
  const hi = Math.trunc(pyRound(center + SOLO_BAND));
  const out: number[] = [];
  for (let p = lo; p < hi + 1; p++) out.push(p);
  return out;
}

/** 源流 `constrained_assignment`（:266-310）。押さえている指を動かさず、残りの指に新しい音を置く（指の交差なし）。 */
export function constrainedAssignment(heldMap: Iterable<readonly [number, number]>, newPitches: Iterable<number>, hand: Hand): HandAssignment | null {
  const held = toDict(heldMap);
  const ps = sortedUniqueInts(newPitches);
  const n = ps.length;
  const free = [1, 2, 3, 4, 5].filter((f) => !held.has(f));
  if (n === 0 || n > free.length) return null;
  if (held.size + n > 4) return null;
  let best: HandAssignment | null = null;
  for (const combo of combinations(free, n)) {
    const fingers = hand === "R" ? combo : [...combo].reverse();
    const pairs = new Map(held);
    fingers.forEach((f, i) => pairs.set(f, ps[i]!));
    const items = [...pairs].sort((a, b) => a[0] - b[0]);
    const byFinger = items.map(([, p]) => p);
    let mono = true;
    for (let i = 0; i < items.length - 1; i++) {
      if (hand === "R" ? !(byFinger[i]! < byFinger[i + 1]!) : !(byFinger[i]! > byFinger[i + 1]!)) { mono = false; break; }
    }
    if (!mono) continue;
    const costPairs = [...pairs].sort((a, b) => a[1] - b[1]); // 安定ソート＝源流 sorted(key=pitch)
    const res = assignmentCost(costPairs, hand);
    if (res == null) continue;
    const [cost, wristX] = res;
    if (best == null || cost < best.cost) {
      const allp = [...pairs.values()].sort((a, b) => a - b);
      best = { cost: pyRoundDigits(cost, 4), assign: [...pairs], wristX: pyRoundDigits(wristX, 4), span: allp[allp.length - 1]! - allp[0]! };
    }
  }
  return best;
}

/** 源流 `partial_cost`（:313-333）。押さえている指ごとの組だけを見た発音コスト。到達不能は null。 */
export function partialCost(assignMap: Iterable<readonly [number, number]>, held: Iterable<number>, finger: number, pitch: number, _hand: Hand): number | null {
  const m = toDict(assignMap);
  let cost = 0.0;
  for (const h of held) {
    if (h === finger || !m.has(h)) continue;
    const pH = m.get(h)!;
    const [loF, hiF] = finger < h ? [finger, h] : [h, finger];
    const [minc, maxc, maxp] = reachOf(loF, hiF);
    const d = Math.abs(pitch - pH);
    if (d > maxp) return null;
    if (d > maxc) cost += (d - maxc) * 2.0;
    else if (d < minc) cost += (minc - d) * 2.0;
  }
  cost += WEAK.get(finger)!;
  if (isBlackKeyPitch(pitch)) cost += 1.1 - BFACTOR[finger - 1]!;
  return cost;
}

/** 源流 `held_still_feasible`（:336-361）。手首が動いた後も鳴らし続けられる指（昇順）。 */
export function heldStillFeasible(heldMap: Iterable<readonly [number, number]>, newAnchorX: number, hand: Hand): number[] {
  const m = toDict(heldMap);
  const cand: number[] = [];
  for (const [f, p] of m) {
    const rest = newAnchorX + orientedFrest(f, hand);
    if (Math.abs(p - rest) <= SOLO_BAND) cand.push(f);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of [...cand]) {
      for (const b of cand) {
        if (a >= b) continue;
        const d = Math.abs(m.get(a)! - m.get(b)!);
        if (d > reachOf(a, b)[2]) {
          cand.splice(cand.indexOf(a), 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return [...cand].sort((a, b) => a - b);
}
