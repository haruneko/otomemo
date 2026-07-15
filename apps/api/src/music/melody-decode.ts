// 事前確率つきボーカル採譜＝corpus-Viterbi 復号（design §7.5 ／ research/2026-07-15-prior-informed-transcription.md）。
// 家訓：Python(perception) が f0 中心線＋±1半音候補（melody_segments）を吐き、ここ TS(interpretation) が
// 音楽的事前確率で「どの半音に丸めるか」だけを Viterbi で再ラベルする。区間の存在（VAD）には触れない
// ＝「歌ってない区間を作る／歌った区間を消す」の二大事故を構造的に封じる。
//
// 効かせる層＝f0→ノートの「丸め」だけ：
//   エミッション = f0 中心線ガウス（あたりは PESTO が付けている＝主）
//     ＋ λ×コードトーン事前（強拍のみ強く・弱拍は経過音/倚音を保護して弱く）
//     ＋ λ×音域 prior
//   遷移       = λ×自前コーパス度数 bigram（tonic 相対 pc 遷移・自己遷移が最頻＝ビブラート断片を1音へ寄せる）
// 暴走ガード＝候補は生 f0 の committed 半音から ±1 半音のみ（ハードクランプ）。事前は「揺れをどっちに読むか」の
//   タイブレーカーに留め、コードトーンへ音符を瞬間移動させない。
// 回帰退避＝λ=0 で各セグメントの f0 最尤候補（＝現行 round）をそのまま返す＝現行 melody_notes と一致。
import { parseChordSymbol } from "./chordname";
import { chordPcs } from "./theory";

// ── 較正定数（まとめてここで調整。R5 doc 推奨初期値） ──────────────────────────
export const SIGMA_CENT = 45;        // f0 エミッションのガウス幅（cent）。半音=100 の半分弱＝あたり優先
export const LAMBDA_DEFAULT = 0.5;   // 事前確率のブレンド（0=現行 round 再現）。回帰が割れたら下げる
const W_F0 = 1.0;                    // f0 が主・事前は従
const W_CHORD_STRONG = 0.6;          // 強拍のコードトーン吸着（1・3・5度支配）
const W_CHORD_WEAK = 0.25;           // 弱拍は経過音/倚音保護で低く（NCT を殺さない）
const W_TRANS = 0.5;                 // 度数 bigram 遷移
const W_RANGE = 0.3;                 // 音域 prior
const PROB_FLOOR = 1e-4;             // log(0) 回避＋未観測 bin の弱い許容
const MERGE_GAP = 0.12;              // 復号後：同ラベル隣接をこの gap 以内で結合（s）

const mod12 = (x: number) => ((x % 12) + 12) % 12;

export interface MelodyCandidate { midi: number; mass?: number; conf?: number }
export interface MelodySegment {
  t0: number;
  t1: number;
  centerCents: number;         // 絶対 cent（MIDI*100 スケール）＝f0 中心線
  cand: MelodyCandidate[];     // committed 半音 ±1（＝ハードクランプ境界）
}
export interface PriorBin { bin: string; pct: number; n?: number }
export interface DecodeOpts {
  bigram?: Map<string, [number, number][]> | null; // corpusStats.loadNoteTransitions の bigram（tonic 相対 pc "4>2"）
  chordRelStrong?: PriorBin[] | null;              // corpusStats.loadSkeletonPriors の chordRelStrong（コード根相対 pc → pct）
  chordRelWeak?: PriorBin[] | null;
  vocalRange?: { lowMidi: number; highMidi: number } | null;
  beatTimes?: number[] | null;
  meter?: number;
  downbeatSec?: number;
  lambda?: number;                                 // 既定 LAMBDA_DEFAULT・0 で現行 bit 一致
}
export type Key = { tonicPc: number; mode: "major" | "minor" } | null;

