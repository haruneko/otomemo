// ピアノ伴奏（phrase_maker 試作 #1 取り込み S2）＝手が届く範囲の音をまとめて押さえる弾き方の生成器本体
// （phrase_maker `experiments/piano/fingersim/handframe.py`・e186970 の忠実移植）。
//
// 正典＝docs/drafts/2026-09-16-handframe-evolution-design.md §5 S2。まだどこからも呼ばれない（既存の出音は不変）。
// 芯（源流の注記どおり）：音高は「いま手が届く範囲」からしか生まれない＝handModel.ts の freeFingerReach／constrainedAssignment／
// bestAssignment の戻り値だけ。音高を名指しで手を動かす関数は無い。
//
// Python と最後の桁まで合わせるための約束：
// - 乱数＝PyRandom（random() のみ）。種は seed と seed ^ 0x00c0ffee の2本（32bit の非負整数だけ受ける）。
// - math.exp＝pyExp（glibc の写し）・sum()＝pySum（補償付き）・round(x, n)＝pyRoundDigits・int(round(x))＝pyRound。
// - sorted(moves, key=(score, diag))＝pyCompare（Python のタプル比較）＋安定ソート。
// - Python の frozenset／set（小さな非負整数）の走査は昇順＝held は常に昇順の配列で持つ。dict の挿入順は配列で持つ。
// - 浮動小数の足し算の順序は源流の式の順のまま（まとめたり並べ替えたりしない）。
// 環境の乱数・時計は使わない（決定論 grep ゲートの対象）。
import {
  bestAssignment, constrainedAssignment, freeFingerReach, heldStillFeasible, partialCost, pyRoundDigits, shiftCost,
  WEAK, FREST, type Hand, type SpanMode, type HandAssignment,
} from "./handModel";
import { pyRound } from "./drumFill";
import { PyRandom } from "./humanizeFill";
import { pyExp, pySum } from "./pyMath";
import { arcHeight, phraseEnergy, type PhraseSpec } from "./phraseArc";

// ---------------------------------------------------------------------------
// 語彙（源流 :75-92）
// ---------------------------------------------------------------------------
export const STAB = "stab";
export const TILL_NEXT = "till_next";
export const TILL_BOUNDARY = "till_boundary";
export const TILL_GRAB = "till_grab";
export type DurClass = typeof STAB | typeof TILL_NEXT | typeof TILL_BOUNDARY | typeof TILL_GRAB;

export const FIRE = "FIRE";
export const GRAB = "GRAB";
export const SHIFT = "SHIFT";
export const LEAP = "LEAP";
export const RESEED = "RESEED";
export const THUMB_UNDER = "THUMB_UNDER";
export const FINGER_OVER = "FINGER_OVER";
export const SKIP = "SKIP";
export type MoveKind = typeof FIRE | typeof GRAB | typeof SHIFT | typeof LEAP | typeof RESEED | typeof THUMB_UNDER | typeof FINGER_OVER;

const THUMB_PASS = 1.5;

const ACCENT16: ReadonlyMap<number, number> = new Map([[0, 1.0], [8, 0.8], [4, 0.6], [12, 0.6], [2, 0.4], [6, 0.4], [10, 0.4], [14, 0.4]]);

const pyMod = (a: number, m: number): number => ((a % m) + m) % m;
const floorDiv = (a: number, b: number): number => Math.floor(a / b);

/** 源流 metric_accent_norm（:101-110）。 */
export function metricAccentNorm(slot: number, grid = 16): number {
  if (grid === 16) return ACCENT16.get(pyMod(slot, 16)) ?? 0.2;
  const per = Math.max(1, floorDiv(grid, 4));
  if (pyMod(slot, grid) === 0) return 1.0;
  if (pyMod(slot, per) === 0) return 0.6;
  return 0.3;
}

const LINE_REPEAT_PEN = 0.8;
const LINE_SF_RUN_PEN = 0.3;
const K_CLASH = 2.5;
const MOTIF_MU_TYPE = 0.3;
const MOTIF_MU_DIR = 0.2;
const MOTIF_GAMMA = 0.5;
const DYAD_REPEAT_PEN = 0.8;

export type ClashGuard = "off" | "held" | "region";

/** 診断の入れ物（源流 diag dict）。キーの有無まで源流と同じにする。 */
export type HandFrameDiag = Record<string, unknown>;
const inc = (d: HandFrameDiag | null | undefined, k: string): void => {
  if (d != null) d[k] = ((d[k] as number | undefined) ?? 0) + 1;
};
const appendTo = (d: HandFrameDiag, k: string, v: unknown): void => {
  if (!Array.isArray(d[k])) d[k] = [];
  (d[k] as unknown[]).push(v);
};

function clashCheck(pitch: number, S: ReadonlySet<number>, durClass: DurClass, clashGuard: ClashGuard): [boolean, number] {
  let hit = false;
  if (S.size > 0) for (const s of S) { const d = Math.abs(pitch - s); if (d === 1 || d === 13) { hit = true; break; } }
  if (!hit) return [false, 0.0];
  if (clashGuard === "region") return [true, 0.0];
  if (durClass === TILL_NEXT || durClass === TILL_BOUNDARY) return [true, 0.0];
  return [false, K_CLASH];
}

function clashAdvance(regions: readonly (readonly [number, number])[], ridx: number, buf: Set<number>, t: number): [number, Set<number>, boolean] {
  while (ridx < regions.length && t >= regions[ridx]![1] - 1e-9) {
    ridx += 1;
    buf = new Set();
  }
  const inRegion = ridx < regions.length && regions[ridx]![0] - 1e-9 <= t;
  return [ridx, buf, inRegion];
}

function detectMotifPeriod(toks: readonly string[]): number {
  const n = toks.length;
  for (let p = 1; p <= n; p++) {
    let ok = true;
    for (let i = 0; i < n; i++) if (toks[i] !== toks[i % p]) { ok = false; break; }
    if (ok) return p;
  }
  return n;
}

/** 源流 M2Ctx（:169-205）。null＝M1 構成。 */
interface M2Ctx {
  allowed: ReadonlySet<number> | null;
  floor: number | null;
  ceiling: number | null;
  wideMotion: boolean;
  lambdaInertia: number;
  prevDir: number;
  chainLen: number;
  dyadOn: boolean;
  dyadPrior: number;
  landingBonus: number;
  landingOffstrong: number;
  isLanding: boolean;
  strongPcs: ReadonlySet<number> | null;
  grabW: number | null;
  lineMotion: boolean;
  repRun: number;
  sfRun: number;
  clashGuard: ClashGuard;
  clashS: ReadonlySet<number>;
  diag: HandFrameDiag | null;
  motifBias: number;
  motifTag: string | null;
  motifDir: number;
  dyadBreak: boolean;
  prevDyad: ReadonlySet<number> | null;
  dyadRun: number;
  grabDur: string;
  grabNoCluster: boolean;
  secondDyadCap: number | null;
  secondDyadCount: number;
}

const K_MIN = 3;
const HALF_POS = 2.0;
const FULL_POS = 5.0;
export const POOL_LO = 48;
export const POOL_HI = 96;

/** 源流 HandFrame（:219-232）。assign＝指の昇順・held＝昇順。 */
export interface HandFrame {
  hand: Hand;
  anchorX: number;
  assign: readonly (readonly [number, number])[];
  held: readonly number[];
  spanMode: SpanMode;
}

const sortedAssign = (m: Map<number, number>): [number, number][] => [...m].sort((a, b) => a[0] - b[0]);
const assignMap = (fr: HandFrame): Map<number, number> => new Map(fr.assign.map(([f, p]) => [f, p]));
const ascSet = (xs: Iterable<number>): number[] => [...new Set(xs)].sort((a, b) => a - b);

export type DiagTuple = readonly (string | number | readonly (string | number)[])[];

/** 源流 Move（:235-249）。 */
export interface Move {
  kind: MoveKind;
  notes: readonly (readonly [number, number])[];
  dur: DurClass;
  newAnchorX: number | null;
  spanMode: SpanMode | null;
  holds: readonly number[];
  released: readonly number[];
  orn: ReadonlySet<number>;
  score: number;
  diag: DiagTuple;
}

const mkMove = (m: Partial<Move> & Pick<Move, "kind" | "notes">): Move => ({
  dur: STAB, newAnchorX: null, spanMode: null, holds: [], released: [], orn: new Set(), score: 0.0, diag: [], ...m,
});

/** 源流 apply（:253-285）＝状態遷移（新しい HandFrame を返す）。 */
export function applyMove(frame: HandFrame, move: Move): HandFrame {
  let amap = assignMap(frame);
  let held = new Set(frame.held);
  let anchor: number;
  if (move.newAnchorX != null && (move.kind === SHIFT || move.kind === LEAP || move.kind === RESEED || move.kind === THUMB_UNDER || move.kind === FINGER_OVER)) {
    for (const f of move.released) held.delete(f);
    anchor = move.newAnchorX;
  } else {
    anchor = frame.anchorX;
  }
  if (move.kind === RESEED) {
    amap = new Map(move.notes.map(([f, p]) => [f, p]));
    held = new Set(move.holds);
  } else {
    for (const [f, p] of move.notes) amap.set(f, p);
    const holds = new Set(move.holds);
    for (const f of new Set(move.notes.map(([f]) => f))) {
      if (holds.has(f)) held.add(f);
      else held.delete(f);
    }
  }
  const spanMode = move.spanMode || frame.spanMode;
  return { hand: frame.hand, anchorX: anchor, assign: sortedAssign(amap), held: ascSet(held), spanMode };
}

