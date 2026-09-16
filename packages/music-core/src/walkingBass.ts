// ウォーキングベース `JZ-WALK`（M3-3d）＝phrase_maker `bass_walking/v2/walking_v2.py`（候補生成）に
//   `bass_walking/v3/walking_v3.py` の**規則3本**を制約として課し、**乱数タイブレークを決定的規則へ置換**したもの。
// 正典＝docs/design.md §2106 追補 (k)／計画 docs/drafts/2026-09-09-phrasemaker-port-master-plan.md §5-2 M3・§6-2。
//
// 耳判定＝「使える」（2026-09-13）。以下は実装時の注記（計画 §4-1・§3-2 (k)）：v3 の3規則は **v2 への耳のフィードバック（「wild / forbidden-sounding」＝
//    `v3/LISTEN.md:3`）から出た言葉**だが、**v3 自体は耳で確認されていない**（ACCEPTANCE 無し・批評パネルが
//    アーキを否定して打ち切り＝`CONCEPT.md:90`）。だから **opt-in（style を名指しした時だけ立つ）**で、
//    ジャンル名からの型選抜には**入れない**。良し悪しは作曲で使って耳が決める。
//
// 世代の札（計画 §4-1）：v1＝(c) 捨てられた前世代（「這いすぎ」）／v2＝(a) 現行到達点（**乱数が候補選択そのもの**＝
//   `walking_v2.py:133` の `score=(in_scale, abs(d), rng.random())`）／v3＝(e) 打ち切られた後発枝
//   （逐次貪欲のアーキは持ち込まない・規則だけ拾う）。**負の知識**＝v1「順次だけでは歩かない」・
//   v2「跳躍の量を報酬にすると禁則跳躍へ最適化する」・v3「逐次貪欲では弧が出ない」。
//
// **データ一致は主張しない**（計画 §6-2）：v2 は乱数が sort キー本体なので、乱数を消した時点で列は源流と違う。
//   受けるのは W1〜W5＋禁則0（byConstruction＋被覆率）＋回復率（diagnostic）＋摂動テスト。
//
// **決定的**＝RNG・時刻・hash を使わない。乱数だった3か所の置換（計画 §6-2 の一次案）：
//   (1) `_pick_approach` のスコア末尾 `rng.random()` → **候補ピッチ `p` 自身**（`score=(in_scale, abs(d), p)`）。
//   (2) `place()` の `cands[rng.randrange(len(cands))]`（ref 無しの自由選択）→ **最低音**（窓の下から取る）。
//   (3) 弧の向き `(si + rng.randrange(2)) % 2` → **seed 由来の決定的規則**（seed の偶奇で全体の向きを決め、
//       区間ごとに交互＝源流の「区間ごとに弧の向きを変える」意図はそのまま）。**新しいソルトは足さない**
//       （M0契約 §4 のソルト表は凍結・walking は乱数を消したので不要）。

import { pmClamp, rootLowPitch, chordScalePcs, chordTonePcs, fifthSemitone, seventhSemitone, thirdSemitone, hasThird, type CfChord } from "./chordScale"; // 2026-09-16 撤去した anchorLock/chordFollow から JZ-WALK の使う分だけ移した

/** v3 の規則3本（`walking_v3.py:68-71,86-104`）。**摂動テストのために値を外から振れる**（§6-4 #9）。 */
export interface WalkRules {
  /** 禁則の跳躍幅（半音）＝トライトーン6・長7度11（`walking_v3.py:69 FORBIDDEN`）。12 超も常に禁則。 */
  readonly forbidden: readonly number[];
  /** 短7度（10）は最後の手段でだけ許す（`:70 M7`） */
  readonly suppressM7: boolean;
  /** これ以上の跳躍のあとは回復規則が働く（`:71 LEAP4`＝4度=5半音） */
  readonly leapTrigger: number;
  /** 回復＝次は順次（この幅以下）（`:101` の `ad > 2`） */
  readonly recoverStep: number;
  /** 回復＝逆方向ならこの幅まで許す（`:101` の `ad <= 4`） */
  readonly contraryMax: number;
}

export const WALK_RULES_V3: WalkRules = { forbidden: [6, 11], suppressM7: true, leapTrigger: 5, recoverStep: 2, contraryMax: 4 };

export interface WalkWindow {
  readonly lo: number;
  readonly hi: number;
  /** 演奏可能かの述語（3e の指板検証を注入できる。既定＝窓の内側なら可） */
  readonly playable?: (pitch: number) => boolean;
}

