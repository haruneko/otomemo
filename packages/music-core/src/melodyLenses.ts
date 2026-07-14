// メロ候補の「並べ替えレンズ」3種（WP-M3・design #12-M「候補レンズ」）。
// 思想（絶対）：レンズは審判でない＝候補を弾かず・総合点で1本に潰さず、選んだ軸で並べ替えるだけ。
// 全レンズ純TS・記号（半音move＋拍位置）のみ＝音源不要。headline score は全て「高い＝良い（上位）」に揃える。
// 正典＝docs/research/2026-07-14-{expectation-theory-melody,earworm-hook-features,singability-tessitura}.md。
// 初期重みは全て仮（研究doc §重み初期値）＝耳較正で更新。レンズは弱い補助（記憶性≠好み・説明力低）＝決め手にしない。

/** レンズが読む最小の音符（絶対ピッチ MIDI・start/dur=拍）。@cm/music-core Note の部分集合。 */
export interface LensNote {
  pitch: number;
  start: number;
  dur: number;
  syllable?: string;
}

/** レンズの文脈（frame から供給。全て任意＝無ければ既定で計算）。 */
export interface LensContext {
  key?: number; // 主音 pc(0-11)。終止安定判定の補助（現状レンズは輪郭主体で未必須）
  beatsPerBar?: number; // 1小節の拍数（既定4）
  sectionRole?: string; // "verse"|"chorus"|... 位置ゲート G1
}

/** 声種プロファイル（歌唱難度レンズ用・MIDI番号）。既定＝女性ポップ平均（研究 §6-2）。voice_profile 本体宣言は WP-M4。 */
export interface VoiceProfile {
  low: number; // 実用最低音
  tessLow: number; // 快適 tessitura 下端
  tessHigh: number; // 快適 tessitura 上端
  chestTop: number; // 地声上端（実用上限）
  falsettoTop: number; // 裏声/ミックス上端（単発可）
  passaggioLow: number; // パッサッジョ帯 下端
  passaggioHigh: number; // パッサッジョ帯 上端
}

// 女性ポップ平均（研究 §6-2）：最低G3=55 / tess A3=57..D5=74 / 地声上端D5=74 / 裏声上端E5=76 / passaggio Bb4=70..F5=77。
export const FEMALE_POP_AVG: VoiceProfile = { low: 55, tessLow: 57, tessHigh: 74, chestTop: 74, falsettoTop: 76, passaggioLow: 70, passaggioHigh: 77 };
// 男性ポップ平均（研究 §6-2）：最低D3=50 / tess D3=50..A4=69 / 地声上端A4=69 / 裏声上端D5=74 / passaggio E4=64..B4=71。
export const MALE_POP_AVG: VoiceProfile = { low: 50, tessLow: 50, tessHigh: 69, chestTop: 69, falsettoTop: 74, passaggioLow: 64, passaggioHigh: 71 };