export const REL = 0.02;

/** 源流 dur_end（:293-316）。 */
export function durEnd(durClass: DurClass, t: number, nextSlotT: number | null, boundaryT: number, stepDur: number, nextGrabT: number | null = null): number {
  if (durClass === TILL_GRAB) {
    let nxt = nextGrabT != null ? nextGrabT : (nextSlotT ? nextSlotT : boundaryT);
    nxt = Math.min(nxt, boundaryT);
    return Math.max(t + 0.05, nxt - REL);
  }
  if (durClass === TILL_BOUNDARY) return Math.max(t + 0.05, boundaryT - REL);
  if (durClass === TILL_NEXT) {
    const nxt = nextSlotT != null ? nextSlotT : boundaryT;
    return Math.max(t + 0.05, nxt - REL);
  }
  let cap = t + 1.6 * stepDur;
  if (nextSlotT != null) cap = Math.min(cap, nextSlotT - REL);
  return Math.max(t + 0.05, cap);
}

/** 小節ごとの和音の材料（源流 vd の使う分）。deg＝度数→pc。 */
export interface HandFrameBar {
  rh: readonly number[];
  allowed: ReadonlySet<number>;
  deg: Readonly<Record<string, number>>;
}

function chordPool(vd: HandFrameBar, bassMax: number, allowed: ReadonlySet<number> | null = null, floor: number | null = null, ceiling: number | null = null): number[] {
  const pcs = allowed != null ? allowed : vd.allowed;
  const lo = Math.max((floor == null ? bassMax : floor) + 1, POOL_LO);
  const hi = ceiling == null ? POOL_HI : Math.min(POOL_HI, ceiling + 1);
  const out: number[] = [];
  for (let p = lo; p < hi; p++) if (pcs.has(pyMod(p, 12))) out.push(p);
  return out;
}

function fingerTravel(f: number, p: number, prevFinger: number | null, prevPitch: number | null, role: string): number {
  if (prevFinger == null) return 0.0;
  if (f !== prevFinger) return 0.1 * Math.abs(f - prevFinger);
  if (p !== prevPitch) return 0.4;
  return role === "colour" ? 0.0 : 0.1;
}

const SECOND_DYAD_PEN = 0.8;
const isSecond = (a: number, b: number): boolean => { const d = Math.abs(a - b); return d === 1 || d === 2 || d === 13 || d === 14; };
function isAdjacentCluster(pitches: readonly number[]): boolean {
  const ps = [...pitches].sort((a, b) => a - b);
  if (ps.length < 3) return false;
  for (let i = 0; i < ps.length - 1; i++) if (ps[i + 1]! - ps[i]! > 2) return false;
  return true;
}
const setEq = (a: ReadonlySet<number>, b: ReadonlySet<number>): boolean => a.size === b.size && [...a].every((x) => b.has(x));

function heldMapOf(frame: HandFrame): [number, number][] {
  const amap = assignMap(frame);
  return frame.held.filter((f) => amap.has(f)).map((f) => [f, amap.get(f)!]);
}

function makeGrab(frame: HandFrame, pitches: readonly number[], prevFinger: number | null, prevPitch: number | null, role: string, extraScore: number, m2: M2Ctx | null, tag: string): Move | null {
  const heldMap = heldMapOf(frame);
  const ca = constrainedAssignment(heldMap, new Set(pitches), frame.hand);
  if (ca == null) return null;
  const p2f = new Map<number, number>();
  for (const [f, p] of ca.assign) p2f.set(p, f);
  const notes = pitches.map((p) => [p2f.get(p)!, p] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const n = pitches.length;
  let trav = Infinity;
  for (const [f, p] of notes) { const v = fingerTravel(f, p, prevFinger, prevPitch, role); if (v < trav) trav = v; }
  const amap = assignMap(frame);
  let sustainedTop: number | null = null;
  for (const f of frame.held) { const v = amap.get(f)!; if (sustainedTop == null || v > sustainedTop) sustainedTop = v; }
  const top = sustainedTop != null && Math.max(...pitches) < sustainedTop ? -0.3 : 0.0;
  const strong = m2 ? m2.strongPcs : null;
  let rb = 0.0;
  if (strong != null) rb = pitches.every((p) => strong.has(pyMod(p, 12))) ? 0.0 : 0.2;
  let dur: DurClass;
  if (role === "colour") dur = STAB;
  else if (tag === "GRABp" && m2 != null && m2.grabDur === "stab") dur = STAB;
  else if (tag === "GRABp" && m2 != null && m2.grabDur === "till_grab") dur = TILL_GRAB;
  else dur = TILL_NEXT;
  let clashPen = 0.0;
  if (m2 && m2.clashGuard !== "off" && m2.clashS.size > 0) {
    for (const [, p] of notes) {
      const [excl, pen] = clashCheck(p, m2.clashS, dur, m2.clashGuard);
      if (excl) { inc(m2.diag, "clash_rejected"); return null; }
      clashPen += pen;
    }
    if (clashPen && m2.diag != null) inc(m2.diag, "clash_penalized");
  }
  let motifBonus = 0.0;
  if (m2 && m2.motifBias > 0 && m2.motifTag === tag) motifBonus = -MOTIF_MU_TYPE * m2.motifBias;
  let dyadRepPen = 0.0;
  if (m2 && m2.dyadBreak && tag === "DYAD" && m2.prevDyad != null && setEq(new Set(pitches), m2.prevDyad)) {
    dyadRepPen = DYAD_REPEAT_PEN * (1 + m2.dyadRun);
    inc(m2.diag, "dyad_repeat_penalized");
  }
  let secondPen = 0.0;
  if (m2 && tag === "DYAD" && m2.secondDyadCap != null && pitches.length === 2 && isSecond(pitches[0]!, pitches[1]!)) {
    const over = m2.secondDyadCount - m2.secondDyadCap;
    if (over >= 0) {
      secondPen = SECOND_DYAD_PEN * (1 + over);
      inc(m2.diag, "second_dyad_penalized");
    }
  }
  const score = ca.cost / n + trav + top + rb + extraScore + clashPen + motifBonus + dyadRepPen + secondPen;
  return mkMove({ kind: GRAB, notes, dur, score, diag: [tag, n, notes.map(([, p]) => p)] });
}

const DYAD_OVERHEAD = 0.45;

type FireCand = [score: number, finger: number, pitch: number, pcost: number];
const byFireKey = (a: FireCand, b: FireCand): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function* combinations<T>(pool: readonly T[], n: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === n) { yield [...acc]; return; }
  for (let i = start; i < pool.length; i++) { acc.push(pool[i]!); yield* combinations(pool, n, i + 1, acc); acc.pop(); }
}

function dyadCandidates(frame: HandFrame, fireCands: readonly FireCand[], role: string, prevFinger: number | null, prevPitch: number | null, m2: M2Ctx): Move[] {
  const top8 = [...fireCands].sort(byFireKey).slice(0, 8);
  const out: Move[] = [];
  const extra = DYAD_OVERHEAD + m2.dyadPrior;
  for (const [a, b] of combinations(top8, 2)) {
    const [, fa, pa] = a!;
    const [, fb, pb] = b!;
    if (fa === fb || pa === pb) continue;
    const mv = makeGrab(frame, [pa, pb], prevFinger, prevPitch, role, extra, m2, "DYAD");
    if (mv != null) out.push(mv);
  }
  return out;
}

function grabCandidates(frame: HandFrame, fireCands: readonly FireCand[], prevFinger: number | null, prevPitch: number | null, m2: M2Ctx): Move[] {
  const top = [...fireCands].sort(byFireKey).slice(0, 6);
  const pool = ascSet(top.map((c) => c[2]));
  const out: Move[] = [];
  const prior = -0.5 * m2.grabW!;
  for (const n of [2, 3]) {
    for (const combo of combinations(pool, n)) {
      if (n === 3 && m2.grabNoCluster && isAdjacentCluster(combo)) {
        inc(m2.diag, "grab_cluster_dropped");
        continue;
      }
      const mv = makeGrab(frame, combo, prevFinger, prevPitch, "structure", prior, m2, "GRABp");
      if (mv != null) out.push(mv);
    }
  }
  return out;
}

function anchorOf(amap: Map<number, number>, hand: Hand): number {
  if (amap.size === 0) return 0.0;
  return pySum([...amap].map(([f, p]) => p - orientedFrest(f, hand))) / amap.size;
}
const orientedFrest = (f: number, hand: Hand): number => (hand === "R" ? FREST[f - 1]! : -FREST[f - 1]!);