/** コード区間＝そのコードで歩くスロット数（源流 `build_beats` の (Chord, beats)）。 */
export interface WalkSegment {
  readonly chord: CfChord;
  readonly slots: number;
}

export interface WalkReport {
  /** W1＝各区間の頭がルート */
  readonly w1: { ok: number; total: number };
  /** W2＝チェンジ直前が次ルートの ±2 以内 */
  readonly w2: { ok: number; total: number };
  /** W3＝同音の連打が無い（v1 の「順次で滑らか」は v2 が意図的に捨てた＝負の知識。残るのは連打禁止） */
  readonly w3NoRepeat: { ok: number; total: number };
  /** W4＝そのコードのスケール内、または次のコードトーンへ ±2 で解決 */
  readonly w4: { ok: number; total: number };
  /** W5＝演奏可能・音域内 */
  readonly w5: { ok: number; total: number };
  /** 禁則音程の数（**0 が要件**・byConstruction）と、判定した遷移の総数（＝被覆の分母） */
  readonly forbidden: { hits: number; transitions: number };
  /** 回復率（diagnostic）＝跳躍のあと順次/逆行で戻った割合 */
  readonly recovery: { ok: number; total: number };
  /** 制約の被覆率＝**規則が実際に候補を削った選択の数／選択の総数**（空虚さの自己診断・§6-4 #3） */
  readonly constrained: { applied: number; total: number };
  /** 緩和ラダーを何回降りたか（0=規則どおり／1=短7度許可／2=回復規則を外す／3=最後の手段） */
  readonly relaxed: readonly number[];
  /** 平均音程（diagnostic＝「歩いている」かの目安。**ゲートにしない**＝形の要求は耳） */
  readonly avgInterval: number;
}

const norm12 = (x: number): number => ((Math.trunc(x) % 12) + 12) % 12;

/** 源流 `walking_v2.pitches_of_pc`＝その pc の鳴らせるピッチを窓の中から全部（昇順）。 */
export function pitchesOfPc(pc: number, w: WalkWindow): number[] {
  const out: number[] = [];
  for (let p = w.lo; p <= w.hi; p++) if (norm12(p) === norm12(pc) && (w.playable ? w.playable(p) : true)) out.push(p);
  return out;
}

/** 源流 `walking_v3._interval_ok`（`:86-104`）＝v3 の legality（禁則・連打禁止・跳躍後の回復・同方向連続跳躍の禁止）。 */
export function intervalOk(prevPitch: number | null, prevIv: number | null, cand: number, rules: WalkRules, allowM7 = false): boolean {
  if (prevPitch === null) return true;
  const d = cand - prevPitch;
  const ad = Math.abs(d);
  if (ad === 0) return false;                                   // 連打禁止
  if (rules.forbidden.includes(ad) || ad > 12) return false;    // トライトーン/長7度/オクターブ超
  if (ad === 10 && rules.suppressM7 && !allowM7) return false;  // 短7度は最後の手段
  if (prevIv !== null && Math.abs(prevIv) >= rules.leapTrigger) {
    const sameDir = (d > 0) === (prevIv > 0);
    if (ad > rules.recoverStep && !(!sameDir && ad <= rules.contraryMax)) return false;
  }
  return true;
}

/** 源流 `walking_v2.guide_and_colour_offsets`（`:97-116`）＝弧に使うコードトーンの順（3度・7度＝ガイドトーンが先）。 */
export function guideAndColourOffsets(ch: CfChord): number[] {
  const offs: number[] = [];
  const third = hasThird(ch) ? thirdSemitone(ch) : null;
  const seventh = seventhSemitone(ch);
  const fifth = fifthSemitone(ch);
  if (third !== null) offs.push(third);
  if (seventh !== null) offs.push(seventh);
  if (!offs.includes(fifth)) offs.push(fifth);
  const seen = new Set(offs.map((o) => norm12(o)));
  for (const t of [...ch.tones].map((x) => norm12(x)).sort((a, b) => a - b)) {
    if (!seen.has(t) && t !== 0) { offs.push(t); seen.add(t); }
  }
  if (offs.length === 0) offs.push(fifth);
  return offs;
}

interface PickState { prevPitch: number | null; prevIv: number | null }

/** 候補から選ぶ＝**決定的**（ref に最も近い→同点は低い方）。源流 `place(ref=...)` の `min(key=(abs(p-ref), p))` と同じ。 */
const nearest = (cands: readonly number[], ref: number): number => {
  let best = cands[0]!;
  for (const p of cands) {
    const dp = Math.abs(p - ref), db = Math.abs(best - ref);
    if (dp < db || (dp === db && p < best)) best = p;
  }
  return best;
};

