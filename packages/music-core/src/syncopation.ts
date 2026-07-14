// シンコペ密度スコア＋「ノリ」レンズ（WP-D2・2026-07-14）。正典＝docs/research/2026-07-14-syncopation-sweet-spot.md。
// 思想（絶対）：シンコペ指標は**審判にしない**＝候補を弾かず・総合点で潰さず、選んだ軸で並べ替える「ノリのレンズ」。
// 逆U（中程度が快最大・山は下寄り非対称）／量よりパターン（ランダム撒きは快を増やさない）／全層いっぺんに盛らない。
// 純TS・記号（onset 位置＋拍子）のみ＝音源不要（melodyLenses と同格の共有純関数）。api/web が @cm/music-core から引く。
// 絶対値は指標依存＝§7「自前コーパス実測で要較正」。ここの数値は研究doc §6 の相対形を写した**暫定初期値**。

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

// ── LHL 度数化：拍子階層のメトリック重み（downbeat=0・弱いほど負） ──
// 2で割り切れる限り2分、次に3分、残余素因数で1回。beatGrouping×gridPerBeat で1小節セルを構成。
function factorTree(n: number): number[] {
  const out: number[] = [];
  let m = Math.max(1, Math.floor(n));
  while (m % 2 === 0) { out.push(2); m /= 2; }
  while (m % 3 === 0) { out.push(3); m /= 3; }
  if (m > 1) out.push(m);
  return out;
}

/** 1小節のグリッド各セルのメトリック重み（長さ = beatsPerBar×gridPerBeat・0=最強拍・負ほど弱拍）。
 *  subdivisions を上位から順に割っていき、初出のレベル L で weight=−L を与える（LHL 階層）。 */
export function metricWeights(beatsPerBar: number, gridPerBeat: number, compound = false): number[] {
  const bpb = Math.max(1, Math.floor(beatsPerBar));
  const gpb = Math.max(1, Math.floor(gridPerBeat));
  // 小節→拍のグルーピング（compound=6/8 等は既に「拍数」で来る想定＝2/3 の複合はここでは binary/ternary 因数分解で扱う）。
  const beatGroup = factorTree(bpb);
  const gridGroup = factorTree(gpb);
  const subs = [...beatGroup, ...gridGroup];
  const cells = bpb * gpb;
  const w = new Array<number>(cells).fill(0);
  const assigned = new Array<boolean>(cells).fill(false);
  let prod = 1;
  for (let level = 0; level <= subs.length; level++) {
    const spacing = cells / prod; // 整数（product(subs)=cells ゆえ割り切れる）
    for (let p = 0; p < cells; p += spacing) {
      const idx = Math.round(p);
      if (!assigned[idx]) { w[idx] = level === 0 ? 0 : -level; assigned[idx] = true; }
    }
    if (level < subs.length) prod *= subs[level]!;
  }
  void compound; // 拍子情報は beatsPerBar/gridPerBeat に織り込み済（将来の非対称拍対応で参照）
  return w;
}

/** シンコペ計算のメーター定義。barLen=1小節の onset 時間長（onset と同単位）・cells=1小節のセル数。 */
export interface SyncMeter {
  beatsPerBar: number;   // 4/4→4・6/8→2（複合拍）
  gridPerBeat: number;   // 拍内分割（4/4 16分→4・6/8 8分→3）
  compound?: boolean;
  barLen?: number;       // 1小節の onset 単位長（既定=beatsPerBar＝onset が4分=1の格子）
}

export interface SyncResult {
  raw: number;           // Σ s（区間内総和）
  perBar: number;        // Σ s / 小節数（セクション比較の主指標）
  perNote: number;       // Σ s / onset数（刻みの細かさ由来の水増しを排除）
  bars: number;
  onsets: number;
  events: number;        // シンコペ事象数
}

/** LHL 密度スコア（単声近似＝dur 不要・次 onset までを被覆＝休符/タイ同一視）。
 *  onset を格子セルに丸め、各 onset の「次 onset までに被覆する、より強い位置」の最大重みとの差 s>0 を積算。
 *  最後の onset は直後の小節頭（downbeat）まで延長＝終端アンティシペーションを拾う。 */