/** 源流 enumerate_moves（:484-638）。 */
function enumerateMoves(
  frame: HandFrame, vd: HandFrameBar, role: string,
  o: { bassMax: number; prevFinger: number | null; prevPitch: number | null; reseedWrist: number | null; slotsToBoundary: number | null;
    approachTargets: ReadonlySet<number> | ReadonlyMap<number, number> | null; diag: HandFrameDiag | null; m2: M2Ctx | null },
): Move[] {
  const { bassMax, prevFinger, prevPitch, reseedWrist, slotsToBoundary, approachTargets, diag, m2 } = o;
  const amap = assignMap(frame);
  const held = frame.held;
  const pool = new Set(chordPool(vd, bassMax, m2 ? m2.allowed : null, m2 ? m2.floor : null, m2 ? m2.ceiling : null));
  let sustainedTop: number | null = null;
  for (const f of held) { const v = amap.get(f)!; if (sustainedTop == null || v > sustainedTop) sustainedTop = v; }

  const moves: Move[] = [];
  let totalWindow = 0;
  let totalAllowed = 0;
  let prunedAny = false;
  const free = [1, 2, 3, 4, 5].filter((f) => !held.includes(f));
  const fireCands: FireCand[] = [];
  const strong = m2 ? m2.strongPcs : null;
  const regAnchor = amap.size > 0 ? anchorOf(amap, frame.hand) : 60.0;
  const assignPairs = [...amap];

  for (const f of free) {
    const win = freeFingerReach(assignPairs, held, f, frame.hand, frame.spanMode);
    const winAllowed = win.filter((p) => pool.has(p));
    let legalHere = 0;
    for (const p of pool) if (Math.abs(p - regAnchor) <= 14) legalHere++;
    totalWindow += winAllowed.length;
    totalAllowed += legalHere;
    if (winAllowed.length < legalHere) prunedAny = true;
    for (const p of winAllowed) {
      const pc = partialCost(assignPairs, held, f, p, frame.hand);
      if (pc == null) continue;
      const trav = fingerTravel(f, p, prevFinger, prevPitch, role);
      const top = sustainedTop != null && p < sustainedTop ? -0.3 : 0.0;
      const rb = 0.0;
      let score = pc + trav + top + rb;
      if (m2 && (m2.wideMotion || m2.lineMotion) && prevPitch != null) {
        const step = p - prevPitch;
        if (step === 0) score += 0.5;
        else if (m2.chainLen >= 1 && (step > 0 ? 1 : -1) === -m2.prevDir) score += m2.lambdaInertia;
      }
      if (m2 && m2.lineMotion) {
        if (prevPitch != null && p === prevPitch) score += LINE_REPEAT_PEN * (1 + m2.repRun);
        if (prevFinger != null && f === prevFinger && p !== prevPitch) score += LINE_SF_RUN_PEN * m2.sfRun;
      }
      const dur: DurClass = role === "colour" ? STAB : TILL_NEXT;
      if (m2 && m2.clashGuard !== "off" && m2.clashS.size > 0) {
        const [excl, pen] = clashCheck(p, m2.clashS, dur, m2.clashGuard);
        if (excl) { inc(m2.diag, "clash_rejected"); continue; }
        if (pen) { score += pen; inc(m2.diag, "clash_penalized"); }
      }
      if (m2 && m2.isLanding && strong != null) score += strong.has(pyMod(p, 12)) ? m2.landingBonus : m2.landingOffstrong;
      if (m2 && m2.motifBias > 0) {
        if (m2.motifTag === "FIRE") score += -MOTIF_MU_TYPE * m2.motifBias;
        if (m2.motifDir !== 0 && prevPitch != null) {
          const d = p === prevPitch ? 0 : p > prevPitch ? 1 : -1;
          if (d === m2.motifDir) score += -MOTIF_MU_DIR * m2.motifBias;
        }
      }
      fireCands.push([score, f, p, pc]);
      moves.push(mkMove({ kind: FIRE, notes: [[f, p]], dur, score, diag: ["FIRE", f, p, dur] }));
    }
  }

  if (m2 && m2.dyadOn && fireCands.length >= 2) moves.push(...dyadCandidates(frame, fireCands, role, prevFinger, prevPitch, m2));
  if (m2 && role === "structure" && m2.grabW != null && fireCands.length >= 2) moves.push(...grabCandidates(frame, fireCands, prevFinger, prevPitch, m2));
  if (m2 && m2.wideMotion) moves.push(...crossCandidates(frame, pool, prevFinger, prevPitch, m2));

  if (approachTargets != null && approachTargets.size > 0) {
    const targets = new Set(approachTargets instanceof Map ? approachTargets.keys() : approachTargets);
    for (const f of free) {
      const win = freeFingerReach(assignPairs, held, f, frame.hand, frame.spanMode);
      const inter = ascSet(win.filter((p) => targets.has(p)));
      for (const p of inter) {
        const pc = partialCost(assignPairs, held, f, p, frame.hand);
        if (pc == null) continue;
        const trav = fingerTravel(f, p, prevFinger, prevPitch, role);
        let score = pc + trav - 0.5;
        if (m2 && m2.lineMotion) {
          if (prevPitch != null && p === prevPitch) score += LINE_REPEAT_PEN * (1 + m2.repRun);
          if (prevFinger != null && f === prevFinger && p !== prevPitch) score += LINE_SF_RUN_PEN * m2.sfRun;
        }
        moves.push(mkMove({ kind: FIRE, notes: [[f, p]], dur: STAB, orn: new Set([p]), score, diag: ["APPROACH", f, p] }));
      }
    }
  }

  const drought = moves.length < K_MIN;
  let wantShift = false;
  if (reseedWrist != null && slotsToBoundary != null && slotsToBoundary <= 3) {
    if (Math.abs(reseedWrist - frame.anchorX) >= HALF_POS) wantShift = true;
  }
  if (drought || wantShift) moves.push(...shiftCandidates(frame, vd, bassMax, prevFinger, prevPitch, reseedWrist, drought, m2));

  if (diag != null) {
    inc(diag, "slots");
    if (prunedAny) inc(diag, "pruned_slots");
    if (totalAllowed > 0 && totalWindow >= totalAllowed && !prunedAny) inc(diag, "degenerate_slots");
  }
  return moves;
}

/** 源流 _cross_candidates（:648-714）。 */
function crossCandidates(frame: HandFrame, pool: ReadonlySet<number>, prevFinger: number | null, prevPitch: number | null, m2: M2Ctx): Move[] {
  void prevFinger;
  if (m2.prevDir === 0 || prevPitch == null) return [];
  if (frame.hand !== "R") return [];
  const direction = m2.prevDir;
  const amap = assignMap(frame);
  const heldMap = heldMapOf(frame);
  const newAnchor = frame.anchorX + 6.0 * direction;
  const survive = heldStillFeasible(heldMap, newAnchor, frame.hand);
  const released = heldMap.map(([f]) => f).filter((f) => !survive.includes(f));
  const newHeld = ascSet(survive);
  const prepared = m2.chainLen >= 1;
  const base = prepared ? 0.75 : THUMB_PASS;
  const kind: MoveKind = direction > 0 ? THUMB_UNDER : FINGER_OVER;
  const order = direction > 0 ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1];
  const out: Move[] = [];
  const assignPairs = [...amap];
  for (const f of order) {
    if (newHeld.includes(f)) continue;
    const win = freeFingerReach(assignPairs, newHeld, f, frame.hand, "comfort");
    let cands = win.filter((p) => pool.has(p) && (direction > 0 ? p > prevPitch : p < prevPitch)).sort((a, b) => a - b);
    if (direction < 0) cands = cands.reverse();
    for (const p of cands.slice(0, 1)) {
      const pc = partialCost(assignPairs, newHeld, f, p, frame.hand);
      if (pc == null) continue;
      let score = base + pc;
      if (m2.clashGuard !== "off" && m2.clashS.size > 0) {
        const [excl, pen] = clashCheck(p, m2.clashS, STAB, m2.clashGuard);
        if (excl) { inc(m2.diag, "clash_rejected"); continue; }
        if (pen) { score += pen; inc(m2.diag, "clash_penalized"); }
      }
      if (m2.motifBias > 0) {
        if (m2.motifTag === "cross") score += -MOTIF_MU_TYPE * m2.motifBias;
        if (m2.motifDir === direction) score += -MOTIF_MU_DIR * m2.motifBias;
      }
      out.push(mkMove({ kind, notes: [[f, p]], dur: STAB, newAnchorX: newAnchor, released, score, diag: [kind, f, p, direction, m2.chainLen] }));
    }
  }
  return out.slice(0, 2);
}

