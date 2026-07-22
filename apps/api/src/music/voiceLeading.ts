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

// ── 候補選別への声部進行減点（PAC/IAC＋声部進行の生成側結線・2026-07-22・SDD 監査反映v2）──
// analyzeVoiceLeading の違反件数を「並べ替えキーの減点」へ写す純関数。重みは melodyCells の counterTerm 実定数
// （W_PAR=6 / W_DIR=3）に整合＝評価と選好で同じ比。crossings は重欠陥ゆえ 6。rep=null（下声解決不能）は 0。
// これは soft reranker であって hard filter ではない（低スコアでも候補は落とさない＝メモリ「理論スコアはガードレール」）。
export function voiceLeadingPenalty(rep: VoiceLeadingReport | null): number {
  return rep
    ? 6 * (rep.parallelFifths + rep.parallelOctaves) + 3 * (rep.directFifths + rep.directOctaves) + 6 * rep.voiceCrossings
    : 0;
}

// 導音（tonicPc の半音下＝(tonicPc+11)%12）が半音上の主音へ解決しない箇所を数える純関数。
// 「導音→(半音上)主音」＝解決（0件）。下降/跳躍/同音での離脱＝未解決（+1）。
// atCadenceOnly=true（既定・安全側）＝各 onset 時刻のコードが V/V7/vii°（真のドミナント）区間のみ数える
//   ＝終止/属和音上の導音解決則に限定（旋律中間の経過的 7̂ 下行を無菌化しない）。chords 未渡し時は
//   ドミナント判定不能ゆえ 0（減点しない・全域カウントへは fallback しない＝安全側）。
// atCadenceOnly=false＝全域で導音未解決をカウント（オプトイン）。
export function leadingTonePenalty(
  upper: Note[],
  tonicPc: number,
  opts?: { atCadenceOnly?: boolean; chords?: { root?: number | string; quality?: string; start?: number; dur?: number }[] },
): number {
  const u = [...upper].filter((n) => Number.isFinite(n.pitch)).sort((a, b) => a.start - b.start);
  if (u.length < 2) return 0;
  const tpc = (((tonicPc % 12) + 12) % 12);
  const leadPc = (tpc + 11) % 12;
  const atCad = opts?.atCadenceOnly ?? true;
  const chords = opts?.chords ?? [];
  // 時刻 t のコードが「真のドミナント」か＝根音が調の5度(tpc+7)で長/属7、または根音が導音(leadPc)で dim/減。
  const isDominantAt = (t: number): boolean => {
    let c: { root?: number | string; quality?: string; start?: number; dur?: number } | null = null;
    for (const ch of chords) { const s = Number(ch.start ?? 0); const d = Number(ch.dur ?? 0); if (s <= t + 1e-6 && t < s + d + 1e-9) c = ch; }
    if (!c) return false;
    const root = ((Number(typeof c.root === "string" ? NaN : c.root) % 12) + 12) % 12;
    const q = (c.quality ?? "").toLowerCase();
    const isV = root === (tpc + 7) % 12 && (q === "" || q === "maj" || q === "7" || q === "9" || q === "maj7" || q === "13" || q.startsWith("7") || q.startsWith("9"));
    const isVii = root === leadPc && (q.includes("dim") || q.includes("m7b5") || q.includes("ø") || q.includes("°"));
    return isV || isVii;
  };
  let count = 0;
  for (let i = 0; i < u.length - 1; i++) {
    const pc = (((u[i]!.pitch % 12) + 12) % 12);
    if (pc !== leadPc) continue;
    if (atCad) { if (!chords.length) continue; if (!isDominantAt(u[i]!.start)) continue; }
    const resolved = u[i + 1]!.pitch - u[i]!.pitch === 1; // 半音上（＝主音）への解決のみ許容
    if (!resolved) count++;
  }
  return count;
}
