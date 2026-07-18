import { useCallback, useRef } from "react";

// #29 §9 ホールドドラッグ hook（旧 useLongPress の進化形）。
// 打点を LONG_PRESS_MS 静止で長押し発火→そのまま押し続けて縦＝強さ / 横＝連打をドラッグ、離して確定。
// 状態機械 idle → pending（450ms タイマ待ち）→ captured（発火・setPointerCapture）。
//  - pending 中に MOVE_TOL_PX 超で動く＝スクロールへ譲って解除（ネイティブ横スクロール優先）。
//  - captured 中は縦 dy→velocity（0.6vel/px・磁石デテント ±SNAP_VEL）、横 dx→div（44px/段・相対）。
//  - 発火直後の click（タップ toggle）は1回だけ握り潰す（onClickCapture）。contextmenu は preventDefault。
// 急所：captured 中だけ native touchmove を preventDefault してネイティブスクロールを止める
//   （React 合成イベントは passive:false 指定不可＝ref コールバックで addEventListener・passive:false）。
export const LONG_PRESS_MS = 450;
const MOVE_TOL_PX = 8; // 発火前の許容移動＝これ超でスクロールへ譲る
const VEL_PER_PX = 0.6; // 縦感度：100px ≒ 60vel
const DIV_PX = 44; // 横1段＝親指幅（縦調整の指ブレで誤発火しない粗さ）
const SNAP_VEL = 6; // 磁石デテント吸着幅（±6 vel）

const clamp = (lo: number, hi: number, x: number) => Math.max(lo, Math.min(hi, x));

// 発火時に呼び側が返す開始状態。detents=[ghost, base, accent] 等の磁石点（縦スナップ）。
export interface HoldDragStart {
  vel: number;
  div: number; // 1=単発・2/3=分割（現在値）
  detents: number[];
}
// ドラッグ中の解決値（絶対）。detentHit=この move でデテントに乗った／divChanged=連打段が変わった（プレビュー音の合図）。
export interface HoldDragState {
  vel: number;
  div: number;
  detentHit: boolean;
  divChanged: boolean;
}
export interface HoldDragOpts {
  axis: "xy" | "y"; // "y"＝縦のみ（コード楽器＝分割は arp 軸へ委譲）
  onFire: (anchor: DOMRect) => HoldDragStart | null; // null＝キャプチャしない（空セル等）
  onDrag: (s: HoldDragState) => void;
  onCommit: (s: { vel: number; div: number }) => void;
  onCancel: () => void;
}
export interface HoldDragHandlers {
  ref: (el: HTMLElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onClickCapture: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useHoldDrag(opts: HoldDragOpts): HoldDragHandlers {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const elRef = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const captured = useRef(false);
  const startState = useRef<HoldDragStart | null>(null);
  const last = useRef<{ vel: number; div: number } | null>(null);
  const fired = useRef(false); // 発火済み＝直後 click を1回だけ食う

  // captured 中のみ preventDefault する native touchmove（安定参照＝ref で付け外し）。
  const touchMove = useRef<((e: TouchEvent) => void) | undefined>(undefined);
  if (!touchMove.current) touchMove.current = (e: TouchEvent) => { if (captured.current) e.preventDefault(); };

  const ref = useCallback((el: HTMLElement | null) => {
    const prev = elRef.current;
    if (prev && prev !== el) prev.removeEventListener("touchmove", touchMove.current!);
    elRef.current = el;
    if (el) el.addEventListener("touchmove", touchMove.current!, { passive: false });
  }, []);

  const clearTimer = useCallback(() => {
    if (timer.current != null) { clearTimeout(timer.current); timer.current = null; }
    startPos.current = null;
  }, []);

  const endCapture = useCallback((commit: boolean) => {
    captured.current = false;
    const el = elRef.current;
    const p = startPos.current;
    if (el && p) { try { el.releasePointerCapture(p.pointerId); } catch { /* jsdom / 未対応 */ } }
    const st = startState.current;
    const l = last.current ?? (st ? { vel: st.vel, div: st.div } : { vel: 0, div: 1 });
    last.current = null;
    startState.current = null;
    startPos.current = null;
    if (commit) { fired.current = true; optsRef.current.onCommit(l); }
    else optsRef.current.onCancel();
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    elRef.current = el;
    startPos.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    captured.current = false;
    fired.current = false;
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const st = optsRef.current.onFire(el.getBoundingClientRect());
      if (!st) return; // 空セル等＝持ち上げない（誤爆防止）
      captured.current = true;
      startState.current = st;
      last.current = { vel: st.vel, div: st.div };
      const p = startPos.current;
      if (p) { try { el.setPointerCapture(p.pointerId); } catch { /* jsdom / 未対応 */ } }
      optsRef.current.onDrag({ vel: st.vel, div: st.div, detentHit: false, divChanged: false });
    }, LONG_PRESS_MS);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const p = startPos.current;
    if (!p) return;
    if (captured.current) {
      const st = startState.current!;
      const dy = e.clientY - p.y;
      const dx = e.clientX - p.x;
      let vel = Math.round(clamp(1, 127, st.vel - dy * VEL_PER_PX));
      for (const d of st.detents) { if (Math.abs(vel - d) <= SNAP_VEL) { vel = d; break; } } // 磁石デテント
      const div = optsRef.current.axis === "xy" ? clamp(1, 3, st.div + Math.trunc(dx / DIV_PX)) : st.div;
      const prev = last.current ?? { vel: st.vel, div: st.div };
      const detentHit = vel !== prev.vel && st.detents.includes(vel);
      const divChanged = div !== prev.div;
      last.current = { vel, div };
      optsRef.current.onDrag({ vel, div, detentHit, divChanged });
    } else if (
      timer.current != null &&
      (Math.abs(e.clientX - p.x) > MOVE_TOL_PX || Math.abs(e.clientY - p.y) > MOVE_TOL_PX)
    ) {
      clearTimer(); // 動いた＝発火前ならスクロールに譲る
    }
  }, [clearTimer]);

  const onPointerUp = useCallback(() => {
    if (captured.current) endCapture(true);
    else clearTimer();
  }, [endCapture, clearTimer]);

  const onPointerCancel = useCallback(() => {
    if (captured.current) endCapture(false);
    else clearTimer();
  }, [endCapture, clearTimer]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (fired.current) {
      // 長押しドラッグ確定直後の click（タップ扱い）を1回だけ握り潰す。
      e.preventDefault();
      e.stopPropagation();
      fired.current = false;
    }
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => { e.preventDefault(); }, []);

  return { ref, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture, onContextMenu };
}