/** 源流 _shift_candidates（:717-766）。 */
function shiftCandidates(frame: HandFrame, vd: HandFrameBar, bassMax: number, prevFinger: number | null, prevPitch: number | null, reseedWrist: number | null, drought: boolean, m2: M2Ctx | null): Move[] {
  const amap = assignMap(frame);
  const heldMap = heldMapOf(frame);
  const pool = new Set(chordPool(vd, bassMax, m2 ? m2.allowed : null, m2 ? m2.floor : null, m2 ? m2.ceiling : null));
  const out: Move[] = [];
  let targets: number[];
  if (reseedWrist != null) {
    const step = Math.abs(reseedWrist - frame.anchorX) < FULL_POS ? HALF_POS : FULL_POS;
    const direction = reseedWrist > frame.anchorX ? 1.0 : -1.0;
    targets = [frame.anchorX + direction * step];
  } else {
    targets = [frame.anchorX + HALF_POS, frame.anchorX - HALF_POS];
  }
  const assignPairs = [...amap];
  for (const newAnchor of targets) {
    const kind: MoveKind = Math.abs(newAnchor - frame.anchorX) >= FULL_POS ? LEAP : SHIFT;
    const survive = heldStillFeasible(heldMap, newAnchor, frame.hand);
    const released = heldMap.map(([f]) => f).filter((f) => !survive.includes(f));
    const moved = shiftCost(frame.anchorX, newAnchor);
    const newHeld = ascSet(survive);
    const free = [1, 2, 3, 4, 5].filter((f) => !newHeld.includes(f));
    for (const f of free) {
      const win = freeFingerReach(assignPairs, newHeld, f, frame.hand, frame.spanMode);
      const cands = win.filter((p) => pool.has(p));
      for (const p of cands.slice(0, 1)) {
        const pc = partialCost(assignPairs, newHeld, f, p, frame.hand);
        if (pc == null) continue;
        const trav = fingerTravel(f, p, prevFinger, prevPitch, "colour");
        const score = pc + trav + moved;
        const origin = drought ? "drought" : "pull";
        out.push(mkMove({ kind, notes: [[f, p]], dur: STAB, newAnchorX: newAnchor, released, score, diag: [kind, f, p, pyRoundDigits(moved, 2), origin] }));
      }
    }
  }
  return out;
}

type PyVal = string | number | boolean | readonly PyVal[];

/** Python の < による比較（数・文字列・タプル）。型の混在は Python でも TypeError なので例外。 */
export function pyCompare(a: PyVal, b: PyVal): number {
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const c = pyCompare(a[i]!, b[i]!);
      if (c !== 0) return c;
    }
    return a.length - b.length;
  }
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  throw new TypeError(`pyCompare: '<' not supported between ${typeof a} and ${typeof b}`);
}

/** 源流 sample_topk（:769-798）＝重み付きの上位 k から1つ（最良固定は禁止）。 */
export function sampleTopk(moves: readonly Move[], rng: PyRandom, k = 3, diag: HandFrameDiag | null = null): Move | null {
  if (moves.length === 0) return null;
  const ordered = [...moves].sort((a, b) => pyCompare([a.score, a.diag as PyVal], [b.score, b.diag as PyVal]));
  const top = ordered.slice(0, k);
  const scores = top.map((m) => m.score);
  const smin = scores[0]!;
  const gaps: number[] = [];
  for (let i = 0; i < scores.length - 1; i++) gaps.push(scores[i + 1]! - scores[i]!);
  const med = gaps.length ? [...gaps].sort((a, b) => a - b)[floorDiv(gaps.length, 2)]! : 0.0;
  const T = Math.max(med, 0.15);
  const weights = scores.map((s) => pyExp(-(s - smin) / T));
  const tot = pySum(weights);
  const r = rng.random() * tot;
  let acc = 0.0;
  let chosen = top[top.length - 1]!;
  for (let i = 0; i < top.length; i++) {
    acc += weights[i]!;
    if (r <= acc) { chosen = top[i]!; break; }
  }
  if (diag != null) {
    inc(diag, "topk_slots");
    if (chosen !== ordered[0]) inc(diag, "topk_nonrank1");
  }
  return chosen;
}

/** 源流 _lift_above（:801-806）。 */
export function liftAbove(pitches: readonly number[], bassMax: number): number[] {
  const ps = [...pitches].sort((a, b) => a - b);
  let shift = 0;
  while (ps.length && ps[0]! + shift <= bassMax) shift += 12;
  return ps.map((p) => p + shift);
}

const rhVoicing = (vd: HandFrameBar, bassMax: number): number[] => liftAbove(vd.rh, bassMax).slice(0, 4);

export type VoicingFn<B extends HandFrameBar> = (vd: B) => readonly number[];

function reseedMove<B extends HandFrameBar>(
  frame: HandFrame, vd: B, bassMax: number,
  o: { voicingFn?: VoicingFn<B> | null; holdAll?: boolean; holdNone?: boolean; clashGuard?: ClashGuard; clashS?: ReadonlySet<number>;
    clashDiag?: HandFrameDiag | null; grabPitches?: readonly number[] | null; extraScore?: number; spanOverride?: SpanMode | null } = {},
): Move {
  const { voicingFn = null, holdAll = false, holdNone = false, clashGuard = "off", clashS = new Set<number>(), clashDiag = null, extraScore = 0.0, spanOverride = null } = o;
  let grabPitches: number[] = o.grabPitches == null
    ? [...(voicingFn ? voicingFn(vd) : rhVoicing(vd, bassMax))].slice(0, 4)
    : [...o.grabPitches].slice(0, 4);
  let a: HandAssignment | null = bestAssignment(grabPitches, frame.hand);
  if (a == null) {
    grabPitches = grabPitches.slice(0, 3);
    a = bestAssignment(grabPitches, frame.hand);
  }
  if (a == null) throw new TypeError("handFrame.reseedMove: voicing unreachable even trimmed to 3 notes (source raises TypeError)");
  const assign = new Map(a.assign.map(([f, p]) => [f, p]));
  let holds: Set<number>;
  if (holdNone) holds = new Set();
  else if (holdAll) holds = new Set(assign.keys());
  else {
    const deg = vd.deg;
    const guidePcs = new Set([pyMod(deg["3"]!, 12), pyMod(deg["7"] ?? deg["5"]!, 12)]);
    let topFinger = -1;
    for (const [f, p] of assign) if (topFinger < 0 || p > assign.get(topFinger)!) topFinger = f;
    holds = new Set([topFinger]);
    for (const f of [...assign.keys()].sort((x, y) => assign.get(y)! - assign.get(x)!)) {
      if (f === topFinger) continue;
      if (guidePcs.has(pyMod(assign.get(f)!, 12))) holds.add(f);
    }
    if (holds.size >= assign.size) {
      let low = -1;
      for (const f of ascSet(holds)) if (low < 0 || assign.get(f)! < assign.get(low)!) low = f;
      holds.delete(low);
    }
  }
  const notes = sortedAssign(assign);
  if (clashGuard !== "off" && clashS.size > 0) {
    for (const [f, p] of notes) {
      const perDur: DurClass = holds.has(f) ? TILL_BOUNDARY : STAB;
      const [excl, pen] = clashCheck(p, clashS, perDur, clashGuard);
      if ((excl || pen) && clashDiag != null) inc(clashDiag, excl ? "clash_rejected" : "clash_penalized");
    }
  }
  return mkMove({
    kind: RESEED, notes, dur: TILL_BOUNDARY, newAnchorX: a.wristX, holds: ascSet(holds), spanMode: spanOverride || frame.spanMode,
    score: a.cost + extraScore, diag: ["RESEED", [...assign.values()].sort((x, y) => x - y), ascSet(holds)],
  });
}

function reseedCandidates<B extends HandFrameBar>(
  frame: HandFrame, vd: B, bassMax: number, voicingFn: VoicingFn<B> | null, holdAll: boolean, holdNone: boolean,
  clashGuard: ClashGuard, clashS: ReadonlySet<number>, clashDiag: HandFrameDiag | null,
  o: { regTarget: number; kReg: number; spanOverride: SpanMode | null; nOctaves: number },
): Move[] {
  const base = [...(voicingFn ? voicingFn(vd) : rhVoicing(vd, bassMax))].slice(0, 4);
  const out: Move[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < Math.max(1, o.nOctaves); i++) {
    const pitches = base.map((p) => p + 12 * i);
    const a = bestAssignment(pitches, frame.hand);
    if (a == null) continue;
    const key = a.assign.map(([, p]) => p).sort((x, y) => x - y).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const wReg = o.kReg * Math.abs(a.wristX - o.regTarget);
    out.push(reseedMove(frame, vd, bassMax, { voicingFn, holdAll, holdNone, clashGuard, clashS, clashDiag, grabPitches: pitches, extraScore: wReg, spanOverride: o.spanOverride }));
  }
  return out;
}

function seedFrame<B extends HandFrameBar>(vd: B, hand: Hand, bassMax: number, spanMode: SpanMode, voicingFn: VoicingFn<B> | null): HandFrame {
  const grabPitches = [...(voicingFn ? voicingFn(vd) : rhVoicing(vd, bassMax))].slice(0, 4);
  let a = bestAssignment(grabPitches, hand);
  if (a == null) a = bestAssignment(grabPitches.slice(0, 3), hand);
  if (a == null) throw new TypeError("handFrame.seedFrame: voicing unreachable (source raises TypeError)");
  return { hand, anchorX: a.wristX, assign: sortedAssign(new Map(a.assign.map(([f, p]) => [f, p]))), held: [], spanMode };
}

