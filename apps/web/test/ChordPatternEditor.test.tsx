import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChordPatternEditor } from "../src/components/ChordPatternEditor";
import type { ChordPatternContent } from "../src/music";
import { LONG_PRESS_MS } from "../src/useHoldDrag";

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

describe("ChordPatternEditor #29 §9 hold-drag velocity (vertical only)", () => {
  afterEach(() => vi.useRealTimers());

  it("long-press an onset → drag up commits vel=112 (accent detent) on that hit", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    const cell = screen.getByLabelText("hit-0");
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 40 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(cell.className).toContain("lift");
    fireEvent.pointerMove(cell, { clientX: 10, clientY: 20 }); // 上 20px → 100+12=112（accent デテント）
    fireEvent.pointerUp(cell);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [{ step: 0, dur: 4, vel: 112 }] }));
  });

  it("long-press → drag down commits vel=64 (soft detent)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    const cell = screen.getByLabelText("hit-0");
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.pointerMove(cell, { clientX: 10, clientY: 70 }); // 下 60px → 100-36=64（soft デテント）
    fireEvent.pointerUp(cell);
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [{ step: 0, dur: 4, vel: 64 }] }));
  });

  it("drag back to base (100) drops the vel key (bit)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ hits: [{ step: 0, dur: 4, vel: 64 }] })} onChange={onChange} />);
    const cell = screen.getByLabelText("hit-0");
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    // 開始 vel=64、上 60px（dy=-60）→ 64+36=100（普通デテント）→ 確定で vel キー削除。
    fireEvent.pointerMove(cell, { clientX: 10, clientY: -50 });
    fireEvent.pointerUp(cell);
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [{ step: 0, dur: 4 }] }));
    expect("vel" in (onChange.mock.calls[0]![0] as ChordPatternContent).hits[0]!).toBe(false);
  });

  it("horizontal drag is ignored (subdivision belongs to arp axis)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    const cell = screen.getByLabelText("hit-0");
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.pointerMove(cell, { clientX: 10 + 88, clientY: 10 }); // 横だけ動かしても vel は 100（普通）
    fireEvent.pointerUp(cell);
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [{ step: 0, dur: 4 }] })); // vel なし＝普通
  });

  it("long-press on a non-onset (empty) cell is a no-op", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    const empty = screen.getByLabelText("hit-8");
    fireEvent.pointerDown(empty, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(empty.className).not.toContain("lift");
    fireEvent.pointerUp(empty);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("tap places a new hit (place grammar unchanged)", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ hits: [] })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("hit-4"));
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [{ step: 4, dur: 4 }] }));
  });

  it("tap on an onset head deletes it (delete grammar unchanged)", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("hit-0"));
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [] }));
  });
});
