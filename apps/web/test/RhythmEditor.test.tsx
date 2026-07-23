import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { RhythmEditor } from "../src/components/RhythmEditor";
import { LONG_PRESS_MS } from "../src/useHoldDrag";
import { useEditHistory } from "../src/history";
import type { RhythmContent } from "../src/music";

// 修理#3 決定④「（改）」帯（S5）＝apply で patternEdited が解除される流れを検証するため api/playback を stub。
// 帯を開いて候補取得しない大半のテストには無影響（api は fetch 時のみ呼ばれる）。
const api = vi.hoisted(() => ({ music: vi.fn(), listNeta: vi.fn() }));
vi.mock("../src/api", () => ({ api }));
vi.mock("../src/playback", () => ({ startPlayback: vi.fn(async () => null) }));

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

// 修理#3 決定④（S5）：patternId 持ちネタを手編集したら patternEdited を立て帯に「（改）」。
// patternId 無しネタは新キーが生えない＝bit 一致。apply（置換）で（改）は自然消滅。kit（音色メタ）では付与しない。
describe("RhythmEditor 手編集の（改）フラグ（修理#3 決定④）", () => {
  afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

  const withPid: RhythmContent = { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [] }], patternId: "four.rock" };

  it("手編集（patternId 有り・toggle）→ patternEdited:true 付与", async () => {
    const onChange = vi.fn();
    render(<RhythmEditor rhythm={withPid} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("hit-Kick-0"));
    expect(onChange).toHaveBeenCalledWith({
      steps: 16,
      lanes: [{ name: "Kick", midi: 36, hits: [0] }],
      patternId: "four.rock",
      patternEdited: true,
    });
  });

  it("手編集（patternId 有り・setBars 小節数）→ patternEdited:true 付与", async () => {
    const onChange = vi.fn();
    render(<RhythmEditor rhythm={withPid} onChange={onChange} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("bars-inc"));
    const arg = onChange.mock.calls[0]![0] as RhythmContent;
    expect(arg.steps).toBe(32);
    expect(arg.patternEdited).toBe(true);
    expect(arg.patternId).toBe("four.rock");
  });

  it("手編集（patternId 有り・eraseで消す）→ patternEdited:true 付与", () => {
    const onChange = vi.fn();
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }], patternId: "four.rock" }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("mode-erase"));
    const cell = screen.getByLabelText("hit-Kick-0");
    const orig = (document as { elementFromPoint?: unknown }).elementFromPoint;
    (document as { elementFromPoint?: unknown }).elementFromPoint = vi.fn(() => cell);
    fireEvent.pointerDown(cell, { clientX: 5, clientY: 5 });
    expect((onChange.mock.calls[0]![0] as RhythmContent).patternEdited).toBe(true);
    (document as { elementFromPoint?: unknown }).elementFromPoint = orig;
  });

  it("手編集（patternId 無し）→ patternEdited は生えない（bit 一致）", async () => {
    const onChange = vi.fn();
    render(
      <RhythmEditor
        rhythm={{ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [] }] }}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByLabelText("hit-Kick-0"));
    const arg = onChange.mock.calls[0]![0] as RhythmContent;
    expect("patternEdited" in arg).toBe(false);
    expect(arg).toEqual({ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }] });
  });

  it("kit（音色メタ）変更では patternEdited は付かない", () => {
    const onChange = vi.fn();
    render(<RhythmEditor rhythm={withPid} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("drum-kit"), { target: { value: "8" } });
    const arg = onChange.mock.calls[0]![0] as RhythmContent;
    expect("patternEdited" in arg).toBe(false);
    expect(arg.kit).toBe(8);
    expect(arg.patternId).toBe("four.rock");
  });

  it("帯見出し＝patternEdited 有りで「いま：<型>（改）」／無しは型名のみ", () => {
    const { rerender } = render(<RhythmEditor rhythm={withPid} onChange={vi.fn()} />);
    expect(screen.getByLabelText("pattern-now").textContent).toBe("いま：four.rock");
    rerender(<RhythmEditor rhythm={{ ...withPid, patternEdited: true }} onChange={vi.fn()} />);
    expect(screen.getByLabelText("pattern-now").textContent).toBe("いま：four.rock（改）");
  });

  it("patternId 無しネタは（改）どころか「いま：」帯自体が出ない", () => {
    render(<RhythmEditor rhythm={{ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }] }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("pattern-now")).toBeNull();
  });

  it("apply（候補で置換）で patternEdited は自然消滅（（改）解除）", async () => {
    // 候補＝patternId 有り・patternEdited 無しの rhythm（Task2/L3：出所はライブラリネタ＝listNeta）。
    api.listNeta.mockResolvedValue([
      { id: "r1", kind: "rhythm", title: "eight.beat", text: null, scope: "library", tags: [], key: 0, mode: null, tempo: null, meter: null, bars: null, mood: null, created: "", updated: "",
        content: { rhythm: { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0, 4, 8, 12] }], patternId: "eight.beat" } } },
    ]);
    const user = userEvent.setup();

    function Harness() {
      const [r, setR] = useState<RhythmContent>({ ...withPid, patternEdited: true });
      const hist = useEditHistory(r, setR, { resetKey: "x" });
      return (
        <>
          <RhythmEditor rhythm={r} onChange={setR} meter="4/4" tempo={120} />
          <button aria-label="undo" onClick={hist.undo}>undo</button>
          <span aria-label="now">{screenNow(r)}</span>
        </>
      );
    }
    render(<Harness />);

    // 初期は（改）付き。
    expect(screen.getByLabelText("pattern-now").textContent).toBe("いま：four.rock（改）");

    await user.click(screen.getByLabelText("pattern-picker-toggle"));
    await user.click(await screen.findByLabelText("import-pick-0"));

    // patternId は差し替わり patternEdited は消える＝「（改）」解除。
    expect(screen.getByLabelText("pattern-now").textContent).toBe("いま：eight.beat");
    expect(screen.getByLabelText("now").textContent).toBe("eight.beat");
  });
});

// Harness 用の小ヘルパ（patternEdited の有無を可視化）。
function screenNow(r: RhythmContent): string {
  return (r.patternId ?? "none") + (r.patternEdited ? "-edited" : "");
}