/**
 * pc の集合から**規則に適う**ピッチを1つ選ぶ。緩和ラダー（源流 `walking_v3._choose:131-144`）＝
 * ①規則どおり → ②短7度を許す → ③回復規則を外す → ④最後の手段（隣接音へ順次で逃げる）。
 * 戻り値の `relaxed` が何段降りたか、`filtered` が規則で候補が削られたか（被覆率の分子）。
 */
function choose(
  pcs: readonly number[], st: PickState, ref: number, w: WalkWindow, rules: WalkRules, avoid?: number,
  scale?: ReadonlySet<number>,
): { pitch: number; relaxed: number; filtered: boolean } {
  const all: number[] = [];
  for (const pc of pcs) for (const p of pitchesOfPc(pc, w)) if (p !== avoid) all.push(p);
  const pool = all.length > 0 ? [...new Set(all)].sort((a, b) => a - b) : pitchesOfPc(pcs[0] ?? 0, w);
  const ladder: [number, (p: number) => boolean][] = [
    [0, (p) => intervalOk(st.prevPitch, st.prevIv, p, rules, false)],
    [1, (p) => intervalOk(st.prevPitch, st.prevIv, p, rules, true)],
    [2, (p) => intervalOk(st.prevPitch, null, p, rules, true)],
  ];
  for (const [relaxed, ok] of ladder) {
    const legal = pool.filter(ok);
    if (legal.length > 0) return { pitch: nearest(legal, ref), relaxed, filtered: legal.length < pool.length };
  }
  // ④最後の手段＝pc をあきらめ、隣へ順次で逃げる（**禁則は出さない**）。それも無ければ窓の最低音。
  //   源流との意図的な差（1点）：源流のコメントは "stepping to the nearest **in-scale** pitch" と書いているが、
  //   実装（`walking_v3._choose:144-152`）はスケールで絞っていない＝W4（非整合音 0）が最後の手段で破れる。
  //   源流は窓が広い（28..52＝25半音）ので滅多に踏まないが、otomemo の窓は [33,48]＝16半音で頻繁に踏む。
  //   **コメントが書いている意図の方を実装する**＝スケール内を先に探し、無ければ従来どおり隣へ逃げる。
  if (st.prevPitch !== null) {
    const steps: number[] = [];
    for (const d of [-1, 1, -2, 2, -3, 3, -4, 4]) {
      const p = st.prevPitch + d;
      if (p < w.lo || p > w.hi) continue;
      if (w.playable && !w.playable(p)) continue;
      if (intervalOk(st.prevPitch, st.prevIv, p, rules, true)) steps.push(p);
    }
    const inScale = scale ? steps.filter((p) => scale.has(norm12(p))) : [];
    if (inScale.length > 0) return { pitch: nearest(inScale, ref), relaxed: 3, filtered: true };
    if (steps.length > 0) return { pitch: nearest(steps, ref), relaxed: 3, filtered: true };
  }
  return { pitch: pool[0] ?? pmClamp(w.lo, w.lo, w.hi), relaxed: 3, filtered: false };
}

/**
 * 源流 `walking_v2._pick_approach`（`:119-135`）＝次ルートの ±2（W2）。
 * **スコア末尾の `rng.random()` を候補ピッチ `p` に置換**（計画 §6-2 の一次案 `score=(in_scale, abs(d), p)`）。
 * v3 の legality も通す（通らなければ回復規則だけ外す＝W2 の方が硬い不変条件＝`walking_v3._pick_approach:227-229`）。
 */
export function pickApproach(
  ch: CfChord, targetRootPitch: number, st: PickState, w: WalkWindow, rules: WalkRules,
): { pitch: number; filtered: boolean } {
  const scale = chordScalePcs(ch);
  const scan = (iv: number | null): number | null => {
    const scored: [number, number, number][] = [];
    for (const d of [-1, 1, -2, 2]) {
      const p = targetRootPitch + d;
      if (p < w.lo || p > w.hi) continue;
      if (w.playable && !w.playable(p)) continue;
      if (p === st.prevPitch) continue;
      if (!intervalOk(st.prevPitch, iv, p, rules, true)) continue;
      scored.push([scale.has(norm12(p)) ? 0 : 1, Math.abs(d), p]);
    }
    if (scored.length === 0) return null;
    scored.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]));
    return scored[0]![2];
  };
  const strict = scan(st.prevIv);
  if (strict !== null) return { pitch: strict, filtered: true };
  const relaxed = scan(null);
  if (relaxed !== null) return { pitch: relaxed, filtered: true };
  // 最後の手段＝W2 だけは守る（±2 で次ルートへ）。
  for (const d of [-1, 1, -2, 2]) {
    const p = targetRootPitch + d;
    if (p >= w.lo && p <= w.hi && (!w.playable || w.playable(p)) && p !== st.prevPitch) return { pitch: p, filtered: false };
  }
  return { pitch: pmClamp(targetRootPitch, w.lo, w.hi), filtered: false };
}