/** 各候補の headline レンズスコア（api が item.meta.lenses に載せる・全て高い=良い）。 */
export interface MelodyLenses {
  expectation: number;
  hook: number;
  singability: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function prep(notes: LensNote[]): LensNote[] {
  return [...notes].filter((n) => Number.isFinite(n.pitch)).sort((a, b) => a.start - b.start);
}

// 隣接音程（半音）の列。
function intervals(ns: LensNote[]): number[] {
  const iv: number[] = [];
  for (let i = 1; i < ns.length; i++) iv.push(ns[i]!.pitch - ns[i - 1]!.pitch);
  return iv;
}

// ── 句割り（内部導出）：休符(≥1拍)で切る＋1句が2小節を超えたら強制的に切る（呼吸の上限）。 ──
function derivePhrases(ns: LensNote[], beatsPerBar: number): [number, number][] {
  const ranges: [number, number][] = [];
  if (ns.length === 0) return ranges;
  let start = 0;
  for (let i = 1; i < ns.length; i++) {
    const prevEnd = ns[i - 1]!.start + ns[i - 1]!.dur;
    const gap = ns[i]!.start - prevEnd;
    const spanBeats = ns[i]!.start - ns[start]!.start;
    if (gap >= 1 - 1e-6 || spanBeats >= 2 * beatsPerBar - 1e-6) {
      ranges.push([start, i]);
      start = i;
    }
  }
  ranges.push([start, ns.length]);
  return ranges;
}

// ── IC（情報量＝意外さ）サロゲート：近接(Schellenberg proximity)＋跳躍後の反転(Narmour gap-fill)。 ──
// 純ヒューリスティック（コーパス非依存）＝0..1。大きい音程ほど高IC・跳躍後の充填(逆向きstep)は低IC・非充填は高IC。
export function intervalIC(iv: number, prevIv: number | null): number {
  const prox = Math.min(1, Math.abs(iv) / 12); // proximity：unison=0 .. octave+=1
  let rev = 0;
  if (prevIv !== null && Math.abs(prevIv) >= 5) {
    const filled = Math.sign(iv) === -Math.sign(prevIv) && Math.abs(iv) <= 2; // 逆向きstep＝gap-fill充足
    rev = filled ? -0.15 : 0.3; // 充足=IC下げ（納得）・非充足=IC上げ（裏切り）
  }
  return clamp01(0.55 * prox + 0.15 + rev);
}

// 句頭は「文脈の切れ目＝境界」で高IC固定（Hansen/Pearce：境界＝高IC/高H）。
const HEAD_IC = 0.8;

// 句内位置 p∈[0,1] → 目標IC（鋸歯：句頭高→句中低→句末直前こぶ→句末底）。研究 §5(a)。
export function targetIC(p: number): number {
  if (p <= 0.5) return lerp(0.9, 0.2, p / 0.5); // 句頭0.9 → 句中0.2
  if (p <= 0.8) return lerp(0.2, 0.5, (p - 0.5) / 0.3); // こぶ
  return lerp(0.5, 0.05, (p - 0.8) / 0.2); // 終止0.05
}

/** ① 期待理論レンズ：句内ICカーブへの適合度（高い＝カーブに沿う＝意外さ配分が自然）。 */
export function expectationLens(notes: LensNote[], ctx: LensContext = {}): { score: number; ic: number[]; phraseFits: number[] } {
  const ns = prep(notes);
  const bpb = ctx.beatsPerBar ?? 4;
  if (ns.length < 2) return { score: 0, ic: [], phraseFits: [] };
  const phrases = derivePhrases(ns, bpb);
  const icAll: number[] = new Array(ns.length).fill(0);
  const phraseFits: number[] = [];
  let wSum = 0;
  let fSum = 0;
  for (const [s, e] of phrases) {
    const n = e - s;
    if (n < 2) {
      // 単音句は評価不能＝スキップ（重み0）。ic は近接のみ埋める。
      if (n === 1) icAll[s] = HEAD_IC;
      continue;
    }
    let prevIv: number | null = null;
    let err = 0;
    for (let j = 0; j < n; j++) {
      const idx = s + j;
      let ic: number;
      if (j === 0) {
        ic = HEAD_IC; // 句頭＝境界
      } else {
        const iv = ns[idx]!.pitch - ns[idx - 1]!.pitch;
        ic = intervalIC(iv, prevIv);
        prevIv = iv;
      }
      icAll[idx] = ic;
      const p = j / (n - 1);
      err += Math.abs(ic - targetIC(p));
    }
    const fit = clamp01(1 - err / n);
    phraseFits.push(round3(fit));
    fSum += fit * n;
    wSum += n;
  }
  const score = wSum ? clamp01(fSum / wSum) : 0;
  return { score: round3(score), ic: icAll.map(round3), phraseFits };
}

/** ② フック度レンズ：圧縮軸(大域平凡)×際立ち軸(局所一点)×位置ゲート の積型近似（高い＝刺さりやすい）。 */
export function hookLens(
  notes: LensNote[],
  ctx: LensContext = {},
): { score: number; compression: number; distinctiveness: number; position: number; features: Record<string, number> } {
  const ns = prep(notes);
  const bpb = ctx.beatsPerBar ?? 4;
  if (ns.length < 2) return { score: 0, compression: 0, distinctiveness: 0, position: gate(ctx.sectionRole), features: {} };
  const iv = intervals(ns);
  const absIv = iv.map((x) => Math.abs(x));

  // F1 内部反復/圧縮性：音程トライグラムの重複率。反復多い＝ユニーク少＝高い。過剰反復は微減（天井）。
  const grams: string[] = [];
  for (let i = 0; i + 2 < iv.length; i++) grams.push(`${iv[i]},${iv[i + 1]},${iv[i + 2]}`);
  let f1 = grams.length ? 1 - new Set(grams).size / grams.length : 0;
  if (f1 > 0.85) f1 = 0.85 - (f1 - 0.85); // 過剰反復＝暗黙記憶を削る（研究 §2.1・天井）
  f1 = clamp01(f1);

  // F2 大域輪郭コンヴェンショナリティ（弧＝上行→下行の在り来たり形／研究 §1「きらきら星型」）。
  const mid = Math.floor(ns.length / 2);
  const firstDelta = ns[mid]!.pitch - ns[0]!.pitch;
  const lastDelta = ns[ns.length - 1]!.pitch - ns[mid]!.pitch;
  const f2 = clamp01(0.5 + (firstDelta - lastDelta) / 24); // 弧＝firstUp,lastDown → 高い

  // F3 局所勾配の希少度＝一点際立ち：最大跳躍が他から突出し「1個だけ」なら高い（散ると減点）。
  const top1 = absIv.length ? Math.max(...absIv) : 0;
  const rest = absIv.slice().sort((a, b) => b - a).slice(1);
  const restMean = rest.length ? rest.reduce((a, b) => a + b, 0) / rest.length : 0;
  const peak = clamp01((top1 - restMean) / 7);
  const bigLeaps = absIv.filter((x) => x >= 5).length;
  const extra = Math.max(0, bigLeaps - 1); // 跳躍が複数＝際立ちが散る
  const f3 = clamp01(peak / (1 + extra));

  // F4 音高近接/順次率（≤2半音の割合）。
  const f4 = iv.length ? absIv.filter((x) => x <= 2).length / iv.length : 0;

  // F5 音符密度（拍あたり音数・速い/多いほど弱く＋）。
  const span = Math.max(1e-6, ns[ns.length - 1]!.start + ns[ns.length - 1]!.dur - ns[0]!.start);
  const notesPerBeat = ns.length / span;
  const f5 = clamp01(notesPerBeat / 2);

  // F6 リズム規則性（onset が拍/半拍グリッドに乗る率）。
  const onGrid = ns.filter((n) => { const f = ((n.start % 1) + 1) % 1; return Math.min(f, 1 - f) < 0.1 || Math.abs(f - 0.5) < 0.1; }).length;
  const f6 = onGrid / ns.length;

  // F7 フレーズ短さ（句あたり音数が少ないほど＋・研究 §2.4）。
  const phrases = derivePhrases(ns, bpb);
  const meanLen = phrases.reduce((a, [s, e]) => a + (e - s), 0) / Math.max(1, phrases.length);
  const f7 = clamp01((10 - meanLen) / 8);

  // F8 低サプライザル（期待どおりさ＝1-平均IC）。
  const exp = expectationLens(ns, ctx);
  const meanIC = exp.ic.length ? exp.ic.reduce((a, b) => a + b, 0) / exp.ic.length : 0.5;
  const f8 = clamp01(1 - meanIC);

  // 圧縮軸＝在り来たり/歌いやすさ側の加重平均（研究 §5.2 初期重み）。
  const W: Record<string, number> = { f1: 0.25, f2: 0.15, f4: 0.12, f6: 0.08, f7: 0.05, f8: 0.07 };
  const vals: Record<string, number> = { f1, f2, f4, f6, f7, f8 };
  let sw = 0, sv = 0;
  for (const k of Object.keys(W)) { sw += W[k]!; sv += W[k]! * vals[k]!; }
  const compression = clamp01(sw ? sv / sw : 0);
  const distinctiveness = f3;
  const position = gate(ctx.sectionRole);
  // 積型近似：大域平凡(compression) を土台に、一点際立ち(distinctiveness) で持ち上げ、位置(G1)で乗算。
  const score = clamp01(position * compression * (0.7 + 0.3 * distinctiveness));
  return {
    score: round3(score),
    compression: round3(compression),
    distinctiveness: round3(distinctiveness),
    position: round3(position),
    features: { f1: round3(f1), f2: round3(f2), f3: round3(f3), f4: round3(f4), f5: round3(f5), f6: round3(f6), f7: round3(f7), f8: round3(f8) },
  };
}

// G1 位置ゲート（サビ頭/冒頭ほど記憶される＝乗数）。研究 §5.2。
function gate(role?: string): number {
  switch ((role ?? "").toLowerCase()) {
    case "chorus": return 1.0;
    case "prechorus": return 0.9;
    case "bridge": return 0.8;
    case "verse": return 0.7;
    case "intro": return 0.6;
    case "outro": return 0.6;
    case "interlude": return 0.55;
    default: return 0.7; // 未指定＝verse 相当（中庸）
  }
}

/** ③ 歌唱難度レンズ：跳躍(最重)＋tessitura＋音節密度＋音域端＋パッサッジョ → difficulty 0..1。
 *  返り score = 1 - difficulty（高い＝歌いやすい＝軸を揃える）。既定 voice_profile＝女性ポップ平均。ソフト減点（弾かない）。 */
export function singabilityLens(
  notes: LensNote[],
  ctx: LensContext = {},
  profile: VoiceProfile = FEMALE_POP_AVG,
): { score: number; difficulty: number; leap: number; tessitura: number; rangeFit: number; syllableDensity: number; passaggio: number } {
  const ns = prep(notes);
  if (ns.length < 2) return { score: 1, difficulty: 0, leap: 0, tessitura: 0, rangeFit: 0, syllableDensity: 0, passaggio: 0 };
  const bpb = ctx.beatsPerBar ?? 4;
  const iv = intervals(ns);
  const pitches = ns.map((n) => n.pitch);
  const inPassaggio = (p: number) => p >= profile.passaggioLow && p <= profile.passaggioHigh;
  const crossesPassaggio = (a: number, b: number) => Math.min(a, b) < profile.passaggioLow && Math.max(a, b) > profile.passaggioLow;

  // 跳躍項（最重 w0.30）：幅×着地音高(高いほど重)×方向(上行重)×パッサッジョまたぎ。|iv|≥3 を対象。
  let leapSum = 0, leapN = 0;
  for (let i = 0; i < iv.length; i++) {
    const d = iv[i]!;
    if (Math.abs(d) < 3) continue;
    const landing = pitches[i + 1]!;
    const width = Math.min(1, Math.abs(d) / 12);
    const highFactor = 1 + clamp01((landing - profile.tessLow) / Math.max(1, profile.falsettoTop - profile.tessLow)) * 0.5; // 1..1.5
    const dirFactor = d > 0 ? 1.3 : 1.0; // 上行が辛い
    const passFactor = crossesPassaggio(pitches[i]!, landing) ? 1.5 : 1.0;
    leapSum += width * highFactor * dirFactor * passFactor; // 各項は clamp しない（方向/着地高の差を潰さない）
    leapN++;
  }
  const leap = leapN ? clamp01(leapSum / leapN / 2.2) : 0; // 平均を 0..1 へ（オクターブ上跳躍で高域着地≈上限）

  // tessitura 項：デュレーション重み付き重心の乖離＋端点滞在率。
  const totDur = ns.reduce((a, n) => a + Math.max(0, n.dur), 0) || 1;
  const tCenter = ns.reduce((a, n) => a + n.pitch * Math.max(0, n.dur), 0) / totDur;
  const tessCenter = (profile.tessLow + profile.tessHigh) / 2;
  const centerDev = clamp01(Math.abs(tCenter - tessCenter) / 12);
  const topDwell = ns.filter((n) => n.pitch > profile.chestTop).reduce((a, n) => a + Math.max(0, n.dur), 0) / totDur;
  const tessitura = clamp01(0.7 * centerDev + 0.6 * topDwell);

  // 音域端項：上端(裏声上端)超過を強・下端超過を中（ハード寄りだが思想＝ソフト減点で並べ替え）。
  const maxAbove = Math.max(0, Math.max(...pitches) - profile.falsettoTop);
  const belowLow = Math.max(0, profile.low - Math.min(...pitches));
  const rangeFit = clamp01((maxAbove * 1.0 + belowLow * 0.6) / 12);

  // 音節密度項：拍あたり音数（早口ほど難）。1音/拍=易・3+=難。
  const span = Math.max(1e-6, ns[ns.length - 1]!.start + ns[ns.length - 1]!.dur - ns[0]!.start);
  const notesPerBeat = ns.length / span;
  const syllableDensity = clamp01((notesPerBeat - 1) / 2);

  // パッサッジョまたぎ項：またぐ跳躍の割合＋またぎ帯の保持。
  const crossings = iv.filter((_, i) => crossesPassaggio(pitches[i]!, pitches[i + 1]!)).length;
  const passHold = ns.filter((n) => inPassaggio(n.pitch)).reduce((a, n) => a + Math.max(0, n.dur), 0) / totDur;
  const passaggio = clamp01((iv.length ? crossings / iv.length : 0) * 0.7 + passHold * 0.5);

  // 母音×高音項：歌詞（狭母音 i/u）が secondo passaggio 超に乗る割合。歌詞無し＝0（研究 §6-1）。
  const narrow = /[いうイウ]|[iu]/i;
  const highNarrow = ns.filter((n) => n.syllable && narrow.test(n.syllable) && n.pitch > profile.passaggioHigh).length;
  const withLyric = ns.some((n) => !!n.syllable);
  const vowelHigh = withLyric && ns.length ? clamp01(highNarrow / ns.length * 3) : 0;

  // 合成（研究 §6-1 初期重み）。歌詞無し時は vowel_high を外して再正規化＝bit影響なく歌詞前でも安定。
  const parts: [number, number][] = [
    [leap, 0.30], [tessitura, 0.20], [syllableDensity, 0.20], [rangeFit, 0.15], [passaggio, 0.15],
  ];
  if (withLyric) parts.push([vowelHigh, 0.15]);
  let dw = 0, dv = 0;
  for (const [v, w] of parts) { dw += w; dv += v * w; }
  const difficulty = clamp01(dw ? dv / dw : 0);
  return {
    score: round3(1 - difficulty),
    difficulty: round3(difficulty),
    leap: round3(leap), tessitura: round3(tessitura), rangeFit: round3(rangeFit),
    syllableDensity: round3(syllableDensity), passaggio: round3(passaggio),
  };
}

/** 3レンズの headline score をまとめて返す（api の item.meta.lenses 用・全て高い=良い）。 */
export function melodyLenses(notes: LensNote[], ctx: LensContext = {}, profile?: VoiceProfile): MelodyLenses {
  return {
    expectation: expectationLens(notes, ctx).score,
    hook: hookLens(notes, ctx).score,
    singability: singabilityLens(notes, ctx, profile).score,
  };
}
