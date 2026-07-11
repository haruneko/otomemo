// フレーズ分割（コーパス圧縮の土台・S6-b 実例）：拍子から実小節長を取り、4小節ごとに切る。
// 拍子は ABC の M: / MIDI の time sig から確定（midi.meterOf）。変拍子・拍子変更は呼び側で捨てる。
import { meterInfo } from "./meter";
import { melodySimilarityLayered } from "./similarity";
import { type Note } from "@cm/music-core"; // 音符基本形の SSOT（負債#10・Note型一元化）

// パターン辞書の1エントリ：代表フレーズ＋出現回数（＝頻度＝バイアスの素）＋style＋調性(代表の mode)。
export interface Pattern { notes: Note[]; count: number; style: string; mode?: "major" | "minor"; meter?: string }

// 音程ヒストグラム（-12..+12にクランプ・移調不変）。クラスタリングの安い事前ゲート用。
function intervalHist(notes: Note[]): number[] {
  const ns = [...notes].sort((a, b) => a.start - b.start);
  const h = new Array(25).fill(0);
  for (let i = 1; i < ns.length; i++) h[Math.max(-12, Math.min(12, ns[i]!.pitch - ns[i - 1]!.pitch)) + 12]++;
  return h;
}
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na * nb) || 1);
}

// 似たフレーズを束ねて {代表, 出現回数} に圧縮（貪欲法・移調不変の多層類似でグルーピング）。
// threshold 高＝厳しく（辞書膨れる）/低＝ゆるく（潰しすぎ）。同 style 内でのみ束ねる。
// 安いゲート（音程ヒストグラム cos ≥ 0.5）で候補を絞ってから重い多層類似＝大量フレーズでも実用速度。
export function clusterPhrases(phrases: { notes: Note[]; style: string; mode?: "major" | "minor"; meter?: string }[], threshold = 0.85): Pattern[] {
  const pats: (Pattern & { iv: number[] })[] = [];
  for (const ph of phrases) {
    const iv = intervalHist(ph.notes);
    let best = -1;
    let bestSim = threshold;
    for (let i = 0; i < pats.length; i++) {
      if (pats[i]!.style !== ph.style) continue;
      if (cosine(iv, pats[i]!.iv) < 0.5) continue; // 安いゲート：音程分布が遠ければ多層類似はかけない
      const sim = melodySimilarityLayered(ph.notes, pats[i]!.notes); // 移調不変（音程+リズム+輪郭）
      if (sim >= bestSim) {
        bestSim = sim;
        best = i;
      }
    }
    if (best >= 0) pats[best]!.count++;
    else pats.push({ notes: ph.notes, count: 1, style: ph.style, mode: ph.mode, meter: ph.meter, iv });
  }
  return pats.map(({ iv: _iv, ...p }) => p).sort((a, b) => b.count - a.count); // 頻出パターン順
}

// 標準拍子か（単純 2/4・3/4・4/4・2/2、複合 3/8・6/8・9/8・12/8）。変拍子(5/4,7/8等)は false＝捨てる。
export function isStandardMeter(meter?: string | null): boolean {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
  if (!m) return false;
  const n = Number(m[1]);
  const d = Number(m[2]);
  if (![2, 4, 8].includes(d)) return false;
  if (d === 8) return [3, 6, 9, 12].includes(n); // 複合系（付点四分ビート）
  return [2, 3, 4].includes(n); // 単純系（分母 2/4）
}

// 演奏MIDIの音長は楽譜長でない（スタッカート＝短く切れる）。**フレーズ単位**で楽譜長を復元：
// オンセットをグリッド量子化→各音を次の音の頭までレガート→ただし**上限＝min(全音符=4拍, フレーズ内IOI中央値×3)**
// で抑え（休符を1音にしない／密なフレーズで不相応に長くしない）→**音楽的音価にスナップ**（付点8分・付点4分・付点2分含む）。
// 上限は旧 2拍（二分音符）だったが実メロの句末白玉/長音（付点2分3・全音符4）が統計から丸ごと欠落する原因だった
// （research 2026-07-10 対策3-C＝統計データの誤り）。4拍へ引き上げ＝**遅い/疎な句でのみ**白玉が記録される（med×3で密な句は不変）。
// ※既存コーパスDBはこの上限で取り込み済＝**再取り込み(再構築)して初めて反映**される。
const MUSICAL_DUR = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
export function scoreDurations(notes: Note[], grid = 0.25): Note[] {
  const ns = [...notes].sort((a, b) => a.start - b.start); // 弱起(負start)も保持
  if (!ns.length) return [];
  const q = (x: number): number => Math.round(x / grid) * grid;
  const r3 = (x: number): number => Math.round(x * 1000) / 1000;
  const onsets = ns.map((n) => q(n.start));
  const iois: number[] = [];
  for (let i = 1; i < onsets.length; i++) if (onsets[i]! - onsets[i - 1]! > 0) iois.push(onsets[i]! - onsets[i - 1]!);
  iois.sort((a, b) => a - b);
  const med = iois.length ? iois[Math.floor(iois.length / 2)]! : 0.5;
  const maxDur = Math.max(grid, Math.min(4, med * 3)); // 全音符以下 ＆ フレーズ相対（旧上限2＝白玉欠落を是正・対策3-C）
  const snap = (d: number): number => {
    const c = Math.min(d, maxDur);
    let best = MUSICAL_DUR[0]!;
    for (const v of MUSICAL_DUR) if (v <= maxDur + 1e-9 && Math.abs(v - c) < Math.abs(best - c)) best = v;
    return best;
  };
  const out: Note[] = [];
  for (let i = 0; i < ns.length; i++) {
    const raw = i + 1 < ns.length ? onsets[i + 1]! - onsets[i]! : Math.min(maxDur, q(ns[i]!.dur || med));
    out.push({ pitch: ns[i]!.pitch, start: r3(onsets[i]!), dur: snap(raw) });
  }
  return out;
}

