import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChordPatternEditor } from "../src/components/ChordPatternEditor";
import type { ChordPatternContent } from "../src/music";
import { LONG_PRESS_MS } from "../src/useLongPress";

if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === "undefined") {
  (globalThis as { PointerEvent?: unknown }).PointerEvent = class extends MouseEvent {} as unknown;
}

const pat = (over: Partial<ChordPatternContent> = {}): ChordPatternContent => ({
  mode: "strum",
  voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 },
  steps: 16,
  hits: [{ step: 0, dur: 4 }],
  ...over,
});

describe("ChordPatternEditor #29 P2-4 long-press velocity", () => {
  it("long-press an onset → 強く writes vel=112 on that hit", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    fireEvent.pointerDown(screen.getByLabelText("hit-0"), { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.click(screen.getByRole("menuitem", { name: "強く" }));
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [{ step: 0, dur: 4, vel: 112 }] }));
    vi.useRealTimers();
  });

  it("long-press → 弱く writes vel=64; re-select 弱く toggles back to normal (no vel key)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ hits: [{ step: 0, dur: 4, vel: 64 }] })} onChange={onChange} />);
    fireEvent.pointerDown(screen.getByLabelText("hit-0"), { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.click(screen.getByRole("menuitem", { name: "弱く" }));
    // 既に 64（弱く点灯）→ 再選択で普通へ＝vel キーごと落とす。
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [{ step: 0, dur: 4 }] }));
    expect("vel" in (onChange.mock.calls[0]![0] as ChordPatternContent).hits[0]!).toBe(false);
    vi.useRealTimers();
  });

  it("long-press → 消す removes the hit (delete path)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    fireEvent.pointerDown(screen.getByLabelText("hit-0"), { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.click(screen.getByRole("menuitem", { name: "消す" }));
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [] }));
    vi.useRealTimers();
  });

  it("long-press on a non-onset (empty) cell is a no-op (no popover)", () => {
    vi.useFakeTimers();
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} />);
    fireEvent.pointerDown(screen.getByLabelText("hit-8"), { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(screen.queryByRole("menuitem")).toBeNull();
    vi.useRealTimers();
  });

  it("tap places a new hit (place path unchanged)", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ hits: [] })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("hit-4"));
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [{ step: 4, dur: 4 }] }));
  });
});

afterEach(() => vi.useRealTimers());
