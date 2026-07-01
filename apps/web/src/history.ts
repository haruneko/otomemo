// エディタ Undo/Redo の純ロジック（design 決定U1）。値T＝編集内容のスナップショット想定。
// past=戻れる履歴（古い→新しい）／future=やり直せる履歴。
import { useCallback, useEffect, useRef, useState } from "react";

export interface History<T> {
  past: T[];
  future: T[];
}
export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] });

const CAP = 50; // 履歴の深さ上限

/** 変化直前の snapshot を past へ積む（future はクリア＝分岐したら redo 不可）。 */
export function pushHistory<T>(h: History<T>, prev: T, cap = CAP): History<T> {
  const past = [...h.past, prev];
  while (past.length > cap) past.shift();
  return { past, future: [] };
}

/** undo：現在を future へ退避し、past 末尾（1つ前）を復元値として返す。空なら null。 */
export function undoHistory<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.past.length) return null;
  const value = h.past[h.past.length - 1]!;
  return { history: { past: h.past.slice(0, -1), future: [...h.future, current] }, value };
}

/** redo：現在を past へ、future 末尾を復元値として返す。空なら null。 */
export function redoHistory<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.future.length) return null;
  const value = h.future[h.future.length - 1]!;
  return { history: { past: [...h.past, current], future: h.future.slice(0, -1) }, value };
}

// --- React hook：controlled な snapshot を履歴管理（design 決定U1・US2） ---
// current＝毎レンダ算出する編集内容の束、apply＝snapshot を各 setState へ流し戻す関数。
// resetKey（例 neta.id）が変わったら履歴をリセット（別ネタに切替＝undo対象外）。
export function useEditHistory<T>(
  current: T,
  apply: (v: T) => void,
  opts?: { resetKey?: unknown; cap?: number; equal?: (a: T, b: T) => boolean },
) {
  const equal = opts?.equal ?? ((a: T, b: T) => JSON.stringify(a) === JSON.stringify(b));
  const [hist, setHist] = useState<History<T>>(emptyHistory);
  const applying = useRef(false); // undo/redo 適用中は記録しない
  const prev = useRef(current);
  const resetKey = opts?.resetKey;

  // resetKey 変化＝別ネタ：履歴クリア＋基準を現在へ（切替を編集として記録しない）
  useEffect(() => {
    setHist(emptyHistory());
    prev.current = current;
    applying.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // 毎レンダ：変化を検知して直前 snapshot を積む（適用中はスキップ）
  useEffect(() => {
    if (applying.current) {
      applying.current = false;
      prev.current = current;
      return;
    }
    if (!equal(prev.current, current)) {
      const before = prev.current;
      setHist((h) => pushHistory(h, before, opts?.cap));
      prev.current = current;
    }
  });

  const undo = useCallback(() => {
    const r = undoHistory(hist, current);
    if (!r) return;
    applying.current = true;
    setHist(r.history);
    apply(r.value);
  }, [hist, current, apply]);

  const redo = useCallback(() => {
    const r = redoHistory(hist, current);
    if (!r) return;
    applying.current = true;
    setHist(r.history);
    apply(r.value);
  }, [hist, current, apply]);

  return { undo, redo, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0 };
}