export function lhlSyncScore(onsets: readonly number[], meter: SyncMeter): SyncResult {
  const bpb = Math.max(1, Math.floor(meter.beatsPerBar));
  const gpb = Math.max(1, Math.floor(meter.gridPerBeat));
  const cells = bpb * gpb;
  const barLen = meter.barLen ?? bpb;
  const cellLen = barLen / cells;
  const w = metricWeights(bpb, gpb, meter.compound);
  const wat = (absCell: number): number => w[((absCell % cells) + cells) % cells]!;

  // onset→絶対セル（重複除去・昇順）。空/1音は 0。
  const cellsAt = Array.from(new Set(onsets
    .filter((t) => Number.isFinite(t) && t >= -1e-9)
    .map((t) => Math.round(t / cellLen))))
    .sort((a, b) => a - b);
  const onsetCount = cellsAt.length;
  const maxCell = onsetCount ? cellsAt[onsetCount - 1]! : 0;
  const bars = Math.max(1, Math.ceil((maxCell + 1) / cells));
  if (onsetCount < 2) return { raw: 0, perBar: 0, perNote: 0, bars, onsets: onsetCount, events: 0 };

  let raw = 0;
  let events = 0;
  for (let i = 0; i < onsetCount; i++) {
    const cur = cellsAt[i]!;
    // 被覆区間 (cur, next)。最後の onset は直後の downbeat まで延長。
    const next = i + 1 < onsetCount ? cellsAt[i + 1]! : (Math.floor(cur / cells) + 1) * cells;
    const wCur = wat(cur);
    let wMax = -Infinity;
    for (let p = cur + 1; p < next; p++) { const wp = wat(p); if (wp > wMax) wMax = wp; }
    if (wMax > wCur) { raw += wMax - wCur; events++; }
  }
  return {
    raw: round3(raw),
    perBar: round3(raw / bars),
    perNote: round3(raw / onsetCount),
    bars,
    onsets: onsetCount,
    events,
  };
}

// ── ノリのレンズ（候補メーター＋層合成の飽和ガード） ──

export type SyncSectionRole =
  | "intro" | "verse" | "prechorus" | "build" | "chorus" | "bridge" | "interlude" | "outro";
export type SyncGenre = "funk" | "rock" | "ballad" | "dance" | "pop";
export type SyncLayer = "drums" | "bass" | "melody";
export type SyncZone = "素直" | "跳ねる" | "攻める";

// 役割別ターゲット帯（正規化 0..1・研究 §6-1）。未知は中庸。
const ROLE_BANDS: Record<string, [number, number]> = {
  intro: [0.15, 0.35], verse: [0.15, 0.35], prechorus: [0.3, 0.5], build: [0.3, 0.5],
  chorus: [0.4, 0.6], bridge: [0.5, 0.75], interlude: [0.15, 0.35], outro: [0.1, 0.3],
};
const DEFAULT_BAND: [number, number] = [0.3, 0.5];

// raw perBar → 0..1 正規化の暫定基準（§7＝要較正）。値が大きいほど「攻める」寄りに写る。
export const SYNC_REF = 10;

const GENRE_OFFSET: Record<string, number> = { funk: 0.15, dance: 0.1, rock: 0, pop: 0, ballad: -0.15 };

/** セクション役割＋テンポ/和声/ジャンル補正でターゲット帯を返す（clamp 0..1）。 */
export function noriTargetBand(ctx: NoriCtx = {}): [number, number] {
  const base = (ctx.role && ROLE_BANDS[ctx.role.toLowerCase()]) || DEFAULT_BAND;
  let lo = base[0];
  let hi = base[1];
  const t = ctx.tempo;
  if (typeof t === "number" && t > 0) {
    if (t >= 100 && t <= 120) { lo += 0.07; hi += 0.07; }        // §2-4 最適テンポ帯は許容+
    else if (t < 80 || t > 140) { lo -= 0.1; hi -= 0.1; }         // 外れ（特に速い）で引き締め
  }
  if (typeof ctx.harmonyTension === "number" && ctx.harmonyTension > 0.6) { lo -= 0.1; hi -= 0.1; } // §2-2 予算付け替え
  const g = ctx.genre ? GENRE_OFFSET[ctx.genre.toLowerCase()] : undefined;
  if (typeof g === "number") { lo += g; hi += g; }
  return [clamp01(lo), clamp01(hi)];
}

