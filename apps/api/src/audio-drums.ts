// #S12 ドラム抽出の interpretation 層（純関数）。Python(perception)が出す生オンセット
// (drum_onsets = [t_sec, "kick"|"snare"|"hihat", strength]) と実ビート時刻から、
//  ① ドラムに揃えた剛体16分グリッド → ② 拍子=パターンの自己相似(何step周期で繰り返すか)＋
//     ダウンビート位相 → ③ 16分量子化→小節多数決で1小節ループへ折り畳み → rhythm content
// を導く。音モデル（分離器/ADT）を差し替えても facts 契約の内側で完結＝この層のテストは不変。
// 「自動が最善・ダメなら人」＝低信頼は呼び出し側が手動フォールバックに落とす（design #S12）。

export type DrumKind = "kick" | "snare" | "hihat";
/** 生ドラムオンセット＝[時刻(秒), 種別, 強さ]。facts.drum_onsets の1要素。 */
export type DrumOnset = readonly [t: number, kind: string, strength: number];

export interface MeterEstimate {
  meter: number; // 1小節の拍数（3/4/6）
  offset: number; // ダウンビート位相＝どのビートindexが小節頭か（0..meter-1）
  confidence: number; // 0..1。自己相似の強さ×証拠量。低いほど手動へ落とすべき（変拍子→低い）
}

const KIND_MIDI: Record<DrumKind, { name: string; midi: number }> = {
  kick: { name: "Kick", midi: 36 },
  snare: { name: "Snare", midi: 38 },
  hihat: { name: "HiHat", midi: 42 },
};
// 4/4 が圧倒的多数＝近差は普通拍子へ寄せる緩い事前分布（2拍子/8拍子は候補に入れない＝半分周期の曖昧を回避）。
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

export interface Grid {
  origin: number; // step0(=あるビート)の時刻(秒)
  beatPeriod: number; // 1拍の秒数（定テンポ）。16分=beatPeriod/4
}

/**
 * ドラムに揃えた**定テンポの剛体グリッド**を推定。librosa の拍は1拍ずつ検出で揺れる＝16分量子化に
 * 精度不足（onsetが隣stepへ滲む）。対策＝拍間隔の中央値で一定テンポにし、位相をキック/スネアが16分
 * 格子に最も乗る所へ合わせる（ドラム＝時計）。打ち込み/定テンポ曲で滲みを消す。
 */
