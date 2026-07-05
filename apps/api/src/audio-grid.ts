// アナリーゼ・ワークベンチの拍/小節グリッド。実ビート時刻＋アンカー＋拍子から bar:beat を導出する土台。
// #S10。まず downbeat 位相の自動推定（「コード変化は小節頭に乗りやすい」を利用＝自動が最善・ダメなら人が手動）。

/** 時刻 t に最も近いビートの index。beatTimes は昇順前提。 */
export function nearestBeatIndex(beatTimes: number[], t: number): number {
  if (beatTimes.length === 0) return -1;
  let best = 0, bd = Infinity;
  for (let i = 0; i < beatTimes.length; i++) {
    const d = Math.abs(beatTimes[i]! - t);
    if (d < bd) { bd = d; best = i; } else if (beatTimes[i]! > t && d > bd) break; // 昇順＝離れ始めたら打切り
  }
  return best;
}

/**
 * downbeat 位相の自動推定：コード変化時刻を最寄ビートに割当て、位相 p(0..meter-1) のうち
 * 「(beatIdx - p) % meter === 0（＝小節頭）」に乗るコード変化が最多の p を返す。＝小節頭アンカーの初期値。
 * データ不足なら 0。
 */
export function autoDownbeatOffset(beatTimes: number[], chordChangeTimes: number[], meter: number): number {
  if (meter < 1 || beatTimes.length < meter || chordChangeTimes.length === 0) return 0;
  const idxs = chordChangeTimes.map((t) => nearestBeatIndex(beatTimes, t)).filter((i) => i >= 0);
  let bestP = 0, bestScore = -1;
  for (let p = 0; p < meter; p++) {
    let score = 0;
    for (const idx of idxs) if ((((idx - p) % meter) + meter) % meter === 0) score++;
    if (score > bestScore) { bestScore = score; bestP = p; }
  }
  return bestP;
}
