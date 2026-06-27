// MIDI（多声）→ コード進行 検出（S6-b コーパス・Falcom 等のコード進行を取り込む）。
// 各小節の「鳴っているピッチクラス（音長重み）」をコードテンプレートに照合して root×quality を当てる。
import { QUALITY_INTERVALS, chordPcs } from "./theory";
import { meterInfo } from "./meter";

type Note = { pitch: number; start: number; dur: number; channel?: number };

// 検出に使う品質（過剰に複雑なのは避ける）。
const DETECT_QUALS = ["", "m", "7", "m7", "maj7", "dim", "sus4", "6", "m6"];

// 12音の重みヒストグラム → 最も説明できる {root, quality}。
// score = 鳴ってる重みのカバー率(recall)×0.6 ＋ コード構成音が実際に在る率(completeness)×0.4 ＋ ルート在りボーナス。
export function detectChord(pc: number[]): { root: number; quality: string; score: number } {
  const total = pc.reduce((a, b) => a + b, 0) || 1;
  let best = { root: 0, quality: "", score: -1 };
  for (let root = 0; root < 12; root++) {
    if (pc[root]! <= 0 && total > 0) {
      // ルートが鳴ってないコードは基本除外（ただし全休等の保険で完全には切らない）
    }
    for (const q of DETECT_QUALS) {
      if (!(q in QUALITY_INTERVALS)) continue;
      const tones = chordPcs(root, q);
      const inWeight = tones.reduce((s, t) => s + pc[t]!, 0);
      const coverage = inWeight / total;
      const present = tones.filter((t) => pc[t]! > total * 0.05).length;
      const completeness = present / tones.length;
      const rootBonus = pc[root]! > total * 0.05 ? 0.1 : -0.1;
      const score = coverage * 0.6 + completeness * 0.4 + rootBonus;
      if (score > best.score) best = { root, quality: q, score };
    }
  }
  return best;
}

// notes（多声・channel付き）→ 小節ごとのコード列。ドラム(ch9)除外・小節グリッドは最初の音の小節頭にアンカー。
// segPerBar=2 なら半小節単位で検出（和声リズムが速い曲向け）。
export function midiBarChords(
  notes: Note[],
  meter: string,
  segPerBar = 1,
): { root: number; quality: string; start: number; dur: number }[] {
  const bpb = meterInfo(meter).beatsPerBar;
  const seg = bpb / segPerBar; // 1コードの長さ（拍）
  const harm = notes.filter((n) => n.channel !== 9 && n.start >= 0);
  if (!harm.length) return [];
  const origin = Math.floor(Math.min(...harm.map((n) => n.start)) / bpb) * bpb;
  const end = Math.max(...harm.map((n) => n.start + n.dur));
  const out: { root: number; quality: string; start: number; dur: number }[] = [];
  for (let s = origin; s < end - 1e-6; s += seg) {
    const pc = new Array(12).fill(0);
    for (const n of harm) {
      const ov = Math.min(n.start + n.dur, s + seg) - Math.max(n.start, s); // この区間との重なり
      if (ov > 0) pc[((n.pitch % 12) + 12) % 12] += ov;
    }
    if (pc.reduce((a, b) => a + b, 0) < seg * 0.25) continue; // ほぼ無音の区間は飛ばす
    const c = detectChord(pc);
    out.push({ root: c.root, quality: c.quality, start: Math.round((s - origin) * 1000) / 1000, dur: seg });
  }
  return out;
}