export function estimateGrid(beatTimes: number[], onsets: DrumOnset[]): Grid {
  const n = beatTimes.length;
  if (n < 2) return { origin: beatTimes[0] ?? 0, beatPeriod: 0.5 };
  const diffs: number[] = [];
  for (let i = 1; i < n; i++) diffs.push(beatTimes[i]! - beatTimes[i - 1]!);
  diffs.sort((a, b) => a - b);
  const bp0 = diffs[Math.floor(diffs.length / 2)] || 0.5; // librosa 拍間隔の中央値＝テンポの当たり（位相は当てにしない）
  const ks = onsets
    .map(([t, k, s]) => ({ t, kind: normKind(k), w: s > 0 ? s : 1 }))
    .filter((p) => p.kind === "kick" || p.kind === "snare");
  if (!ks.length) return { origin: beatTimes[0]!, beatPeriod: bp0 };
  // コムフィルタ＝周期も位相もドラム(キック/スネア)から直接探索。librosa の拍は位相がドラムとズレる
  // （実測：キックが拍格子から中央値0.24拍ズレ）ので、拍間隔中央値は「テンポの範囲」の当たりにだけ使い、
  // その近傍(±13%)で16分格子にオンセットが最も乗る (周期,位相) を選ぶ。テンポ2倍/半分の別解を避ける。
  let best = { period: bp0, origin: beatTimes[0]!, score: -Infinity };
  const pLo = bp0 * 0.87, pHi = bp0 * 1.13, pStep = bp0 * 0.004;
  for (let period = pLo; period <= pHi; period += pStep) {
    const sixteenth = period / 4;
    const PH = 48;
    for (let j = 0; j < PH; j++) {
      const origin = (j / PH) * sixteenth; // 位相は16分1つ分を刻む（絶対原点は0基準でよい）
      let score = 0;
      for (const { t, w } of ks) {
        const q = (t - origin) / sixteenth;
        score += w * (1 - 2 * Math.abs(q - Math.round(q))); // 最寄16分に近いほど+
      }
      if (score > best.score) best = { period, origin, score };
    }
  }
  // 精緻化：粗gridの16分index k に対し t≈origin+k*(period/4) をインライアで重み付き最小二乗回帰。
  // 粗探索の刻み由来のドリフト（全曲で累積すると致命的）を消し、テンポ/位相を実データにピタリ合わせる。
  let origin = best.origin, period = best.period;
  for (let iter = 0; iter < 3; iter++) {
    const s16 = period / 4;
    const inl = ks
      .map(({ t, w }) => ({ k: Math.round((t - origin) / s16), t, w }))
      .filter((p) => Math.abs(p.t - (origin + p.k * s16)) / s16 < 0.25); // 16分の1/4以内＝格子に乗ってる点
    if (inl.length < 4) break;
    const W = inl.reduce((a, p) => a + p.w, 0);
    const mk = inl.reduce((a, p) => a + p.w * p.k, 0) / W;
    const mt = inl.reduce((a, p) => a + p.w * p.t, 0) / W;
    const cov = inl.reduce((a, p) => a + p.w * (p.k - mk) * (p.t - mt), 0);
    const varK = inl.reduce((a, p) => a + p.w * (p.k - mk) * (p.k - mk), 0);
    if (varK <= 1e-9) break;
    const b = cov / varK; // = sixteenth
    origin = mt - b * mk;
    period = b * 4;
  }
  // 16分位相の4通り曖昧を解消：キック/スネアが「拍(step%4==0)」に最も乗る位相へ寄せる
  // （拍だけに onset がある時にどの16分が拍かを一意化＝step番号を安定させる）。
  const s16 = period / 4;
  let bestShift = 0, bestMass = -1;
  for (let sh = 0; sh < 4; sh++) {
    let mass = 0;
    for (const { t, w } of ks) {
      const step = Math.round((t - (origin + sh * s16)) / s16);
      if ((((step % 4) + 4) % 4) === 0) mass += w;
    }
    if (mass > bestMass) { bestMass = mass; bestShift = sh; }
  }
  origin += bestShift * s16;
  return { origin, beatPeriod: period };
}

/** 剛体グリッド上の実数ビート位置（=(t-origin)/beatPeriod）。beatPositionOf の剛体版・滲み低減。 */
const rigidBeatPos = (grid: Grid, t: number): number => (t - grid.origin) / grid.beatPeriod;

/**
 * 拍子とダウンビートを、雑な統計テンプレでなく**構造**から出す（説明が効くヒューリスティック）：
 *  ① 全オンセットを16分stepへスナップし、レーン別(kick/snare/hihat)の活動ベクトルを作る。
 *  ② 拍子＝そのパターンが**何step周期で自己相似か**（bar長 L=m*4 でのレーン別自己相関が最大の m）。
 *     ＝「小節でパターンが繰り返す」度合いで決める＝キックが頭・スネアが2/4、等の仮定に依存しない。
 *  ③ ダウンビート＝小節に畳んでキックが最も小節頭に乗る拍位相（キック=頭 は位相決めだけの弱い前提）。
 * confidence＝自己相似の強さ × 証拠量。オンセットが乏しければ 0。
 */
