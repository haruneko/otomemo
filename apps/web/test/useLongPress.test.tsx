import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useLongPress, LONG_PRESS_MS } from "../src/useLongPress";

// jsdom の PointerEvent は clientX/Y を init から拾わない（拾う MouseEvent で代替）＝座標移動を検証可能に。
if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === "undefined") {
  (globalThis as { PointerEvent?: unknown }).PointerEvent = class extends MouseEvent {} as unknown;
}

function Probe({ onFire, onClick }: { onFire: () => void; onClick?: () => void }) {
  const lp = useLongPress(() => onFire());
  return (
    <button aria-label="cell" onClick={onClick} {...lp}>
      cell
    </button>
  );
}

describe("#29 P0-4 useLongPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires after the threshold on a stationary press", () => {
    const onFire = vi.fn();
    render(<Probe onFire={onFire} />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    expect(onFire).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("cancels on move > 8px", () => {
    const onFire = vi.fn();
    render(<Probe onFire={onFire} />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(el, { clientX: 30, clientY: 10 }); // 20px 動いた
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onFire).not.toHaveBeenCalled();
  });

  it("cancels on pointer up before threshold", () => {
    const onFire = vi.fn();
    render(<Probe onFire={onFire} />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(200));
    fireEvent.pointerUp(el);
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onFire).not.toHaveBeenCalled();
  });

  it("suppresses the click that follows a fired long-press", () => {
    const onFire = vi.fn();
    const onClick = vi.fn();
    render(<Probe onFire={onFire} onClick={onClick} />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.click(el); // 発火直後の click は握り潰される
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not suppress a normal click (no long-press)", () => {
    const onFire = vi.fn();
    const onClick = vi.fn();
    render(<Probe onFire={onFire} onClick={onClick} />);
    const el = screen.getByLabelText("cell");
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(el);
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onFire).not.toHaveBeenCalled();
  });
});
