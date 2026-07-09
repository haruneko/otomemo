import { useEffect, type RefObject } from "react";

// 開いているポップ/メニューを「外タップ」「Esc」で閉じる（ドッグフード：ボタン自身しか閉じないのが不便・2026-07-09）。
// ref は**トグルボタンとポップを両方含む要素**に張る＝ボタン自身のタップは「内側」扱いになり、
// ボタンの onClick(トグル)と二重発火しない。open=false の間はリスナを張らない（無駄と誤爆を防ぐ）。
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const el = ref.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // pointerdown はボタンの click より前＝外側なら閉じ、内側(ボタン含む)なら何もしない。
    // capture で他ハンドラの stopPropagation に邪魔されにくくする。
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, ref]);
}
