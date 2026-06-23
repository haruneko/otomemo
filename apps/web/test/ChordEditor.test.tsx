import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChordEditor } from "../src/components/ChordEditor";

afterEach(() => vi.useRealTimers());

describe("ChordEditor", () => {
  it("adds a chord with ＋コード", async () => {
    const onChange = vi.fn();
    render(<ChordEditor chords={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "＋コード" }));
    expect(onChange).toHaveBeenCalledWith([{ root: 0, quality: "", start: 0, dur: 4 }]);
  });

  it("changes a chord's quality", async () => {
    const onChange = vi.fn();
    render(
      <ChordEditor chords={[{ root: 0, quality: "", start: 0, dur: 4 }]} onChange={onChange} />,
    );
    await userEvent.selectOptions(screen.getByLabelText("quality-0"), "m7");
    expect(onChange).toHaveBeenCalledWith([{ root: 0, quality: "m7", start: 0, dur: 4 }]);
  });

  it("removes a chord", async () => {
    const onChange = vi.fn();
    render(
      <ChordEditor chords={[{ root: 0, quality: "", start: 0, dur: 4 }]} onChange={onChange} />,
    );
    await userEvent.click(screen.getByLabelText("remove-chord-0"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("長さボタンで dur を変え、start は順番から自動フローする（CV1）", async () => {
    const onChange = vi.fn();
    render(
      <ChordEditor
        chords={[
          { root: 0, quality: "", start: 0, dur: 4 },
          { root: 7, quality: "", start: 4, dur: 4 },
        ]}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByLabelText("len-0-2")); // 1つ目を2拍に
    // 1つ目 dur=2 → 2つ目 start は自動で 2 に詰まる（手入力でない）
    expect(onChange).toHaveBeenCalledWith([
      { root: 0, quality: "", start: 0, dur: 2 },
      { root: 7, quality: "", start: 2, dur: 4 },
    ]);
  });

  it("highlights the chord under the playhead beat while playing (#76)", () => {
    vi.useFakeTimers();
    const chords = [
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 7, quality: "", start: 4, dur: 4 },
    ];
    const beatRef = { current: 5 }; // 2つ目のコード(4..8)内
    const { container } = render(
      <ChordEditor chords={chords} onChange={() => {}} beatRef={beatRef} playing />,
    );
    act(() => {
      vi.advanceTimersByTime(120);
    });
    const rows = container.querySelectorAll(".chord-row");
    expect(rows[0]!.className).not.toContain("playing");
    expect(rows[1]!.className).toContain("playing");
  });
});