const zoneOf = (norm: number): SyncZone => (norm < 0.33 ? "素直" : norm < 0.66 ? "跳ねる" : "攻める");
// 帯内=1・外は距離で減衰（0.3 で 0 へ）。弾かず並べ替え（fit 低くても消さない）。
const bandFit = (norm: number, band: [number, number]): number => {
  if (norm >= band[0] && norm <= band[1]) return 1;
  const d = norm < band[0] ? band[0] - norm : norm - band[1];
  return clamp01(1 - d / 0.3);
};

export interface NoriCtx {
  role?: string;
  tempo?: number;
  harmonyTension?: number; // 0..1（高い＝和声厚い＝リズム帯を下げる）
  genre?: string;
}

export interface NoriMeter {
  perBar: number;
  perNote: number;
  norm: number;   // 0..1
  zone: SyncZone;
  band: [number, number];
  fit: number;    // 0..1（帯適合＝並べ替えキー）
  inBand: boolean;
}

/** 単一候補（1層）のノリメーター＝§6-2 の「候補に添えるノリ度メーター」。raw perBar を正規化し帯適合を返す。 */
export function noriMeter(sync: SyncResult, ctx: NoriCtx = {}): NoriMeter {
  const band = noriTargetBand(ctx);
  const norm = clamp01(sync.perBar / SYNC_REF);
  return {
    perBar: round3(sync.perBar),
    perNote: round3(sync.perNote),
    norm: round3(norm),
    zone: zoneOf(norm),
    band: [round3(band[0]), round3(band[1])],
    fit: round3(bandFit(norm, band)),
    inBand: norm >= band[0] && norm <= band[1],
  };
}

export interface NoriLensLayers {
  drums?: SyncResult;
  bass?: SyncResult;
  melody?: SyncResult;
}

export interface SectionNoriLens {
  targetBand: [number, number];
  layers: Partial<Record<SyncLayer, NoriMeter>>;
  saturated: boolean;   // 全層同時高＝逆Uの右肩落ち（§6-3 降格対象）
  anchorOk: boolean;    // 刻み or バックビートの床（どれか1層が低い）
  sumNorm: number;      // 層合算（配分予算の指標）
  warnings: string[];   // 人間語の注意（弾かない・注意のみ）
}

const HIGH_ZONE = 0.6;   // 「攻める」高帯の下端
const ANCHOR_FLOOR = 0.35; // 床（アンカー）とみなす norm 上限
const SUM_BUDGET = 1.8;  // 層合算の暫定上限（§6-3 飽和ガード・要較正）

/** 層合成の「ノリ」レンズ＝層別ノリメーター＋飽和/アンカー/合算予算ガード（§6-3）。
 *  全層いっぺんに盛らない：present≥2 かつ全 norm≥HIGH で飽和／どの層も床(低norm)に無ければアンカー欠如。
 *  思想＝**降格はするが消さない**（saturated/warnings は注意であって候補削除ではない）。 */
export function sectionNoriLens(layers: NoriLensLayers, ctx: NoriCtx = {}): SectionNoriLens {
  const band = noriTargetBand(ctx);
  const out: Partial<Record<SyncLayer, NoriMeter>> = {};
  const norms: number[] = [];
  (["drums", "bass", "melody"] as SyncLayer[]).forEach((k) => {
    const s = layers[k];
    if (!s) return;
    const m = noriMeter(s, ctx);
    out[k] = m;
    norms.push(m.norm);
  });
  const present = norms.length;
  const sumNorm = round3(norms.reduce((a, b) => a + b, 0));
  const allHigh = present >= 2 && norms.every((n) => n >= HIGH_ZONE);
  const anchorOk = present === 0 ? true : norms.some((n) => n < ANCHOR_FLOOR);
  const saturated = allHigh || sumNorm > SUM_BUDGET;
  const warnings: string[] = [];
  if (allHigh) warnings.push("全層が同時に高シンコペ＝ノリが崩壊しやすい（逆Uの右肩）。1層を素直に戻すと立つ。");
  if (present >= 2 && !anchorOk) warnings.push("床（刻み/バックビート）を張る層がありません。どれか1層を低めに据えるとメーターが安定。");
  if (sumNorm > SUM_BUDGET && !allHigh) warnings.push("層合算のシンコペ予算が過多＝盛りすぎ。ベース中・上物中〜高へ配分し直しを。");
  return { targetBand: [round3(band[0]), round3(band[1])], layers: out, saturated, anchorOk, sumNorm, warnings };
}