function strongPcs(vd: HandFrameBar): Set<number> {
  const out = new Set<number>();
  for (const k of ["R", "3", "5", "7"]) if (k in vd.deg) out.add(pyMod(vd.deg[k]!, 12));
  return out;
}

const DYAD_PRIOR_AMT = -0.4;

/** 音1つ＝[pitch, start, end, vel, hand, bar]（源流の 6 要素タプル・秒）。 */
export type HandFrameNote = [pitch: number, start: number, end: number, vel: number, hand: Hand, bar: number];
export type OrnMeta = { cls: "approach"; of: number; resolve?: number };
export type EmitFn = (pitches: readonly number[], velFn: (p: number) => number, t0: number, endFn: (p: number) => number, hand: Hand, bar: number) => readonly [number, number, number, unknown][] | null | undefined;

export interface HandFrameOptions<B extends HandFrameBar> {
  hand?: Hand;
  bassMax?: number;
  stepDur: number;
  barDur: number;
  grid?: number;
  emit?: EmitFn | null;
  spanMode?: SpanMode;
  tension?: boolean;
  colourAllowed?: readonly ReadonlySet<number>[] | null;
  approach?: boolean;
  wideMotion?: boolean;
  lambdaInertia?: number;
  floor?: number | null;
  ceilingPad?: number;
  voicingFn?: VoicingFn<B> | null;
  structureOnly?: boolean;
  holdAllReseed?: boolean;
  grabPolicy?: "downbeat" | "offbeat" | "rolling" | "sheet";
  dyadOn?: boolean;
  lambdaSkip?: number;
  landingBonus?: number;
  landingOffstrong?: number;
  lineMotion?: boolean;
  clashGuard?: ClashGuard;
  clashRegions?: readonly (readonly [number, number])[] | null;
  motifBias?: number;
  dyadBreak?: boolean;
  arc?: PhraseSpec | null;
  structureSlots?: readonly ReadonlySet<number>[] | null;
  /** 人が決めた打点（画面 B・2026-09-23）。区切りごとに「打点の位置→種類」。null の区切り＝従来どおり。
   *  Map のある区切り＝そこに無い位置は鳴らさない。各打点はまず従来どおり決め（乱数も従来どおり引く）、
   *  同じ種類ならそのまま・違えば指定の種類の候補から選び直す＝読み取った指定で弾き直すと完全一致する。 */
  forced?: readonly (ReadonlyMap<number, "grab" | "single"> | null)[] | null;
  accentTable?: ((slot: number, grid: number) => number) | null;
  grabDur?: DurClass;
  grabWScale?: number;
  approachResolve?: boolean;
  grabNoCluster?: boolean;
  secondDyadCap?: number | null;
}

export interface HandFrameResult {
  notes: HandFrameNote[];
  orn: [HandFrameNote, OrnMeta][];
  diag: HandFrameDiag;
}

/** 源流 _approach_targets（:1518-1527）。 */
function approachTargetsOf(nextVoicing: readonly number[]): Set<number> {
  const out = new Set<number>();
  for (const pp of nextVoicing) for (const d of [-2, -1, 1, 2]) out.add(Math.trunc(pp) + d);
  return out;
}

/** 源流 approach_target_map（:1530-1556）。{経過音: 解決先}（挿入順＝最初の解決先が勝つ）。 */
export function approachTargetMap(nextTones: readonly number[], curColourPcs: ReadonlySet<number>, heldPitches: Iterable<number>): Map<number, number> {
  const held = [...heldPitches];
  const m = new Map<number, number>();
  for (const c of nextTones) {
    for (const s of [-2, -1, 1, 2]) {
      const ap = Math.trunc(c) + s;
      const inKey = curColourPcs.has(pyMod(ap, 12));
      const halfLead = Math.abs(s) === 1;
      if (!(inKey || halfLead)) continue;
      if (held.some((h) => { const d = Math.abs(ap - Math.trunc(h)); return d === 1 || d === 13; })) continue;
      if (!m.has(ap)) m.set(ap, Math.trunc(c));
    }
  }
  return m;
}

const bisectRight = (xs: readonly number[], x: number): number => {
  let lo = 0, hi = xs.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (x < xs[mid]!) hi = mid; else lo = mid + 1; }
  return lo;
};

/**
 * 源流 generate_handframe（:930-1515）。戻り値＝{notes, orn, diag}（源流の (notes, orn, diag)）。
 * 既定のつまみ＝源流の M1 構成。seed は 0 以上 2^32 未満の整数だけ受ける。
 */
