// 連想エンジン 機構③：ハモ付け（メロ→合うコード候補）。学習不要のMySong型ベースライン。
// 小節ごとに、ダイアトニックコードを「その小節のメロ音をどれだけ支えるか」で採点し上位を返す。
// 注：質は進行間の遷移統計（コーパス）で上がる＝今はコーパス非依存の素朴版（confirm-list）。
import { type Note } from "./fit";
import { chordPcs } from "./theory";

export type ChordCandidate = { root: number; quality: string; score: number };
export type HarmonizeBar = { bar: number; start: number; candidates: ChordCandidate[] };

// ダイアトニック三和音（度数, 品質）。
const DIATONIC_MAJOR: [number, string][] = [[0, ""], [2, "m"], [4, "m"], [5, ""], [7, ""], [9, "m"], [11, "dim"]];
const DIATONIC_MINOR: [number, string][] = [[0, "m"], [2, "dim"], [3, ""], [5, "m"], [7, "m"], [8, ""], [10, ""]];

const onBeat = (s: number) => Math.abs(s - Math.round(s)) < 1e-6;

/** メロを小節（barBeats拍）ごとに区切り、各小節に合うダイアトニックコード候補を上位 top件返す。 */
export function harmonize(
  melody: Note[],
  key: number,
  opts: { mode?: "major" | "minor"; barBeats?: number; top?: number } = {},
): HarmonizeBar[] {
  const mode = opts.mode ?? "major";
  const barBeats = opts.barBeats ?? 4;
  const top = Math.max(1, opts.top ?? 3);
  const k = ((Math.trunc(key) % 12) + 12) % 12;
  const dia = mode === "minor" ? DIATONIC_MINOR : DIATONIC_MAJOR;
  const notes = (melody ?? [])
    .filter((n) => typeof n.pitch === "number")
    .sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0));
  if (!notes.length) return [];

  const lastEnd = Math.max(...notes.map((n) => Number(n.start ?? 0) + Number(n.dur ?? 1)));
  const nBars = Math.max(1, Math.ceil(lastEnd / barBeats));
  const out: HarmonizeBar[] = [];
  for (let b = 0; b < nBars; b++) {
    const lo = b * barBeats;
    const hi = lo + barBeats;
    const inBar = notes.filter((n) => Number(n.start ?? 0) >= lo && Number(n.start ?? 0) < hi);
    if (!inBar.length) continue;
    const weight = (n: Note) => Number(n.dur ?? 1) * (onBeat(Number(n.start ?? 0)) ? 1.5 : 1.0);
    const totalW = inBar.reduce((s, n) => s + weight(n), 0);
    const cands: ChordCandidate[] = dia.map(([deg, q]) => {
      const root = (deg + k) % 12;
      const tones = new Set(chordPcs(root, q));
      const covered = inBar.reduce((s, n) => s + (tones.has(((n.pitch % 12) + 12) % 12) ? weight(n) : 0), 0);
      return { root, quality: q, score: Math.round((totalW ? covered / totalW : 0) * 1000) / 1000 };
    });
    cands.sort((a, b2) => b2.score - a.score);
    out.push({ bar: b, start: lo, candidates: cands.slice(0, top) });
  }
  return out;
}
