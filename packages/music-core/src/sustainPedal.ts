// サステインペダル（CC64）を「鳴っている長さ」へ解く純関数（再生の直前だけで使う・content と書き出しは延ばさない）。
// 正典＝docs/design.md「サステインペダル（CC64）の持ち方」。
// 規則（MIDI の通常のサステイン）：
//   - ペダルを踏んでいる間に離鍵した音（窓の頭 < 離鍵 < 窓の終わり）は、ペダルを離す時刻まで鳴らす。
//   - 同じ高さを弾き直したら、延ばしていた前の音はそこで止める。
//   - 延ばすだけで縮めない（押さえている間の音は触らない）。窓の頭ちょうどに離鍵した音は延ばさない。

export interface PedalWindow { start: number; dur: number }

const EPS = 1e-9;

/** notes と窓は同じ時間軸（拍）。返りは入力と同じ順・延ばさない音は同じ参照。 */
export function resolveSustainPedal<T extends { pitch: number; start: number; dur: number }>(
  notes: readonly T[],
  windows: readonly PedalWindow[] | null | undefined,
): T[] {
  if (!windows || !windows.length) return notes.slice();
  const nextSame = new Map<number, number>(); // 音の番号 → 同じ高さの次の打鍵の時刻
  const byPitch = new Map<number, number[]>();
  notes.forEach((n, i) => { const a = byPitch.get(n.pitch); if (a) a.push(i); else byPitch.set(n.pitch, [i]); });
  for (const idx of byPitch.values()) {
    for (const i of idx) {
      let t = Infinity;
      for (const j of idx) if (notes[j]!.start > notes[i]!.start + EPS && notes[j]!.start < t) t = notes[j]!.start;
      nextSame.set(i, t);
    }
  }
  return notes.map((n, i) => {
    const release = n.start + n.dur;
    const w = windows.find((p) => release > p.start + EPS && release < p.start + p.dur - EPS);
    if (!w) return n;
    const end = Math.min(w.start + w.dur, nextSame.get(i)!);
    return end > release + EPS ? { ...n, dur: end - n.start } : n;
  });
}

/** 重なる・接する窓を合わせて start 昇順に（書き出しで同じトラックに複数の窓の列があるとき）。 */
export function mergePedalWindows(windows: readonly PedalWindow[]): PedalWindow[] {
  const xs = windows.filter((w) => w.dur > 0).map((w) => ({ s: w.start, e: w.start + w.dur })).sort((a, b) => a.s - b.s);
  const out: { s: number; e: number }[] = [];
  for (const x of xs) {
    const last = out[out.length - 1];
    if (last && x.s <= last.e + EPS) last.e = Math.max(last.e, x.e);
    else out.push({ ...x });
  }
  return out.map((x) => ({ start: x.s, dur: x.e - x.s }));
}