export function generateHandFrame<B extends HandFrameBar>(
  toks: readonly string[], vds: readonly B[], container: { onsets: readonly number[] }, seed: number, opts: HandFrameOptions<B>,
): HandFrameResult {
  const {
    hand = "R", bassMax = 0, stepDur, barDur, grid = 16, spanMode = "comfort", tension = false, colourAllowed = null,
    approach = false, wideMotion = false, lambdaInertia = 0.3, floor = null, ceilingPad = 12, voicingFn = null,
    structureOnly = false, holdAllReseed = false, grabPolicy = "downbeat", dyadOn = false, lambdaSkip = 0.0,
    landingBonus = 0.0, landingOffstrong = 0.0, lineMotion = false, clashGuard = "off", clashRegions = null,
    motifBias = 0.0, dyadBreak = false, arc = null, structureSlots = null, accentTable = null, grabDur = TILL_NEXT,
    grabWScale = 1.0, approachResolve = false, grabNoCluster = false, secondDyadCap = null, forced = null,
  } = opts;
  if (!Number.isInteger(seed) || seed < 0 || seed >= 2 ** 32) throw new RangeError(`generateHandFrame: seed must be an integer in [0, 2^32) (got ${seed})`);
  if (clashGuard !== "off" && clashGuard !== "held" && clashGuard !== "region") throw new Error(`clash_guard must be one of off/held/region, got ${String(clashGuard)}`);
  if (clashGuard === "region" && !(clashRegions && clashRegions.length)) throw new Error("clash_guard='region' requires clash_regions (a list of (start,end) time windows) -- no implicit default (§3.3)");
  const clashRegionsSorted = clashRegions ? [...clashRegions].sort((a, b) => a[0] - b[0] || a[1] - b[1]) : [];
  const rng = new PyRandom(seed);
  const skipRng = new PyRandom((seed ^ 0x00c0ffee) >>> 0);
  const onsetsU = ascSet(container.onsets);
  const onsets = onsetsU.length ? onsetsU : [0];
  const nBars = vds.length;
  const isM1 = !(tension || wideMotion || floor != null || approach || dyadOn || lambdaSkip > 0 || landingBonus !== 0
    || grabPolicy !== "downbeat" || lineMotion || clashGuard !== "off" || motifBias > 0 || dyadBreak || arc != null);
  const registerActive = arc != null && arc.kReg > 0;
  const beatEvery = Math.max(1, floorDiv(grid, 4));
  const notes: HandFrameNote[] = [];
  const orn: [HandFrameNote, OrnMeta][] = [];
  const diag: HandFrameDiag = { events: [], fires: [], crosses: 0, slot_log: [] };
  const events = diag.events as unknown[];
  const fires = diag.fires as [number, number, number, number, string][];
  const slotLog = diag.slot_log as unknown[];
  const motifPeriod = motifBias > 0 ? detectMotifPeriod(toks) : 0;
  const skeleton = new Map<number, Map<number, [string, number]>>();
  const writeSkeleton = (b: number, slot: number, v: [string, number]): void => {
    if (!skeleton.has(b)) skeleton.set(b, new Map());
    skeleton.get(b)!.set(slot, v);
  };
  let clashRidx = 0;
  let clashBuf = new Set<number>();
  const grabTimes: number[] = [];
  if (grabDur === TILL_GRAB && grabPolicy === "sheet" && structureSlots && structureSlots.length) {
    for (let b = 0; b < nBars; b++) {
      const ss = b < structureSlots.length ? structureSlots[b]! : new Set<number>();
      for (const s of onsets) if (ss.has(s)) grabTimes.push(b * barDur + s * stepDur);
    }
    grabTimes.sort((a, b) => a - b);
  }

  const emit: EmitFn = opts.emit ?? ((pitches, velFn, t0, endFn, h, bar) => {
    const out: [number, number, number, unknown][] = [];
    for (const p of [...pitches].sort((a, b) => a - b)) {
      const e = endFn(p);
      const v = Math.trunc(velFn(p));
      notes.push([Math.trunc(p), t0, Math.max(t0 + 0.03, e), v, h, bar]);
      out.push([Math.trunc(p), t0, v, {}]);
    }
    return out;
  });

  const voicingOf = (vd: B): readonly number[] => (voicingFn ? voicingFn(vd) : rhVoicing(vd, bassMax));

  let frame = seedFrame(vds[0]!, hand, bassMax, spanMode, voicingFn);
  const active = new Map<number, [number, number]>();
  const soundingNotes: [number, number][] = [];
  let prevFinger: number | null = null;
  let prevPitch: number | null = null;
  let prevDir = 0;
  let chainLen = 0;
  let repRun = 0;
  let sfRun = 0;
  let prevDyad: Set<number> | null = null;
  let dyadRun = 0;
  let secondDyadCount = 0;
  let posRef = frame.anchorX;
  let prevWasBreak = true;
  let inversionViolations = 0;

  const isBoundary = (b: number): boolean => b === 0 || toks[b] !== toks[b - 1];
  const nextBoundaryTime = (b: number): number => {
    let nb = b + 1;
    while (nb < nBars && !isBoundary(nb)) nb += 1;
    return nb * barDur;
  };
  const ofr = (f: number): number => orientedFrest(f, hand);

  for (let b = 0; b < nBars; b++) {
    const vd = vds[b]!;
    const bar0 = b * barDur;
    const boundaryT = nextBoundaryTime(b);
    secondDyadCount = 0;
    const vpitch = voicingOf(vd);
    let barCeiling: number | null = wideMotion && vpitch.length ? Math.max(...vpitch) + ceilingPad : null;
    let hBar: number | null = null;
    let lambdaSkipB = lambdaSkip;
    let motifBiasB = motifBias;
    let regTarget: number | null = null;
    let spanB: SpanMode | null = null;
    if (arc != null) {
      const eBar = phraseEnergy(b, 0, grid, arc);
      hBar = arcHeight(eBar, arc);
      lambdaSkipB = lambdaSkip * (1.0 + arc.kLambdaSkip * (1.0 - eBar));
      if (motifBias > 0) motifBiasB = motifBias * (1.0 - arc.kMotif * hBar);
      if (registerActive) {
        const baseV = [...voicingOf(vd)].slice(0, 4);
        const baseA = bestAssignment(baseV, hand) ?? bestAssignment(baseV.slice(0, 3), hand);
        if (baseA != null) regTarget = baseA.wristX + arc.regRange * hBar;
        spanB = hBar >= arc.spanStretchThresh ? "stretch" : "comfort";
      }
    }
    const forcedB = forced && b < forced.length ? forced[b] ?? null : null;
    const slotsB = forcedB ? ascSet([...onsets, ...forcedB.keys()]) : onsets;
    for (let si = 0; si < slotsB.length; si++) {
      const slot = slotsB[si]!;
      const want: "grab" | "single" | "none" | null = forcedB ? forcedB.get(slot) ?? "none" : null;
      if (structureOnly && (forcedB ? want === "none" : slot !== 0)) continue;
      const t = bar0 + slot * stepDur;
      const nextSlotT = si + 1 < slotsB.length ? bar0 + slotsB[si + 1]! * stepDur : boundaryT;
      for (const [f, [, e]] of [...active]) if (e <= t + 1e-6) active.delete(f);
      {
        const amap = assignMap(frame);
        for (const [f, [p]] of active) amap.set(f, p);
        frame = { hand: frame.hand, anchorX: frame.anchorX, assign: sortedAssign(amap), held: ascSet(active.keys()), spanMode: frame.spanMode };
      }

      let clashS: ReadonlySet<number> = new Set();
      if (clashGuard !== "off") {
        const s = new Set<number>([...active.values()].map(([p]) => p));
        if (clashGuard === "region") {
          let inRegion: boolean;
          [clashRidx, clashBuf, inRegion] = clashAdvance(clashRegionsSorted, clashRidx, clashBuf, t);
          if (inRegion) for (const p of clashBuf) s.add(p);
        }
        clashS = s;
      }

      const prevFrame = frame;
      const slotsToBoundary = slotsB.length - si;
      let reseedWrist: number | null = null;
      if (slotsToBoundary <= 3 && b + 1 < nBars) {
        const nv = voicingOf(vds[b + 1]!);
        const na = bestAssignment(nv.slice(0, 4), hand);
        if (na != null) reseedWrist = na.wristX;
      }

      const aSlot = (accentTable ?? metricAccentNorm)(slot, grid);
      const isBeat = pyMod(slot, beatEvery) === 0;
      let slotIsLanding = false;
      let role: string;
      let ss: ReadonlySet<number> = new Set();
      if (grabPolicy === "sheet") {
        ss = structureSlots && structureSlots.length && b < structureSlots.length ? structureSlots[b]! : new Set();
        role = ss.has(slot) ? "structure" : "colour";
      } else {
        role = (grabPolicy === "offbeat" || grabPolicy === "rolling") && isBeat && slot !== 0 ? "structure" : "colour";
      }

      let motifTag: string | null = null;
      let motifDir = 0;
      if (motifBias > 0 && b >= motifPeriod) {
        const entry = skeleton.get(b % motifPeriod)?.get(slot);
        if (entry != null) [motifTag, motifDir] = entry;
      }

      const sheetGrab0 = grabPolicy === "sheet" && slot === 0 && ss.has(slot) && !isBoundary(b);
      let move: Move | null;
      let candMoves: Move[] | null = null;
      let approachTargets: Set<number> | Map<number, number> | null = null;
      if ((slot === 0 || (structureOnly && forcedB != null)) && !sheetGrab0) {
        const sheetSilent = grabPolicy === "sheet" && !isBoundary(b);
        if (grabPolicy === "offbeat" || grabPolicy === "rolling" || sheetSilent) {
          const gp = [...voicingOf(vd)].slice(0, 4);
          const a = bestAssignment(gp, hand) ?? bestAssignment(gp.slice(0, 3), hand);
          if (a == null) throw new TypeError("handFrame: silent reseed voicing unreachable (source raises TypeError)");
          const newAnchor = a.wristX;
          const amap2 = new Map<number, number>();
          for (let f = 1; f <= 5; f++) amap2.set(f, Math.trunc(pyRound(newAnchor + ofr(f))));
          frame = { hand, anchorX: newAnchor, assign: sortedAssign(amap2), held: [], spanMode: frame.spanMode };
          prevDir = 0; chainLen = 0; repRun = 0; sfRun = 0; posRef = newAnchor;
          prevDyad = null; dyadRun = 0;
          prevWasBreak = true;
          events.push(["RESEED_SILENT", "", b, slot, []]);
          slotLog.push([b, slot, aSlot, "silentRESEED", false, false]);
          appendTo(diag, "skeleton_log", [b, slot, "silentRESEED", 0]);
          if (motifBias > 0 && b < motifPeriod) writeSkeleton(b, slot, ["silentRESEED", 0]);
          if (want == null || want === "none") continue;
          // 人がこの打点を指定した＝掴み直した手でそのまま押さえる
          move = reseedMove(frame, vd, bassMax, { voicingFn, holdAll: holdAllReseed, clashGuard, clashS, clashDiag: diag });
        } else if (registerActive && regTarget != null) {
          const cands = reseedCandidates(frame, vd, bassMax, voicingFn, holdAllReseed, wideMotion && !holdAllReseed, clashGuard, clashS, diag,
            { regTarget, kReg: arc!.kReg, spanOverride: spanB, nOctaves: arc!.regOctaves });
          move = cands.length ? sampleTopk(cands, rng, 3, diag) : null;
          if (move == null) {
            move = reseedMove(frame, vd, bassMax, { voicingFn, holdAll: holdAllReseed, holdNone: wideMotion && !holdAllReseed, clashGuard, clashS, clashDiag: diag, spanOverride: spanB });
          }
          if (wideMotion && move.kind === RESEED && move.notes.length) barCeiling = Math.max(...move.notes.map(([, p]) => p)) + ceilingPad;
        } else {
          move = reseedMove(frame, vd, bassMax, { voicingFn, holdAll: holdAllReseed, holdNone: wideMotion && !holdAllReseed, clashGuard, clashS, clashDiag: diag });
        }
      } else {
        if (lambdaSkip > 0 && role === "colour") {
          let pSkip = lambdaSkipB * (1.0 - aSlot);
          if (motifBias > 0 && motifTag != null) {
            if (motifTag === "SKIP") pSkip = Math.min(1.0, pSkip * (1 + MOTIF_GAMMA * motifBiasB));
            else pSkip = Math.max(0.0, pSkip * (1 - MOTIF_GAMMA * motifBiasB));
          }
          if (skipRng.random() < pSkip && (want == null || want === "none")) {
            events.push([SKIP, "", b, slot, []]);
            slotLog.push([b, slot, aSlot, "SKIP", false, false]);
            appendTo(diag, "skeleton_log", [b, slot, "SKIP", 0]);
            if (motifBias > 0 && b < motifPeriod) writeSkeleton(b, slot, ["SKIP", 0]);
            repRun = 0; sfRun = 0;
            prevWasBreak = true;
            continue;
          }
        }
        if (approach && b + 1 < nBars && si === slotsB.length - 1) {
          const nvp = voicingOf(vds[b + 1]!);
          if (approachResolve) {
            const curCol = tension && colourAllowed && colourAllowed.length ? colourAllowed[b]! : vd.allowed;
            const heldNow = new Set(soundingNotes.filter(([, e]) => e > t + 1e-6).map(([p]) => p));
            approachTargets = approachTargetMap(nvp, curCol, heldNow);
          } else {
            approachTargets = approachTargetsOf(nvp);
          }
        }
        const isLanding = si === slotsB.length - 1 || (si + 1 < slotsB.length && pyMod(slotsB[si + 1]!, beatEvery) === 0);
        slotIsLanding = isLanding;
        let dyadPrior = dyadOn && (prevWasBreak || isLanding || aSlot >= 0.7) ? DYAD_PRIOR_AMT : 0.0;
        let gw: number | null = null;
        if (role === "structure") {
          gw = grabPolicy === "rolling" ? 0.5 + 0.5 * aSlot : aSlot;
          gw *= grabWScale;
        }
        if (arc != null && hBar) {
          if (dyadPrior !== 0.0) dyadPrior *= 1.0 + arc.kDyad * hBar;
          if (gw != null) gw *= 1.0 + arc.kGrabw * hBar;
        }
        const strong = strongPcs(vds[b]!);
        const m2: M2Ctx | null = isM1 ? null : {
          allowed: tension && colourAllowed && colourAllowed.length ? colourAllowed[b]! : null,
          floor, ceiling: barCeiling, wideMotion, lambdaInertia, prevDir, chainLen, dyadOn, dyadPrior,
          landingBonus, landingOffstrong, isLanding, strongPcs: strong, grabW: gw, lineMotion, repRun, sfRun,
          clashGuard, clashS, diag, motifBias: motifBiasB, motifTag, motifDir, dyadBreak, prevDyad, dyadRun,
          grabDur, grabNoCluster, secondDyadCap, secondDyadCount,
        };
        const moves = enumerateMoves(frame, vd, role, { bassMax, prevFinger, prevPitch, reseedWrist, slotsToBoundary, approachTargets, diag, m2 });
        candMoves = moves;
        move = sampleTopk(moves, rng, 3, diag);
        if (move == null && (want == null || want === "none")) {
          prevWasBreak = true;
          continue;
        }
      }

      // 人が決めた打点（forced）との突き合わせ。同じ種類ならそのまま（＝往復一致）。
      if (want != null && !structureOnly) {
        if (want === "none") {
          events.push([SKIP, "", b, slot, []]);
          slotLog.push([b, slot, aSlot, "SKIP", false, false]);
          repRun = 0; sfRun = 0;
          prevWasBreak = true;
          continue;
        }
        const kindOf = (m: Move): "grab" | "single" => (m.notes.length >= 2 ? "grab" : "single");
        if (move == null || kindOf(move) !== want) {
          const alt = candMoves ? candMoves.filter((m) => kindOf(m) === want) : [];
          let pick = alt.length ? sampleTopk(alt, rng, 3, diag) : null;
          if (pick == null && want === "grab") {
            pick = reseedMove(frame, vd, bassMax, { voicingFn, holdAll: holdAllReseed, clashGuard, clashS, clashDiag: diag });
          }
          if (pick == null && want === "single") {
            const src = move ?? reseedMove(frame, vd, bassMax, { voicingFn, holdAll: holdAllReseed, clashGuard, clashS, clashDiag: diag });
            const top = [...src.notes].sort((x, y) => y[1] - x[1])[0]!;
            pick = mkMove({ ...src, notes: [top], holds: src.holds.filter((f) => f === top[0]) });
          }
          move = pick!;
        }
      }
      if (move == null) { prevWasBreak = true; continue; }

      if (move.kind === SHIFT || move.kind === LEAP) {
        inc(diag, "shifts_emitted");
        if (move.diag.length >= 5 && move.diag[4] === "drought") inc(diag, "forced_transitions");
      }
      if (move.kind === THUMB_UNDER || move.kind === FINGER_OVER) diag.crosses = (diag.crosses as number) + 1;

      const transition = move.kind === SHIFT || move.kind === LEAP || move.kind === RESEED || move.kind === THUMB_UNDER || move.kind === FINGER_OVER || move.kind === GRAB;
      if (!transition) {
        const pamap = [...assignMap(prevFrame)];
        for (const [f, p] of move.notes) {
          const win = freeFingerReach(pamap, prevFrame.held, f, prevFrame.hand, prevFrame.spanMode);
          if (!win.includes(p)) inversionViolations += 1;
        }
      }

      const struck = move.notes.map(([f, p]) => [f, p] as [number, number]);
      const pitches = struck.map(([, p]) => p);
      const mv = move;
      const velFn = (p: number): number => {
        const base = slot === 0 ? 54 : 47;
        const hit = mv.notes.find(([, pp]) => pp === p);
        const f = hit ? hit[0] : 3;
        const v = base - Math.trunc(pyRound((WEAK.get(f) ?? 0.0) * 12));
        return Math.trunc(Math.max(24, Math.min(120, v)));
      };
      let nxtGrabT: number | null = null;
      if (grabTimes.length) {
        const i = bisectRight(grabTimes, t + 1e-6);
        nxtGrabT = i < grabTimes.length ? grabTimes[i]! : boundaryT;
      }
      const endFn = (p: number): number => {
        let per = mv.dur;
        if (mv.kind === RESEED) {
          const hit = mv.notes.find(([, pp]) => pp === p);
          if (!hit) throw new Error("handFrame.endFn: pitch not in RESEED notes (source raises StopIteration)");
          per = mv.holds.includes(hit[0]) ? TILL_BOUNDARY : STAB;
        }
        return durEnd(per, t, nextSlotT, boundaryT, stepDur, nxtGrabT);
      };

      const realized = emit(pitches, velFn, t, endFn, hand, b) || [];
      const actT = new Map<number, number>();
      for (const [p, rt] of realized) actT.set(Math.trunc(p), rt);
      for (const [, p] of struck) {
        if (mv.orn.has(p)) {
          const st = actT.get(Math.trunc(p)) ?? t;
          const meta: OrnMeta = { cls: "approach", of: pyRoundDigits(boundaryT, 5) };
          if (approachTargets instanceof Map) meta.resolve = approachTargets.get(Math.trunc(p));
          orn.push([[Math.trunc(p), st, endFn(p), Math.trunc(velFn(p)), hand, b], meta]);
        }
      }

      if (clashGuard === "region") {
        let inRegion: boolean;
        [clashRidx, clashBuf, inRegion] = clashAdvance(clashRegionsSorted, clashRidx, clashBuf, t);
        if (inRegion) for (const [, p] of struck) if (!mv.orn.has(p)) clashBuf.add(p);
      }

      if ((mv.kind === FIRE || mv.kind === THUMB_UNDER || mv.kind === FINGER_OVER) && struck.length === 1) {
        const [lf, lp] = struck[0]!;
        fires.push([b, slot, pyRoundDigits(t, 6), Math.trunc(lp), mv.kind]);
        repRun = prevPitch != null && lp === prevPitch ? repRun + 1 : 0;
        const sfDiffkey = prevFinger != null && lf === prevFinger && prevPitch != null && lp !== prevPitch;
        sfRun = sfDiffkey ? sfRun + 1 : 0;
        if (sfDiffkey) inc(diag, "same_finger_diffkey_count");
        let mdir = 0;
        if (prevPitch != null && lp !== prevPitch) {
          mdir = lp > prevPitch ? 1 : -1;
          chainLen = mdir === prevDir ? chainLen + 1 : 1;
          prevDir = mdir;
        }
        const mtag = mv.kind === THUMB_UNDER || mv.kind === FINGER_OVER ? "cross" : "FIRE";
        if (motifBias > 0 && b < motifPeriod) writeSkeleton(b, slot, [mtag, mdir]);
        appendTo(diag, "skeleton_log", [b, slot, mtag, mdir]);
      } else {
        repRun = 0; sfRun = 0;
        if (mv.kind === RESEED) {
          prevDir = 0; chainLen = 0;
          prevDyad = null; dyadRun = 0;
          posRef = mv.newAnchorX != null ? mv.newAnchorX : frame.anchorX;
        }
        const d0 = mv.diag.length ? mv.diag[0] : null;
        const grabTag = d0 === "DYAD" || d0 === "GRABp" ? d0 : null;
        if (grabTag) {
          if (motifBias > 0 && b < motifPeriod) writeSkeleton(b, slot, [grabTag, 0]);
          appendTo(diag, "skeleton_log", [b, slot, grabTag, 0]);
        }
        if (grabTag === "DYAD") {
          const newSet = new Set(pitches);
          dyadRun = prevDyad != null && setEq(newSet, prevDyad) ? dyadRun + 1 : 0;
          prevDyad = newSet;
          appendTo(diag, "dyad_pitchsets", [b, slot, [...pitches].sort((x, y) => x - y)]);
          if (pitches.length === 2 && isSecond(pitches[0]!, pitches[1]!)) secondDyadCount += 1;
        }
      }

      frame = applyMove(frame, mv);
      for (const f of mv.released) active.delete(f);
      for (const [f, p] of struck) {
        const e = endFn(p);
        soundingNotes.push([p, e]);
        if (mv.kind === RESEED) {
          if (mv.holds.includes(f)) active.set(f, [p, e]);
          else active.delete(f);
        } else if (mv.dur === TILL_NEXT || mv.dur === TILL_BOUNDARY) {
          active.set(f, [p, e]);
        } else {
          active.delete(f);
        }
        prevFinger = f;
        prevPitch = p;
      }

      if (wideMotion) {
        let newAnchor = frame.anchorX;
        if ((mv.kind === FIRE || mv.kind === THUMB_UNDER || mv.kind === FINGER_OVER) && struck.length === 1) {
          const [f0, p0] = struck[0]!;
          newAnchor = p0 - ofr(f0);
          if (mv.kind === FIRE && prevDir !== 0 && Math.abs(newAnchor - posRef) >= HALF_POS && (newAnchor > posRef ? 1 : -1) === prevDir) {
            diag.crosses = (diag.crosses as number) + 1;
            const k = prevDir > 0 ? THUMB_UNDER : FINGER_OVER;
            appendTo(diag, "cross_log", [b, slot, k, chainLen]);
            posRef = newAnchor;
          } else if (prevDir === 0) {
            posRef = newAnchor;
          }
        }
        const amap2 = new Map<number, number>();
        for (let f = 1; f <= 5; f++) amap2.set(f, active.has(f) ? active.get(f)![0] : Math.trunc(pyRound(newAnchor + ofr(f))));
        frame = { hand: frame.hand, anchorX: newAnchor, assign: sortedAssign(amap2), held: frame.held, spanMode: frame.spanMode };
      }

      const tag = mv.diag.length ? mv.diag[0] : mv.kind;
      slotLog.push([b, slot, aSlot, tag, prevWasBreak, slotIsLanding]);
      prevWasBreak = false;
      events.push([mv.kind, mv.dur, b, slot, [...pitches].sort((x, y) => x - y)]);
    }
  }

  diag.inversion_violations = inversionViolations;
  diag.n_notes = notes.length;
  finalizeDiag(diag, nBars);
  return { notes, orn, diag };
}

