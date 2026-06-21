import { notesForContent } from "../music";
import type { Neta } from "../api";

// #48: カードにメロ/コード/リズムの概形（小さなピアノロール）を出す。音楽以外は何も描かない。
export function MiniRoll({ neta }: { neta: Neta }) {
  // 相対bass は単体プレビュー＝neta の key を tonic に解決（#bass S2）。
  const notes = notesForContent(neta.kind, neta.content, { key: neta.key ?? 0 });
  if (!notes.length) return null;
  const W = 160;
  const H = 30;
  const pad = 2;
  const maxT = Math.max(...notes.map((n) => n.start + n.dur), 1);
  const ps = notes.map((n) => n.pitch);
  const lo = Math.min(...ps);
  const hi = Math.max(...ps);
  const span = Math.max(hi - lo, 1);
  return (
    <svg
      className="mini-roll"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-label="mini-preview"
    >
      {notes.map((n, i) => {
        const x = pad + (n.start / maxT) * (W - pad * 2);
        const w = Math.max((n.dur / maxT) * (W - pad * 2), 1.5);
        const y = pad + (1 - (n.pitch - lo) / span) * (H - pad * 2 - 3);
        return <rect key={i} x={x} y={y} width={w} height={3} rx={1} />;
      })}
    </svg>
  );
}