// POP909 等の beat 注釈（各行=拍, 3列目=小節頭フラグ 1.0）から 拍/小節 を復元。
// MIDI の time-sig がバグってる時（POP909 は "1/4"）の正しい拍子源。間隔が一貫しなければ null＝捨てる。
export function beatsPerBarFromBeats(text: string): number | null {
  const rows = text.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number));
  const down: number[] = [];
  rows.forEach((r, i) => { if (r[2] === 1) down.push(i); });
  if (down.length < 3) return null;
  const sp: Record<number, number> = {};
  for (let i = 1; i < down.length; i++) { const d = down[i]! - down[i - 1]!; sp[d] = (sp[d] ?? 0) + 1; }
  const top = Object.entries(sp).sort((a, b) => b[1] - a[1])[0]!;
  const bpb = Number(top[0]);
  return top[1] / (down.length - 1) >= 0.8 && bpb >= 2 && bpb <= 12 ? bpb : null; // 小節頭間隔が80%以上一貫
}

// 最初の実 downbeat の絶対拍（=最初に 3列目=1 になる行index・1行1拍）。無ければ null。
// 半端小節始まり（downbeat が beat0 の倍数に乗らない曲）の位相アンカーに使う。
export function firstDownbeatFromBeats(text: string): number | null {
  const rows = text.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number));
  for (let i = 0; i < rows.length; i++) if (rows[i]![2] === 1) return i;
  return null;
}

// notes を「実小節 × barsPerPhrase」ごとのフレーズに分割。各フレーズは start を 0 起点へ rebase。
// **小節グリッドは「最初の音の小節頭」にアンカー**（tick0固定だとイントロ/弱起で1小節ズレる）。
// anchorBeat を渡せばそれを bar1 起点に使う（POP909 の実 downbeat 等）。疎なフレーズは捨てる。
export function segmentByBars(notes: Note[], meter: string, barsPerPhrase = 4, minNotes = 4, anchorBeat?: number): Note[][] {
  const beatsPerBar = meterInfo(meter).beatsPerBar;
  const span = beatsPerBar * barsPerPhrase; // 1フレーズの拍数（4/4→16, 3/4→12, 6/8→12）
  if (!(span > 0)) return [];
  const valid = notes.filter((n) => n.start >= 0);
  if (!valid.length) return [];
  const firstStart = Math.min(...valid.map((n) => n.start));
  // **弱起を次フレーズへ寄せる**：各フレーズ頭の pickup 拍ぶん手前に始まる音は次フレーズ所属(負start)に。
  // ＝最初も内部も「連続する弱起」も一様に処理（弱起始まりの曲でフレーズ境界が前小節へ食い込んでも崩れない）。
  const pickup = Math.min(1.5, beatsPerBar * 0.5);
  // グリッド原点（最初のフレーズ頭の絶対拍）。
  let origin: number;
  if (anchorBeat !== undefined) {
    // 実 downbeat の位相をそのまま使う（小節頭が beat0 の倍数に乗らない＝半端小節始まりの曲・POP909 010/020 型）。
    // anchorBeat + k*span の格子のうち、最初の音(pickup 許容)を含む格子点を origin に。floor で位相を潰さない。
    origin = anchorBeat + Math.floor((firstStart - anchorBeat + pickup + 1e-6) / span) * span;
  } else {
    // anchorBeat 無し＝最初の音の小節頭にアンカー。最初の音が小節後半に始まる＝**弱起始まり**なら次の小節頭を起点に。
    origin = Math.floor((firstStart + 1e-6) / beatsPerBar) * beatsPerBar;
    if (firstStart - origin > beatsPerBar * 0.55) origin += beatsPerBar; // 弱起始まり→最初の小節頭が起点
  }
  const buckets = new Map<number, Note[]>();
  for (const n of valid) {
    const idx = Math.floor((n.start - origin + pickup + 1e-6) / span);
    if (idx < 0) continue; // origin より pickup 以上前＝捨てる
    (buckets.get(idx) ?? buckets.set(idx, []).get(idx)!).push(n);
  }
  const out: Note[][] = [];
  for (const [idx, ns] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (ns.length < minNotes) continue; // 音が少なすぎるフレーズ（間奏の切れ端等）は捨てる
    const base = origin + idx * span;
    out.push(ns.map((n) => ({ pitch: n.pitch, start: Math.round((n.start - base) * 1000) / 1000, dur: n.dur }))); // 弱起は start<0
  }
  return out;
}
