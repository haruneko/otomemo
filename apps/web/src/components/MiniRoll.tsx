import { useEffect, useState } from "react";
import { notesForContent } from "../music";
import { api, type Neta, type CompositionNode } from "../api";

// #48: カードにメロ/コード/ベース/リズムの概形（小さなピアノロール）を出す。音楽以外は何も描かない。
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

// 1小節の拍数（meter "n/d"→ num*4/den）。SectionEditor.beatsPerBar のミラー（dnd依存を持ち込まない）。
function bpbOf(meter?: string | null): number {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
  if (!m) return 4;
  const n = Number(m[1]);
  const d = Number(m[2]);
  return n > 0 && d > 0 ? (n * 4) / d : 4;
}

// ④(2026-07-03) section/song カードの中身プレビュー＝レーン帯のミニ・タイムライン。
// どのパートがどの小節に入ってるかを帯で図示（編集画面タイムラインの縮小版）＋小節数。
// 子は getComposition を表示時に遅延取得（container カードのみ・数は少ない）。
const MINI_LANES: { label: string; kinds: string[] }[] = [
  { label: "メロ", kinds: ["melody"] },
  { label: "コード", kinds: ["chord", "chord_progression", "chord_pattern"] },
  { label: "ベース", kinds: ["bass"] },
  { label: "リズム", kinds: ["rhythm"] },
];
const MINI_BARS_CAP = 16; // カードに出す最大小節（超過は帯を切って小節数で示す）

export function SectionMini({ neta }: { neta: Neta }) {
  const [children, setChildren] = useState<CompositionNode["children"] | null>(null);
  useEffect(() => {
    let live = true;
    void api
      .getComposition(neta.id)
      .then((t) => live && setChildren(t?.children ?? []))
      .catch(() => live && setChildren([]));
    return () => {
      live = false;
    };
  }, [neta.id]);

  if (!children) return null; // 取得前は何も出さない（レイアウト揺れを避ける）
  if (!children.length) return <p className="section-mini-empty muted">（空・タップで組む）</p>;

  const bpb = bpbOf(neta.meter);
  const durOf = (c: CompositionNode["children"][number]) => {
    const ns = notesForContent(c.node.neta.kind, c.node.neta.content);
    return ns.length ? Math.max(...ns.map((n) => n.start + n.dur)) : bpb;
  };
  const endBeat = Math.max(bpb, ...children.map((c) => c.position + durOf(c)));
  const bars = Math.max(1, Math.ceil(endBeat / bpb));
  const shown = Math.min(bars, MINI_BARS_CAP);
  const lanes = MINI_LANES.map((lane) => {
    const cells = new Array(shown).fill(false);
    for (const c of children) {
      if (!lane.kinds.includes(c.node.neta.kind)) continue;
      const s = Math.max(0, Math.floor(c.position / bpb));
      const e = Math.ceil((c.position + durOf(c)) / bpb);
      for (let b = s; b < e && b < shown; b++) cells[b] = true;
    }
    return { label: lane.label, cells, any: cells.some(Boolean) };
  });
  return (
    <div className="section-mini" aria-label="section-preview">
      {lanes.map((l) => (
        <div className={"sm-lane" + (l.any ? "" : " empty")} key={l.label}>
          <span className="sm-label">{l.label}</span>
          <span className="sm-cells">
            {l.cells.map((on, i) => (
              <span key={i} className={"sm-cell" + (on ? " on" : "")} />
            ))}
          </span>
        </div>
      ))}
      <span className="sm-bars muted">{bars}小節</span>
    </div>
  );
}