// ---------------------------------------------------------------------------
// 源流 _finalize_diag（:1559-1700）＝表示専用の集計（生成には戻らない）
// ---------------------------------------------------------------------------
function counter(xs: readonly (number | string)[]): Record<string, number> {
  const m = new Map<number | string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  const keys = [...m.keys()].sort((a, b) => pyCompare(a, b));
  const out: Record<string, number> = {};
  for (const k of keys) out[String(k)] = m.get(k)!;
  return out;
}
const getNum = (d: HandFrameDiag, k: string): number => (d[k] as number | undefined) ?? 0;

function finalizeDiag(diag: HandFrameDiag, nBars: number): void {
  const slots = getNum(diag, "slots");
  diag.binding_prune_ratio = slots ? pyRoundDigits(getNum(diag, "pruned_slots") / slots, 4) : 0.0;
  diag.forced_transitions = getNum(diag, "forced_transitions");
  diag.forced_transitions_per_8bar = nBars ? pyRoundDigits((getNum(diag, "forced_transitions") * 8.0) / nBars, 3) : 0.0;
  diag.degenerate_slots = getNum(diag, "degenerate_slots");
  const tk = getNum(diag, "topk_slots");
  diag.topk_effective_ratio = tk ? pyRoundDigits(getNum(diag, "topk_nonrank1") / tk, 4) : 0.0;

  const fires = (diag.fires as [number, number, number, number, string][]) ?? [];
  const pitches = fires.map((x) => x[3]);
  const runs: number[] = [];
  const spanOfRun: number[] = [];
  if (pitches.length >= 2) {
    let curDir = 0;
    let run = 1;
    let runLo = pitches[0]!;
    let runHi = pitches[0]!;
    for (let i = 1; i < pitches.length; i++) {
      const step = pitches[i]! - pitches[i - 1]!;
      const d = step === 0 ? 0 : step > 0 ? 1 : -1;
      if (d !== 0 && d === curDir) run += 1;
      else {
        runs.push(run);
        spanOfRun.push(runHi - runLo);
        run = 1;
        runLo = runHi = pitches[i - 1]!;
        curDir = d !== 0 ? d : curDir;
      }
      runLo = Math.min(runLo, pitches[i]!);
      runHi = Math.max(runHi, pitches[i]!);
    }
    runs.push(run);
    spanOfRun.push(runHi - runLo);
  }
  diag.chain_len_hist = counter(runs);
  diag.chain_len_mean = runs.length ? pyRoundDigits(runs.reduce((a, b) => a + b, 0) / runs.length, 2) : 0.0;
  diag.max_monotonic_sweep_st = spanOfRun.length ? Math.max(...spanOfRun) : 0;
  const byBar = new Map<number, number[]>();
  for (const [b, , , p] of fires) { if (!byBar.has(b)) byBar.set(b, []); byBar.get(b)!.push(p); }
  const barRanges = [...byBar.values()].filter((v) => v.length >= 2).map((v) => Math.max(...v) - Math.min(...v));
  diag.bar_range_mean_st = barRanges.length ? pyRoundDigits(barRanges.reduce((a, b) => a + b, 0) / barRanges.length, 2) : 0.0;
  diag.bar_range_max_st = barRanges.length ? Math.max(...barRanges) : 0;
  diag.bars_over_octave = barRanges.filter((r) => r > 12).length;
  const revSlots: number[] = [];
  if (fires.length >= 3) {
    for (let i = 1; i < fires.length - 1; i++) {
      const a = fires[i]![3] - fires[i - 1]![3];
      const c = fires[i + 1]![3] - fires[i]![3];
      if (a !== 0 && c !== 0 && (a > 0) !== (c > 0)) revSlots.push(fires[i]![1]);
    }
  }
  diag.reversal_slot_hist = counter(revSlots);
  diag.n_reversals = revSlots.length;

  const log = (diag.slot_log as [number, number, number, string, boolean, boolean][]) ?? [];
  const emitted = log.filter((e) => e[3] !== "SKIP" && e[3] !== "silentRESEED");
  const nEmit = emitted.length;
  const dyads = emitted.filter((e) => e[3] === "DYAD");
  diag.dyad_rate = nEmit ? pyRoundDigits(dyads.length / nEmit, 3) : 0.0;
  const pos = (e: [number, number, number, string, boolean, boolean]): string => {
    const [, , a, , chainStart, isLanding] = e;
    if (chainStart) return "chain_start";
    if (a >= 0.7) return "beathead";
    if (isLanding) return "landing";
    return "other";
  };
  diag.dyad_pos_hist = counter(dyads.map(pos));
  diag.grabp_count = emitted.filter((e) => e[3] === "GRABp").length;
  const dps = ((diag.dyad_pitchsets as [number, number, number[]][]) ?? []).map((x) => x[2]);
  const nSucc = Math.max(0, dps.length - 1);
  let nSame = 0;
  for (let i = 0; i + 1 < dps.length; i++) if (setEq(new Set(dps[i]), new Set(dps[i + 1]))) nSame++;
  diag.dyad_repeat_rate = nSucc ? pyRoundDigits(nSame / nSucc, 4) : 0.0;
  diag.dyad_repeat_same = nSame;
  diag.dyad_repeat_succ_pairs = nSucc;
  diag.dyad_repeat_penalized = getNum(diag, "dyad_repeat_penalized");
  const skips = log.filter((e) => e[3] === "SKIP");
  const nColourSlots = log.filter((e) => ["FIRE", "DYAD", "SKIP", "THUMB_UNDER", "FINGER_OVER"].includes(e[3])).length;
  diag.skip_rate = nColourSlots ? pyRoundDigits(skips.length / nColourSlots, 3) : 0.0;
  diag.skip_slot_hist = counter(skips.map((e) => e[1]));
  const iois: number[] = [];
  for (let i = 1; i < fires.length; i++) {
    let d = pyMod(fires[i]![1] - fires[i - 1]![1], 16);
    if (fires[i]![0] !== fires[i - 1]![0]) d = pyMod(fires[i]![1] + 16 - fires[i - 1]![1], 16) || 2;
    iois.push(d > 0 ? d : 2);
  }
  diag.ioi_hist = counter(iois);
  diag.landing_strong_rate = (diag.landing_strong_rate as number | null | undefined) ?? null;
  diag.n_skips = skips.length;
  diag.n_silent_reseed = log.filter((e) => e[3] === "silentRESEED").length;
  diag.clash_rejected = getNum(diag, "clash_rejected");
  diag.clash_penalized = getNum(diag, "clash_penalized");
  if (pitches.length >= 2) {
    let nRep = 0;
    for (let i = 1; i < pitches.length; i++) if (pitches[i] === pitches[i - 1]) nRep++;
    diag.repeat_rate = pyRoundDigits(nRep / (pitches.length - 1), 4);
  } else diag.repeat_rate = 0.0;
  if (pitches.length >= 2) {
    const deltas: number[] = [];
    for (let i = 1; i < pitches.length; i++) deltas.push(Math.abs(pitches[i]! - pitches[i - 1]!));
    diag.stepwise_rate = pyRoundDigits(deltas.filter((d) => d <= 2).length / deltas.length, 4);
    diag.interval_hist = counter(deltas);
  } else {
    diag.stepwise_rate = 0.0;
    diag.interval_hist = {};
  }
  diag.same_finger_diffkey_count = getNum(diag, "same_finger_diffkey_count");
  diag.shifts_emitted = getNum(diag, "shifts_emitted");
}
