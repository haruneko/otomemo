import { useRef, useCallback } from "react";

// #29 P0-4 長押し検出フック（共通・P2 のドラム/コード楽器がチップ差し替えで再利用）。
// pointerdown で LONG_PRESS_MS 後に onFire(発火セルの DOMRect 付き)。
// pointermove>MOVE_TOL_PX / pointerup / pointercancel で解除。発火後は直後の click を1回抑制
// （タップ toggle と衝突させない）。contextmenu は preventDefault（モバイル長押しメニュー抑止）。
export const LONG_PRESS_MS = 450;
const MOVE_TOL_PX = 8;

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onClickCapture: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useLongPress(onFire: (anchor: DOMRect) => void): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false); // 発火済み＝直後 click を1回だけ食う

  const clear = useCallback(() => {
    if (timer.current != null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    startPos.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = e.currentTarget as HTMLElement;
      startPos.current = { x: e.clientX, y: e.clientY };
      fired.current = false;
      if (timer.current != null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        onFire(el.getBoundingClientRect());
      }, LONG_PRESS_MS);
    },
    [onFire],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = startPos.current;
      if (!s) return;
      if (Math.abs(e.clientX - s.x) > MOVE_TOL_PX || Math.abs(e.clientY - s.y) > MOVE_TOL_PX) clear();
    },
    [clear],
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (fired.current) {
      // 長押しが発火した直後の click（タップ扱い）を1回だけ握り潰す。
      e.preventDefault();
      e.stopPropagation();
      fired.current = false;
    }
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    onClickCapture,
    onContextMenu,
  };
}