export function estimateMeterDownbeat(
  grid: Grid,
  onsets: DrumOnset[],
  candidates: number[] = [4, 3, 6],
): MeterEstimate {
  const pts = onsets
    .map(([t, k, s]) => ({ step: Math.round(rigidBeatPos(grid, t) * 4), kind: normKind(k), w: s > 0 ? s : 1 }))
    .filter((p): p is { step: number; kind: DrumKind; w: number } => p.kind !== null && p.step >= 0);
  const ks = pts.filter((p) => p.kind === "kick" || p.kind === "snare");
  if (!ks.length) return { meter: 4, offset: 0, confidence: 0 };
  // ① レーン別の16分活動ベクトル（全曲）
  const maxStep = Math.max(...pts.map((p) => p.step));
  const lane: Record<DrumKind, number[]> = {
    kick: new Array(maxStep + 1).fill(0), snare: new Array(maxStep + 1).fill(0), hihat: new Array(maxStep + 1).fill(0),
  };
  for (const { step, kind, w } of pts) lane[kind][step] = (lane[kind][step] ?? 0) + w;
  // ② 自己相似：レーン別に i と i+L を掛け合わせた正規化相関＝「小節でパターンが繰り返す」度合い。
  //    活動量だけの相関だとキック/スネアの区別が消えるので、レーンごとに掛ける（種類も一致を要求）。
  const auto = (L: number): number => {
    if (L <= 0 || L >= maxStep + 1) return 0;
    let num = 0, e0 = 0, eL = 0;
    for (const v of [lane.kick, lane.snare, lane.hihat]) {
      for (let i = 0; i + L < v.length; i++) { num += v[i]! * v[i + L]!; e0 += v[i]! * v[i]!; eL += v[i + L]! * v[i + L]!; }
    }
    return num / (Math.sqrt(e0 * eL) + 1e-9);
  };
  let meter = 4, simBest = -Infinity, sim = 0;
  for (const m of candidates) {
    const a = auto(m * 4);
    const s = a * (METER_PRIOR[m] ?? 1);
    if (s > simBest) { simBest = s; meter = m; sim = a; }
  }
  // ③ ダウンビート＝キックが小節頭に最も乗る拍位相（拍単位）
  const kicks = pts.filter((p) => p.kind === "kick");
  let offset = 0, phBest = -1;
  for (let p = 0; p < meter; p++) {
    let m0 = 0;
    for (const kk of kicks) { const beat = Math.round(kk.step / 4); if (((((beat - p) % meter) + meter) % meter) === 0) m0 += kk.w; }
    if (m0 > phBest) { phBest = m0; offset = p; }
  }
  const evidence = Math.min(1, ks.length / 12);
  const confidence = Math.max(0, Math.min(1, Math.max(0, sim) * evidence));
  return { meter, offset, confidence };
}

export interface RhythmContentLite {
  steps: number;
  lanes: { name: string; midi: number; hits: number[] }[];
}

/**
 * オンセット→拍位置→16分step量子化→小節をまたいで多数決で1小節ループへ折り畳み。
 * 各 lane×step は「ドラムのある小節のうち出現率 >= majority」なら採用（フィル/雑音を落とす）。
 * 既定 0.35＝曲全体を畳むと各小節でパターンが変わり過半数に届きにくい＝「候補」を出す寄り
 * （仕上げは人間・design #S12）。steps = meter*4（4/4→16・3/4→12・6→24）。
 */
export function drumOnsetsToRhythm(
  grid: Grid,
  onsets: DrumOnset[],
  offset: number,
  meter: number,
  majority = 0.35,
): RhythmContentLite {
  const stepsPerBar = meter * 4;
  // kind → (bar集合, step→出現小節集合)
  const laneOrder: DrumKind[] = ["kick", "snare", "hihat"];
  const counts: Record<DrumKind, Map<number, Set<number>>> = { kick: new Map(), snare: new Map(), hihat: new Map() };
  const barsWithOnset = new Set<number>();
  for (const [t, k, s] of onsets) {
    const kind = normKind(k);
    if (!kind || s < 0) continue;
    const rel = rigidBeatPos(grid, t) - offset;
    if (rel < -0.5) continue; // 最初のダウンビートより前は捨てる
    const bar = Math.floor((rel + 1e-6) / meter);
    if (bar < 0) continue;
    const withinBeat = rel - bar * meter;
    const step = ((Math.round(withinBeat * 4) % stepsPerBar) + stepsPerBar) % stepsPerBar;
    if (!counts[kind].has(step)) counts[kind].set(step, new Set());
    counts[kind].get(step)!.add(bar);
    barsWithOnset.add(bar);
  }
  // 分母＝ドラムのある小節数（無音のイントロ/間奏で薄めない）。
  const barCount = barsWithOnset.size;
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