// ── コード時刻引き：BTC timeline（[t0,t1,label]）を pc 集合へ。"N"/"X"/解釈不能は null（chord 項をスキップ） ──
interface ChordSpan { t0: number; t1: number; rootPc: number; pcs: number[] }
function buildChordSpans(timeline: [number, number, string][] | null | undefined): ChordSpan[] {
  if (!Array.isArray(timeline)) return [];
  const out: ChordSpan[] = [];
  for (const seg of timeline) {
    if (!Array.isArray(seg) || seg.length < 3) continue;
    const label = String(seg[2] ?? "");
    if (label === "N" || label === "X" || !label) continue;
    const p = parseChordSymbol(label.replace(":", "")); // BTC は "C:maj" 形式
    if (!p) continue;
    out.push({ t0: Number(seg[0]), t1: Number(seg[1]), rootPc: mod12(p.root), pcs: chordPcs(p.root, p.quality) });
  }
  return out;
}
function chordAt(spans: ChordSpan[], t: number): ChordSpan | null {
  for (const s of spans) if (t >= s.t0 && t < s.t1) return s;
  return null;
}

// ── 強拍判定：downbeat/meter からビート位置を割り、拍頭(0)と半小節(meter/2)を強拍とする。
//    ビートから離れた（オフビート）区間は弱拍＝経過音保護。ビート情報が無ければ弱扱い（chord pull を抑える安全側）。──
function makeStrongBeat(beatTimes: number[] | null | undefined, meter: number, downbeatSec: number): (t: number) => boolean {
  const bts = Array.isArray(beatTimes) ? beatTimes.filter((x) => Number.isFinite(x)) : [];
  if (bts.length < 2) return () => false;
  const diffs: number[] = [];
  for (let i = 1; i < bts.length; i++) diffs.push(bts[i]! - bts[i - 1]!);
  diffs.sort((a, b) => a - b);
  const spb = diffs[Math.floor(diffs.length / 2)] || 0.5; // 中央ビート間隔
  const m = meter >= 1 ? Math.round(meter) : 4;
  return (t: number) => {
    let best = 0, bd = Infinity;
    for (const b of bts) { const d = Math.abs(t - b); if (d < bd) { bd = d; best = b; } }
    if (bd > 0.25 * spb) return false; // オフビート＝弱
    const k = Math.round((best - downbeatSec) / spb);
    const inBar = ((k % m) + m) % m;
    return inBar === 0 || (m % 2 === 0 && inBar === m / 2);
  };
}

function priorPct(bins: PriorBin[] | null | undefined, relPc: number): number {
  if (!bins) return 0;
  for (const b of bins) if (Number(b.bin) === relPc) return b.pct;
  return 0;
}

// bigram: from_ctx(=tonic 相対 pc 文字列) → [[to_pc, count]]。確率＝count / Σcount。
function transProb(bigram: Map<string, [number, number][]> | null | undefined, relPrev: number, relCur: number): number {
  if (!bigram) return 0;
  const row = bigram.get(String(relPrev));
  if (!row || !row.length) return 0;
  let total = 0, hit = 0;
  for (const [to, c] of row) { total += c; if (to === relCur) hit = c; }
  return total > 0 ? hit / total : 0;
}

/**
 * 事前確率つきボーカル採譜復号（純関数・Viterbi）。
 * @param segs           Python 由来の melody_segments（中心線 cent＋±1 半音候補）。
 * @param chordsTimeline BTC の chords_timeline（[t0,t1,label]）。null/空なら chord 項を無効化。
 * @param key            {tonicPc, mode}。null なら遷移 bigram を無効化（emission 主体）。
 * @param opts           bigram / chordRelStrong / chordRelWeak / vocalRange / beat 情報 / lambda。
 * @returns melody_notes 形式 [[start_sec, end_sec, midi]]（同ラベル隣接はマージ済）。
 */
