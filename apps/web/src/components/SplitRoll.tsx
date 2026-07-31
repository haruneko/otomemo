// 割り方を「メロの概形」で描く（design §31-5・2026-07-31 設計ワークフロー統合＝案A のASCII図の置換）。
// MiniRoll と同じ矩形DNA（pitch×time）＋ドラムの拍格子。元onset＝メロ色(青)・足したonset＝歌詞色(黄)＋縦ティック。
// 時間軸は等尺（originBeat 基準＝splitRollGeom）＝全候補で拍列が縦に揃い、動くのは足した頭だけ＝縦スクロール比較が効く。
import { splitRollGeom } from "../lyricSplitCompose";
import type { Note } from "../music";

export function SplitRoll({
  notesAfter, origStarts, range, meter, lo, hi, variant = "row",
}: {
  notesAfter: Note[];
  origStarts: number[];
  range: { start: number; beats: number };
  meter: { beatsPerBar: number; gridPerBeat: number };
  lo: number;
  hi: number;
  variant?: "row" | "preview";
}) {
  const W = variant === "preview" ? 320 : 160;
  const H = variant === "preview" ? 44 : 30;
  const pad = 2;
  const g = splitRollGeom(notesAfter, origStarts, range, meter, lo, hi);
  if (!g.total) return null;
  const slotW = (W - pad * 2) / g.total;
  const addedCount = g.rects.filter((r) => r.isAdded).length;
  const tickHalf = variant === "preview" ? 6 : 4.5; // 矩形中心から上下へはみ出す量

  return (
    <svg
      className={"split-roll" + (variant === "preview" ? " preview" : "")}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-label={addedCount ? `${g.rects.length}音・${addedCount}箇所で割った形` : `${g.rects.length}音・割らない形`}
    >
      {/* 拍ガイド（小節線＝濃い／拍線＝薄い）。横伸縮でも1pxを保つ。 */}
      {g.beatLines.map((s) => (
        <line key={`bt${s}`} x1={pad + s * slotW} x2={pad + s * slotW} y1={0} y2={H} stroke="#3a3f49" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {g.barLines.map((s) => (
        <line key={`br${s}`} x1={pad + s * slotW} x2={pad + s * slotW} y1={0} y2={H} stroke="#5b6270" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {/* 音符矩形＋足した頭のティック。 */}
      {g.rects.map((r, i) => {
        const x = pad + r.x * slotW;
        const w = Math.max(r.w * slotW - 1, 1.5); // 切れ目ギャップ
        const y = pad + (1 - r.frac) * (H - pad * 2 - 3);
        const cy = y + 1.5;
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={3} rx={1} fill={r.isAdded ? "var(--k-lyric)" : "var(--k-melody)"} />
            {r.isAdded && (
              <line x1={x} x2={x} y1={cy - tickHalf} y2={cy + tickHalf} stroke="var(--k-lyric)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            )}
          </g>
        );
      })}
    </svg>
  );
}
