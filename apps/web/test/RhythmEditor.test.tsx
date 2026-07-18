import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RhythmEditor } from "../src/components/RhythmEditor";
import { LONG_PRESS_MS } from "../src/useLongPress";

if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === "undefined") {
  (globalThis as { PointerEvent?: unknown }).PointerEvent = class extends MouseEvent {} as unknown;
}

describe("RhythmEditor", () => {
  it("toggles a hit on", async () => {
    const onChange = vi.fn();
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [] }] }}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByLabelText("hit-Kick-0"));
    expect(onChange).toHaveBeenCalledWith({
      steps: 16,
      lanes: [{ name: "Kick", midi: 36, hits: [0] }],
    });
  });

  it("toggles a hit off", async () => {
    const onChange = vi.fn();
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }] }}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByLabelText("hit-Kick-0"));
    expect(onChange).toHaveBeenCalledWith({
      steps: 16,
      lanes: [{ name: "Kick", midi: 36, hits: [] }],
    });
  });

  // #29 P0-3 12格子（三連）導出＝beatsPerStep で格子を content 優先に。
  it("derives a 12-step grid from beatsPerStep (4/4 shuffle) — beat marks every 3 steps", () => {
    render(
      <RhythmEditor
        rhythm={{ steps: 12, beatsPerStep: 0.333, lanes: [{ name: "Kick", midi: 36, hits: [0, 3, 6, 9] }] }}
        onChange={vi.fn()}
        meter="4/4"
      />,
    );
    // 12 セル（従来 4/4 は 16）＝格子が三連へ。
    expect(screen.getAllByLabelText(/^hit-Kick-/).length).toBe(12);
    expect(screen.getByLabelText("hit-Kick-0").className).toContain("bar"); // 小節頭
    expect(screen.getByLabelText("hit-Kick-3").className).toContain("beat"); // 1拍=3step
    expect(screen.getByLabelText("hit-Kick-1").className).not.toContain("beat");
  });

  it("beatsPerStep absent ⇒ 4/4 stays 16 cells (bit display)", () => {
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [] }] }}
        onChange={vi.fn()}
        meter="4/4"
      />,
    );
    expect(screen.getAllByLabelText(/^hit-Kick-/).length).toBe(16);
  });

  // #29 P0-3 セル濃淡＝on セルに --hv(=vel/127) が乗る。
  it("shades on-cells with --hv from velocity", () => {
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Snare", midi: 38, hits: [0, 4], velCurve: [70, 124] }] }}
        onChange={vi.fn()}
      />,
    );
    const soft = screen.getByLabelText("hit-Snare-0");
    const loud = screen.getByLabelText("hit-Snare-4");
    expect(soft.style.getPropertyValue("--hv")).toBe(String(70 / 127));
    expect(loud.style.getPropertyValue("--hv")).toBe(String(124 / 127));
    // off セルは --hv を持たない。
    expect(screen.getByLabelText("hit-Snare-1").style.getPropertyValue("--hv")).toBe("");
  });

  // #29 P0-4 長押し→ポップオーバー→［強く］で accent を velCurve へ書く。
  it("long-press a hit → 強く writes an accent into velCurve", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Snare", midi: 38, hits: [0, 4] }] }}
        onChange={onChange}
      />,
    );
    const cell = screen.getByLabelText("hit-Snare-4");
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    // ポップオーバーの［強く］。
    const accent = screen.getByRole("menuitem", { name: "強く" });
    fireEvent.click(accent);
    expect(onChange).toHaveBeenCalledWith({
      steps: 16,
      lanes: [{ name: "Snare", midi: 38, hits: [0, 4], velCurve: [105, 123] }], // base 105, +18=123
    });
    vi.useRealTimers();
  });

  // #29 P2 長押し→［2連］で divs[step]=2 を書く（点灯トグル）。
  it("long-press a hit → 2連 writes divs[step]=2", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Snare", midi: 38, hits: [0, 4] }] }}
        onChange={onChange}
      />,
    );
    fireEvent.pointerDown(screen.getByLabelText("hit-Snare-4"), { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.click(screen.getByRole("menuitem", { name: "2連" }));
    expect(onChange).toHaveBeenCalledWith({
      steps: 16,
      lanes: [{ name: "Snare", midi: 38, hits: [0, 4], divs: { "4": 2 } }],
    });
    vi.useRealTimers();
  });

  // #29 P2 分割セルは div2/div3 クラスで縦バー描画。
  it("renders div2/div3 class on subdivided cells", () => {
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Snare", midi: 38, hits: [0, 4, 8], divs: { "4": 2, "8": 3 } }] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("hit-Snare-4").className).toContain("div2");
    expect(screen.getByLabelText("hit-Snare-8").className).toContain("div3");
    expect(screen.getByLabelText("hit-Snare-0").className).not.toContain("div");
  });

  // #29 P2 ［消す］＝hit OFF（divs も掃除）。
  it("long-press → 消す removes the hit and its divs", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Snare", midi: 38, hits: [0, 4], divs: { "4": 2 } }] }}
        onChange={onChange}
      />,
    );
    fireEvent.pointerDown(screen.getByLabelText("hit-Snare-4"), { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.click(screen.getByRole("menuitem", { name: "消す" }));
    expect(onChange).toHaveBeenCalledWith({
      steps: 16,
      lanes: [{ name: "Snare", midi: 38, hits: [0] }],
    });
    vi.useRealTimers();
  });

  it("long-press an empty cell is a no-op (no popover)", () => {
    vi.useFakeTimers();
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Snare", midi: 38, hits: [0] }] }}
        onChange={vi.fn()}
      />,
    );
    const empty = screen.getByLabelText("hit-Snare-5");
    fireEvent.pointerDown(empty, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(screen.queryByRole("menuitem")).toBeNull();
    vi.useRealTimers();
  });
});

afterEach(() => vi.useRealTimers());