export function decodeMelody(
  segs: MelodySegment[],
  chordsTimeline: [number, number, string][] | null | undefined,
  key: Key,
  opts: DecodeOpts = {},
): [number, number, number][] {
  if (!Array.isArray(segs) || segs.length === 0) return [];
  const lambda = opts.lambda ?? LAMBDA_DEFAULT;
  const spans = lambda > 0 ? buildChordSpans(chordsTimeline) : [];
  const strongAt = makeStrongBeat(opts.beatTimes, opts.meter ?? 4, opts.downbeatSec ?? 0);
  const tonicPc = key ? mod12(key.tonicPc) : 0;
  const range = opts.vocalRange;

  const emis = (seg: MelodySegment, cand: MelodyCandidate): number => {
    const dc = seg.centerCents - cand.midi * 100;
    let e = W_F0 * -(dc * dc) / (2 * SIGMA_CENT * SIGMA_CENT); // f0 ガウス log（定数項は省略＝argmax 不変）
    if (lambda > 0) {
      const mid = (seg.t0 + seg.t1) / 2;
      const ch = spans.length ? chordAt(spans, mid) : null;
      if (ch) {
        const strong = strongAt(mid);
        const rel = mod12(cand.midi - ch.rootPc);
        const w = strong ? W_CHORD_STRONG : W_CHORD_WEAK;
        const pct = priorPct(strong ? opts.chordRelStrong : opts.chordRelWeak, rel);
        e += lambda * w * Math.log(pct / 100 + PROB_FLOOR);
      }
      if (range && Number.isFinite(range.lowMidi) && Number.isFinite(range.highMidi)) {
        const out = cand.midi < range.lowMidi ? range.lowMidi - cand.midi
          : cand.midi > range.highMidi ? cand.midi - range.highMidi : 0;
        if (out > 0) e += lambda * W_RANGE * -out; // 音域外は半音距離ぶん減点
      }
    }
    return e;
  };
  const trans = (prev: MelodyCandidate, cur: MelodyCandidate): number => {
    if (lambda <= 0 || !key || !opts.bigram) return 0;
    const p = transProb(opts.bigram, mod12(prev.midi - tonicPc), mod12(cur.midi - tonicPc));
    return lambda * W_TRANS * Math.log(p + PROB_FLOOR);
  };

  // Viterbi（各セグメントの候補列＝格子）。λ=0 なら trans=0・emis=f0 のみ＝各 seg 独立に最尤候補（現行 round）。
  const n = segs.length;
  const V: number[][] = [];
  const back: number[][] = [];
  const cands = segs.map((s) => (s.cand.length ? s.cand : [{ midi: Math.round(s.centerCents / 100) }]));
  V[0] = cands[0]!.map((c) => emis(segs[0]!, c));
  back[0] = cands[0]!.map(() => -1);
  for (let i = 1; i < n; i++) {
    const prevC = cands[i - 1]!, curC = cands[i]!;
    V[i] = []; back[i] = [];
    for (let j = 0; j < curC.length; j++) {
      let bestScore = -Infinity, bestK = 0;
      for (let k = 0; k < prevC.length; k++) {
        const sc = V[i - 1]![k]! + trans(prevC[k]!, curC[j]!);
        if (sc > bestScore) { bestScore = sc; bestK = k; }
      }
      V[i]![j] = bestScore + emis(segs[i]!, curC[j]!);
      back[i]![j] = bestK;
    }
  }
  // 終端の最尤を辿る
  let bj = 0, bs = -Infinity;
  for (let j = 0; j < V[n - 1]!.length; j++) if (V[n - 1]![j]! > bs) { bs = V[n - 1]![j]!; bj = j; }
  const path: number[] = new Array(n);
  path[n - 1] = bj;
  for (let i = n - 1; i > 0; i--) path[i - 1] = back[i]![path[i]!]!;

  // ラベル確定＋同ラベル隣接マージ（旧 postprocess の absorb/isolated は Python 側で完了済＝ここは丸め結果の再結合のみ）
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const midi = cands[i]![path[i]!]!.midi;
    const s = segs[i]!;
    const last = out[out.length - 1];
    if (last && last[2] === midi && s.t0 - last[1] <= MERGE_GAP) last[1] = Math.max(last[1], s.t1);
    else out.push([Math.round(s.t0 * 1000) / 1000, Math.round(s.t1 * 1000) / 1000, midi]);
  }
  return out;
}
