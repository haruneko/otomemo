import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useHoldDrag, LONG_PRESS_MS, type HoldDragState, type HoldDragStart } from "../src/useHoldDrag";

// jsdom の PointerEvent は clientX/Y を init から拾わない（拾う MouseEvent で代替）＝座標移動を検証可能に。
if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === "undefined") {
  (globalThis as { PointerEvent?: unknown }).PointerEvent = class extends MouseEvent {} as unknown;
}

function Probe({
  onFire,
  onDrag,
  onCommit,
  onCancel,
  onClick,
  fireResult = { vel: 100, div: 1, detents: [28, 100, 118] },
  axis = "xy" as const,
}: {
  onFire?: () => void;
  onDrag?: (s: HoldDragState) => void;
  onCommit?: (s: { vel: number; div: number }) => void;
  onCancel?: () => void;
  onClick?: () => void;
  fireResult?: HoldDragStart | null;
  axis?: "xy" | "y";
}) {
  const hd = useHoldDrag({
    axis,
    onFire: () => {
      onFire?.();
      return fireResult;
    },
    onDrag: (s) => onDrag?.(s),
    onCommit: (s) => onCommit?.(s),
    onCancel: () => onCancel?.(),
  });
  return (
    <button aria-label="cell" onClick={onClick} {...hd}>
      cell
    </button>
  );
}

describe("#29 §9 useHoldDrag", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires (captures) after the threshold on a stationary press", () => {
    const onFire = vi.fn();
    const onDrag = vi.fn();
    render(<Probe onFire={onFire} onDrag={onDrag} />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    expect(onFire).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onFire).toHaveBeenCalledTimes(1);
    // 発火直後に開始値で onDrag を1回（HUD/プレビュー初期化）。
    expect(onDrag).toHaveBeenCalledWith({ vel: 100, div: 1, detentHit: false, divChanged: false });
  });

  it("does not capture when onFire returns null (empty cell)", () => {
    const onDrag = vi.fn();
    render(<Probe fireResult={null} onDrag={onDrag} />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onDrag).not.toHaveBeenCalled();
  });

  it("cancels the pending timer on move > 8px (scroll wins)", () => {
    const onFire = vi.fn();
    render(<Probe onFire={onFire} />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(el, { clientX: 30, clientY: 10 }); // 20px 動いた
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onFire).not.toHaveBeenCalled();
  });

  it("vertical drag maps to velocity (0.6/px) with magnetic detents, commits once on release", () => {
    const onDrag = vi.fn();
    const onCommit = vi.fn();
    render(<Probe onDrag={onDrag} onCommit={onCommit} />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 40 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    // 上へ 30px（dy=-30）→ 100 + 30*0.6 = 118 → デテント 118（accent）へスナップ。
    fireEvent.pointerMove(el, { clientX: 10, clientY: 10 });
    const lastDrag = onDrag.mock.calls.at(-1)![0] as HoldDragState;
    expect(lastDrag.vel).toBe(118);
    expect(lastDrag.detentHit).toBe(true);
    expect(lastDrag.div).toBe(1);
    fireEvent.pointerUp(el);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ vel: 118, div: 1 });
  });

  it("horizontal drag steps subdivision (44px/step, relative) on axis=xy", () => {
    const onCommit = vi.fn();
    render(<Probe onCommit={onCommit} axis="xy" />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.pointerMove(el, { clientX: 10 + 44, clientY: 10 }); // +1 段 → div 2
    fireEvent.pointerUp(el);
    expect(onCommit).toHaveBeenCalledWith({ vel: 100, div: 2 });
  });

  it("axis=y ignores horizontal delta (chord = vertical only)", () => {
    const onCommit = vi.fn();
    render(<Probe onCommit={onCommit} axis="y" />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.pointerMove(el, { clientX: 10 + 88, clientY: 10 }); // 横 2段ぶん動かしても
    fireEvent.pointerUp(el);
    expect(onCommit).toHaveBeenCalledWith({ vel: 100, div: 1 }); // div は 1 のまま
  });

  it("pointercancel reverts (onCancel, no commit)", () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(<Probe onCommit={onCommit} onCancel={onCancel} />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.pointerCancel(el);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("suppresses the click that follows a fired/committed drag", () => {
    const onClick = vi.fn();
    render(<Probe onClick={onClick} />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.pointerUp(el);
    fireEvent.click(el); // 確定直後の click は握り潰される
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not suppress a normal tap (no long-press)", () => {
    const onClick = vi.fn();
    const onFire = vi.fn();
    render(<Probe onClick={onClick} onFire={onFire} />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(el);
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onFire).not.toHaveBeenCalled();
  });
});
