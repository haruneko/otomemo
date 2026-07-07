// #S12 ドラム抽出の interpretation 層（純関数）。Python(perception)が出す生オンセット
// (drum_onsets = [t_sec, "kick"|"snare"|"hihat", strength]) と実ビート時刻から、
//  ① 拍子/ダウンビート位相を推定（キック=小節頭・スネア=バックビート）
//  ② オンセット→拍位置→16分量子化→多数決で1小節ループへ折り畳み → rhythm content
// を導く。音モデル（分離器/ADT）を差し替えても facts 契約の内側で完結＝この層のテストは不変。
// 「自動が最善・ダメなら人」＝低信頼は呼び出し側が手動フォールバックに落とす（design #S12）。

export type DrumKind = "kick" | "snare" | "hihat";
/** 生ドラムオンセット＝[時刻(秒), 種別, 強さ]。facts.drum_onsets の1要素。 */
export type DrumOnset = readonly [t: number, kind: string, strength: number];

export interface MeterEstimate {
  meter: number; // 1小節の拍数（3/4/6）
  offset: number; // ダウンビート位相＝どのビートindexが小節頭か（0..meter-1）
  confidence: number; // 0..1。テンプレ一致率。低いほど手動へ落とすべき
}

const KIND_MIDI: Record<DrumKind, { name: string; midi: number }> = {
  kick: { name: "Kick", midi: 36 },
  snare: { name: "Snare", midi: 38 },
  hihat: { name: "HiHat", midi: 42 },
};
// 拍子ごとのバックビート位置（小節頭=0を除く「スネアが乗りやすい拍」）。
const BACKBEAT: Record<number, number[]> = { 3: [1, 2], 4: [1, 3], 6: [3] };
// 4/4 が圧倒的多数＝近差は普通拍子へ寄せる緩い事前分布（2拍子/8拍子は候補に入れない＝backbeatの2周期曖昧を回避）。
const METER_PRIOR: Record<number, number> = { 3: 0.98, 4: 1.0, 6: 0.9 };

const normKind = (k: string): DrumKind | null =>
  k === "kick" || k === "snare" || k === "hihat" ? k : null;

/** 時刻 t の「実数ビート位置」（ビート間を線形補間・端は最外側間隔で外挿）。beatTimes は昇順。 */
export function beatPositionOf(beatTimes: number[], t: number): number {
  const n = beatTimes.length;
  if (n === 0) return 0;
  if (n === 1) return 0;
  if (t <= beatTimes[0]!) {
    const dt = beatTimes[1]! - beatTimes[0]! || 1;
    return (t - beatTimes[0]!) / dt;
  }
  if (t >= beatTimes[n - 1]!) {
    const dt = beatTimes[n - 1]! - beatTimes[n - 2]! || 1;
    return n - 1 + (t - beatTimes[n - 1]!) / dt;
  }
  // 二分探索でビート区間を特定
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (beatTimes[mid]! <= t) lo = mid;
    else hi = mid;
  }
  const span = beatTimes[hi]! - beatTimes[lo]! || 1;
  return lo + (t - beatTimes[lo]!) / span;
}

/**
 * 拍子とダウンビート位相を推定。キックが小節頭(0)・スネアがバックビートに乗る度合いを
 * (meter, phase) の総当たりで採点し、最良を返す。confidence=キック/スネア質量のうち
 * テンプレ位置に乗った割合（×meter事前分布）。オンセットが乏しければ confidence≈0。
 */