/**
 * `JZ-WALK` の本体＝**v2 の弧（アウトライン）を v3 の規則の中で組む**。
 * 各区間：W1 頭＝ルート（直前の音の最寄り）→ 中はガイドトーン（3度・7度）を通す跳躍の弧 →
 * チェンジ直前は次ルートへの ±2 の接近（W2）。**乱数は一切使わない**（上の(1)(2)(3)）。
 */
export function buildWalkingLine(
  segments: readonly WalkSegment[], w: WalkWindow, seed: number, rules: WalkRules = WALK_RULES_V3,
): { pitches: number[]; report: WalkReport } {
  const pitches: number[] = [];
  const slotSeg: number[] = [];                       // slot index → segment index
  for (let si = 0; si < segments.length; si++) for (let k = 0; k < segments[si]!.slots; k++) slotSeg.push(si);
  // 「次のコード」＝根音/クオリティ/分数低音のどれかが違う時だけ（源流 `build_beats:100-105`）。
  const nextOf = (si: number): CfChord | null => {
    const a = segments[si]!.chord, b = segments[si + 1]?.chord;
    if (!b) return null;
    return (b.rootPc === a.rootPc && b.quality === a.quality && (b.bassPc ?? null) === (a.bassPc ?? null)) ? null : b;
  };
  // (3) 弧の向き＝seed 由来の決定的規則（源流は `rng.randrange(2)`）。区間ごとに交互＝源流の意図はそのまま。
  const dirBit = Math.abs(Math.trunc(seed)) % 2;

  const centre0 = pmClamp(Math.round((w.lo + w.hi) / 2), w.lo, w.hi); // 源流 CENTER（最初のルートの寄せ先）
  let prevRef = centre0;
  const st: PickState = { prevPitch: null, prevIv: null };
  const relaxedLog: number[] = [];
  let constrainedApplied = 0, constrainedTotal = 0;
  const w1 = { ok: 0, total: 0 }, w2 = { ok: 0, total: 0 };

  const put = (pitch: number): void => {
    const d = st.prevPitch === null ? null : pitch - st.prevPitch;
    pitches.push(pitch);
    st.prevPitch = pitch;
    st.prevIv = d;
  };

  let slot = 0;
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si]!;
    const L = seg.slots;
    if (L <= 0) continue;
    const ch = seg.chord;
    const nxt = nextOf(si);

    // W1＝区間の頭はルート（直前の音の最寄り＝境目は締めて、跳躍は小節の中で起こす）。
    const scale = chordScalePcs(ch);
    const head = choose([ch.rootPc], st, prevRef, w, rules, undefined, scale);
    constrainedTotal++; if (head.filtered) constrainedApplied++;
    relaxedLog.push(head.relaxed);
    put(head.pitch);
    w1.total++; if (norm12(head.pitch) === norm12(ch.rootPc)) w1.ok++;
    const rootPitch = head.pitch;
    slot++;
    if (L === 1) { prevRef = rootPitch; continue; }

    const preChange = nxt !== null;
    const nMid = preChange ? L - 2 : L - 1;
    const ascending = ((si + dirBit) % 2 === 0);

    // 中＝ガイドトーンを通す弧（源流 `_fill_arch:138-161`）。レジスタのランプで跳躍を作る。
    const offs = guideAndColourOffsets(ch);
    const chosen = nMid <= offs.length ? offs.slice(0, nMid) : [...offs, ...offs].slice(0, nMid);
    for (let k = 0; k < nMid; k++) {
      const off = chosen[k]!;
      const pc = norm12(ch.rootPc + off);
      const frac = (k + 1) / (nMid + 1);
      let centre = ascending
        ? Math.trunc(rootPitch + 6 + frac * (w.hi - (rootPitch + 6)))
        : Math.trunc(w.hi - frac * (w.hi - (rootPitch + 4)));
      centre = Math.max(w.lo, Math.min(w.hi, centre));
      const pick = choose([pc], st, centre, w, rules, st.prevPitch ?? undefined, scale);
      constrainedTotal++; if (pick.filtered) constrainedApplied++;
      relaxedLog.push(pick.relaxed);
      put(pick.pitch);
      slot++;
    }

    if (preChange) {
      // 次ルートは「この区間のルートの最寄り」に置く（源流：小節の境目は締める）。これは**目標**で、鳴らさない。
      const targetRoot = nearest(pitchesOfPc(nxt!.rootPc, w).length > 0 ? pitchesOfPc(nxt!.rootPc, w) : [pmClamp(rootLowPitch(nxt!.rootPc, w.lo), w.lo, w.hi)], rootPitch);
      const ap = pickApproach(ch, targetRoot, st, w, rules);
      constrainedTotal++; if (ap.filtered) constrainedApplied++;
      put(ap.pitch);
      slot++;
      w2.total++; if (Math.abs(ap.pitch - targetRoot) <= 2) w2.ok++;
      prevRef = ap.pitch;
    } else {
      prevRef = st.prevPitch!;
    }
  }

  return { pitches, report: analyzeWalk(pitches, slotSeg, segments, w, rules, { w1, w2, constrainedApplied, constrainedTotal, relaxedLog }) };
}

