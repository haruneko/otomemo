// メロ×低音の声部進行レンズ（分析のみ・生成非介入／backlog和声③「完全に未監視」への回答・2026-07-09）。
// 対位法の客観違反＝並行完全5度/8度・直行(隠伏)5度/8度・声部交差 を数える。良し悪しの断は人間（機械は指摘まで）。
import { type Note } from "@cm/music-core"; // 音符基本形の SSOT（負債#10・Note型一元化）

export interface VoiceLeadingReport {
  score: number; // 1 - 違反/機会（0..1・高=綺麗）。機会ゼロは1。
  parallelFifths: number;
  parallelOctaves: number;
  directFifths: number; // 直行(隠伏)＝同方向＋上声跳躍で完全協和音程へ突入
  directOctaves: number;
  voiceCrossings: number; // 上声が下声より低い瞬間
  spots: { t: number; kind: string }[]; // 具体箇所（先頭から最大32件）
}

// 時刻 t で鳴っている音（start≤t<start+dur の最後の音）。無ければ最寄り直前。
// export＝生成側（gen_melody の対位バイアス・2026-07-10）と標本化を共用＝評価と生成で同じ低音を見る。
export function pitchAt(sorted: Note[], t: number): number | null {
  let p: number | null = null;
  for (const n of sorted) { if (n.start <= t + 1e-6) p = n.pitch; else break; }
  return p;
}

// upper=メロ, lower=低音（ベース）。両声部の onset 和集合で同時鳴りを標本化し、隣接遷移で違反を数える。
export function analyzeVoiceLeading(upper: Note[], lower: Note[]): VoiceLeadingReport {
  const u = [...upper].filter((n) => Number.isFinite(n.pitch)).sort((a, b) => a.start - b.start);
  const l = [...lower].filter((n) => Number.isFinite(n.pitch)).sort((a, b) => a.start - b.start);
  const rep: VoiceLeadingReport = { score: 1, parallelFifths: 0, parallelOctaves: 0, directFifths: 0, directOctaves: 0, voiceCrossings: 0, spots: [] };
  if (u.length < 1 || l.length < 1) return rep;
  const times = Array.from(new Set([...u, ...l].map((n) => Math.round(n.start * 1000) / 1000))).sort((a, b) => a - b);
  const samples: { t: number; u: number; l: number }[] = [];
  for (const t of times) { const uu = pitchAt(u, t), ll = pitchAt(l, t); if (uu != null && ll != null) samples.push({ t, u: uu, l: ll }); }
  const add = (t: number, kind: string) => { if (rep.spots.length < 32) rep.spots.push({ t, kind }); };
  let opportunities = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    if (s.u < s.l) { rep.voiceCrossings++; add(s.t, "voice-crossing"); }
    if (i === 0) continue;
    const p = samples[i - 1]!;
    const du = s.u - p.u, dl = s.l - p.l;
    if (du === 0 && dl === 0) continue; // 動かない＝機会でない
    opportunities++;
    const iv0 = (((p.u - p.l) % 12) + 12) % 12, iv1 = (((s.u - s.l) % 12) + 12) % 12;
    const sameDir = Math.sign(du) === Math.sign(dl) && du !== 0 && dl !== 0;
    if (sameDir && iv0 === 7 && iv1 === 7) { rep.parallelFifths++; add(s.t, "parallel-5th"); }
    else if (sameDir && iv0 === 0 && iv1 === 0) { rep.parallelOctaves++; add(s.t, "parallel-8ve"); }
    else if (sameDir && Math.abs(du) > 2 && iv1 === 7 && iv0 !== 7) { rep.directFifths++; add(s.t, "direct-5th"); } // 隠伏5度
    else if (sameDir && Math.abs(du) > 2 && iv1 === 0 && iv0 !== 0) { rep.directOctaves++; add(s.t, "direct-8ve"); } // 隠伏8度
  }
  const viol = rep.parallelFifths + rep.parallelOctaves + rep.directFifths + rep.directOctaves + rep.voiceCrossings;
  rep.score = opportunities > 0 ? Math.max(0, 1 - viol / opportunities) : 1;
  return rep;
}