export function estimateMeterDownbeat(
  beatTimes: number[],
  onsets: DrumOnset[],
  candidates: number[] = [4, 3, 6],
): MeterEstimate {
  // 各オンセットを最寄ビートindexへ＋種別/強さ。
  const pts = onsets
    .map(([t, k, s]) => ({ beat: Math.round(beatPositionOf(beatTimes, t)), kind: normKind(k), w: s > 0 ? s : 1 }))
    .filter((p): p is { beat: number; kind: DrumKind; w: number } => p.kind !== null);
  const ks = pts.filter((p) => p.kind === "kick" || p.kind === "snare");
  const ksMass = ks.reduce((a, p) => a + p.w, 0);
  if (ksMass <= 0 || beatTimes.length < 4) return { meter: 4, offset: 0, confidence: 0 };

  let best = { meter: 4, offset: 0, hit: 0 };
  let bestRaw = -1;
  for (const m of candidates) {
    const backset = new Set(BACKBEAT[m] ?? []);
    for (let p = 0; p < m; p++) {
      let hit = 0; // テンプレに乗った質量（キック@頭 ＋ スネア@バックビート）
      let miss = 0; // 逆位置（キック@バックビート・スネア@頭）＝位相の反証
      for (const { beat, kind, w } of pts) {
        const wb = (((beat - p) % m) + m) % m;
        if (kind === "kick") {
          if (wb === 0) hit += w;
          else if (backset.has(wb)) miss += w * 0.5;
        } else if (kind === "snare") {
          if (backset.has(wb)) hit += w;
          else if (wb === 0) miss += w * 0.5;
        }
      }
      const raw = (hit - miss) * (METER_PRIOR[m] ?? 1);
      if (raw > bestRaw) {
        bestRaw = raw;
        best = { meter: m, offset: p, hit };
      }
    }
  }
  // confidence＝テンプレ一致率 × 証拠量の飽和（少数オンセットでの過信を防ぐ＝~2小節分でsaturate）。
  const evidence = Math.min(1, ks.length / 8);
  const confidence = Math.max(0, Math.min(1, (best.hit / ksMass) * evidence));
  return { meter: best.meter, offset: best.offset, confidence };
}

export interface RhythmContentLite {
  steps: number;
  lanes: { name: string; midi: number; hits: number[] }[];
}

/**
 * オンセット→拍位置→16分step量子化→小節をまたいで多数決で1小節ループへ折り畳み。
 * 各 lane×step は「オンセットのある小節のうち出現率 >= majority」なら採用（フィル/雑音を落とす）。
 * steps = meter*4（4/4→16・3/4→12・6→24）。
 */
export function drumOnsetsToRhythm(
  onsets: DrumOnset[],
  beatTimes: number[],
  offset: number,
  meter: number,
  majority = 0.5,
): RhythmContentLite {
  const stepsPerBar = meter * 4;
  // kind → (bar集合, step→出現小節集合)
  const laneOrder: DrumKind[] = ["kick", "snare", "hihat"];
  const counts: Record<DrumKind, Map<number, Set<number>>> = { kick: new Map(), snare: new Map(), hihat: new Map() };
  const barsWithOnset = new Set<number>();
  let maxBar = -1;
  for (const [t, k, s] of onsets) {
    const kind = normKind(k);
    if (!kind || s < 0) continue;
    const rel = beatPositionOf(beatTimes, t) - offset;
    if (rel < -0.5) continue; // 最初のダウンビートより前は捨てる
    const bar = Math.floor((rel + 1e-6) / meter);
    if (bar < 0) continue;
    const withinBeat = rel - bar * meter;
    const step = ((Math.round(withinBeat * 4) % stepsPerBar) + stepsPerBar) % stepsPerBar;
    if (!counts[kind].has(step)) counts[kind].set(step, new Set());
    counts[kind].get(step)!.add(bar);
    barsWithOnset.add(bar);
    maxBar = Math.max(maxBar, bar);
  }
  const barCount = maxBar + 1;
  const lanes: RhythmContentLite["lanes"] = [];
  if (barCount <= 0) return { steps: stepsPerBar, lanes };
  for (const kind of laneOrder) {
    const hits: number[] = [];
    for (const [step, bars] of counts[kind]) {
      if (bars.size / barCount >= majority) hits.push(step);
    }
    if (hits.length) lanes.push({ ...KIND_MIDI[kind], hits: hits.sort((a, b) => a - b) });
  }
  return { steps: stepsPerBar, lanes };
}

/** 検出 meter(拍数) → ネタの meter 文字列。3→3/4・4→4/4・6→6/8。 */
export function meterString(meter: number): string {
  return meter === 6 ? "6/8" : `${meter}/4`;
}