/** 生成側が返す report を組む（W3/W4/W5・禁則・回復率・平均音程）。 */
function analyzeWalk(
  pitches: readonly number[], slotSeg: readonly number[], segments: readonly WalkSegment[], w: WalkWindow, rules: WalkRules,
  acc: { w1: { ok: number; total: number }; w2: { ok: number; total: number }; constrainedApplied: number; constrainedTotal: number; relaxedLog: number[] },
): WalkReport {
  const w3 = { ok: 0, total: 0 }, w4 = { ok: 0, total: 0 }, w5 = { ok: 0, total: 0 };
  const recovery = { ok: 0, total: 0 };
  let forbiddenHits = 0, transitions = 0, sumIv = 0;
  for (let i = 0; i < pitches.length; i++) {
    const p = pitches[i]!;
    const ch = segments[slotSeg[i]!]!.chord;
    const nxt = i + 1 < pitches.length ? pitches[i + 1]! : null;
    const nxtCh = i + 1 < pitches.length ? segments[slotSeg[i + 1]!]!.chord : null;
    w5.total++;
    if (p >= w.lo && p <= w.hi && (!w.playable || w.playable(p))) w5.ok++;
    w4.total++;
    if (chordScalePcs(ch).has(norm12(p))) w4.ok++;
    else if (nxt !== null && nxtCh && Math.abs(p - nxt) <= 2 && chordTonePcs(nxtCh).has(norm12(nxt))) w4.ok++;
    if (nxt === null) continue;
    const d = nxt - p, ad = Math.abs(d);
    transitions++; sumIv += ad;
    w3.total++; if (ad !== 0) w3.ok++;
    if (rules.forbidden.includes(ad) || ad > 12) forbiddenHits++;
    if (ad >= rules.leapTrigger && i + 2 < pitches.length) {
      const d2 = pitches[i + 2]! - nxt, ad2 = Math.abs(d2);
      recovery.total++;
      const sameDir = (d2 > 0) === (d > 0);
      if (ad2 <= rules.recoverStep || (!sameDir && ad2 <= rules.contraryMax)) recovery.ok++;
    }
  }
  return {
    w1: acc.w1, w2: acc.w2, w3NoRepeat: w3, w4, w5,
    forbidden: { hits: forbiddenHits, transitions },
    recovery,
    constrained: { applied: acc.constrainedApplied, total: acc.constrainedTotal },
    relaxed: acc.relaxedLog,
    avgInterval: transitions > 0 ? Math.round((sumIv / transitions) * 1e4) / 1e4 : 0,
  };
}

/** 6/8（複合拍子）の歩くスロット＝16分格子の (0,2,6,8)＝付点四分2つ＋各への8分のピックアップ
 *  （源流 `experiments/core/parts.py:388 _COMPOUND_SLOT_STEPS`＝G7 で複合拍子にも歩けるようにした所）。 */
export const WALK_COMPOUND_SLOT_STEPS: readonly number[] = [0, 2, 6, 8];

/** style ID（**ジャンル名からの型選抜には入れない**＝名指しした時だけ立つ opt-in）。 */
export const JZ_WALK_ID = "JZ-WALK";
