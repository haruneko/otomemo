import { type CSSProperties } from "react";
import { createPortal } from "react-dom";

// #29 §9 指上 HUD（ホールドドラッグ中の読み出し・旧 CellPopover の後継）。
// 弱く/普通/強く のラベル＋実 vel 値＋n連バッジ（div>1）＋デテント目盛メータ。
// セル直上・中央寄せの fixed（グリッドは横スクロールするので getBoundingClientRect 基準）。
function velWord(vel: number, base: number, detents: number[]): string {
  if (detents.length >= 3) {
    if (vel === detents[0]) return "弱く";
    if (vel === detents[2]) return "強く";
  }
  if (vel === base) return "普通";
  return vel < base ? "弱め" : "強め";
}

export function DragHud({
  anchor,
  vel,
  div,
  base,
  detents,
  color = "var(--k, var(--accent))",
}: {
  anchor: DOMRect;
  vel: number;
  div: number;
  base: number;
  detents: number[];
  color?: string;
}) {
  const left = Math.max(74, Math.min(anchor.left + anchor.width / 2, window.innerWidth - 74));
  const top = Math.max(56, anchor.top - 12);
  const style = { position: "fixed", left, top, "--kk": color } as CSSProperties;
  return createPortal(
    <div className="drag-hud" role="status" aria-hidden="true" style={style}>
      <span className="hud-label">
        {velWord(vel, base, detents)}
        <span className="hud-num">{vel}</span>
        {div > 1 && <span className="hud-div">{div === 2 ? "2連" : "3連"}</span>}
      </span>
      <div className="hud-meter">
        <div className="hud-fill" style={{ width: `${(vel / 127) * 100}%` }} />
        {detents.map((d, i) => (
          <span key={i} className="hud-tick" style={{ left: `${(d / 127) * 100}%` }} />
        ))}
      </div>
    </div>,
    document.body,
  );
}
