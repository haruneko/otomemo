import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RhythmEditor } from "../src/components/RhythmEditor";
import { LONG_PRESS_MS } from "../src/useHoldDrag";

if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === "undefined") {
  (globalThis as { PointerEvent?: unknown }).PointerEvent = class extends MouseEvent {} as unknown;
}

describe("RhythmEditor", () => {
  afterEach(() => vi.useRealTimers());

  it("toggles a hit on (tap-place unchanged)", async () => {
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
    expect(screen.getAllByLabelText(/^hit-Kick-/).length).toBe(12);
    expect(screen.getByLabelText("hit-Kick-0").className).toContain("bar");
    expect(screen.getByLabelText("hit-Kick-3").className).toContain("beat");
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
    expect(screen.getByLabelText("hit-Snare-0").style.getPropertyValue("--hv")).toBe(String(70 / 127));
    expect(screen.getByLabelText("hit-Snare-4").style.getPropertyValue("--hv")).toBe(String(124 / 127));
    expect(screen.getByLabelText("hit-Snare-1").style.getPropertyValue("--hv")).toBe("");
  });

  // #29 §9 長押し→上ドラッグ（強く）→離すと velCurve へ accent を1回 onChange。
  it("long-press → drag up commits an accent into velCurve (single onChange)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Snare", midi: 38, hits: [0, 4] }] }}
        onChange={onChange}
      />,
    );
    const cell = screen.getByLabelText("hit-Snare-4");
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 40 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(cell.className).toContain("lift"); // 持ち上がり
    fireEvent.pointerMove(cell, { clientX: 10, clientY: 10 }); // 上 30px → 105+18=123（accent デテント）
    fireEvent.pointerUp(cell);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      steps: 16,
      lanes: [{ name: "Snare", midi: 38, hits: [0, 4], velCurve: [105, 123] }],
    });
  });

  // #29 §9 長押し→下ドラッグ（弱く=ghost28）。
  it("long-press → drag down commits a ghost velocity", () => {
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
    fireEvent.pointerMove(cell, { clientX: 10, clientY: 138 }); // 下 128px → 105-76.8≈28 → ghost28 デテントへ吸着
    fireEvent.pointerUp(cell);
    expect(onChange).toHaveBeenCalledWith({
      steps: 16,
      lanes: [{ name: "Snare", midi: 38, hits: [0, 4], velCurve: [105, 28] }],
    });
  });

  // #29 §9 長押し→右ドラッグ（連打）→ divs[step]=2 を1回 onChange。
  it("long-press → drag right commits divs[step]=2", () => {
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
    fireEvent.pointerMove(cell, { clientX: 10 + 44, clientY: 10 }); // 右 1段 → 2連
    fireEvent.pointerUp(cell);
    expect(onChange).toHaveBeenCalledWith({
      steps: 16,
      lanes: [{ name: "Snare", midi: 38, hits: [0, 4], divs: { "4": 2 } }],
    });
  });

  it("live-previews the dragged cell (--hv + div class) before release", () => {
    vi.useFakeTimers();
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Snare", midi: 38, hits: [0, 4] }] }}
        onChange={vi.fn()}
      />,
    );
    const cell = screen.getByLabelText("hit-Snare-4");
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.pointerMove(cell, { clientX: 10 + 44, clientY: 10 }); // 右 → 2連
    expect(cell.className).toContain("div2");
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

  it("long-press an empty cell is a no-op (no lift, no onChange)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Snare", midi: 38, hits: [0] }] }}
        onChange={onChange}
      />,
    );
    const empty = screen.getByLabelText("hit-Snare-5");
    fireEvent.pointerDown(empty, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(empty.className).not.toContain("lift");
    fireEvent.pointerUp(empty);
    expect(onChange).not.toHaveBeenCalled();
  });

  // #29 §9 ⌫消しゴム：なぞりで velCurve+divs ごと一掃（elementFromPoint 追跡）。
  it("eraser mode: swipe erases the hit and clears its velCurve/divs together", () => {
    const onChange = vi.fn();
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Snare", midi: 38, hits: [0, 4], velCurve: [70, 124], divs: { "4": 2 } }] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("mode-erase")); // 消しゴムへ
    const cell = screen.getByLabelText("hit-Snare-4");
    // jsdom には elementFromPoint が無い＝なぞり追跡が指すセルをスタブで固定。
    const orig = (document as { elementFromPoint?: unknown }).elementFromPoint;
    (document as { elementFromPoint?: unknown }).elementFromPoint = vi.fn(() => cell);
    fireEvent.pointerDown(cell, { clientX: 5, clientY: 5 }); // グリッドへバブル→eraseAt
    // step4 の hit・velCurve[1]・divs["4"] が同時に消える。step0(velCurve 70) は残る。
    expect(onChange).toHaveBeenCalledWith({
      steps: 16,
      lanes: [{ name: "Snare", midi: 38, hits: [0], velCurve: [70] }],
    });
    expect("divs" in (onChange.mock.calls[0]![0] as { lanes: object[] }).lanes[0]!).toBe(false);
    (document as { elementFromPoint?: unknown }).elementFromPoint = orig;
  });
});
