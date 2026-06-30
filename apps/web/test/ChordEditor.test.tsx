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

  it("拡張を足して quality 合成（m に 7 = m7・単発）", async () => {
    const onChange = vi.fn();
    render(
      <ChordEditor chords={[{ root: 0, quality: "m", start: 0, dur: 4 }]} onChange={onChange} />,
    );
    await userEvent.selectOptions(screen.getByLabelText("ext-0"), "7"); // m + 7 = m7
    expect(onChange).toHaveBeenLastCalledWith([{ root: 0, quality: "m7", start: 0, dur: 4 }]);
  });

  it("三和音を maj→m に変えると quality も追従（7th 維持 7→m7）", async () => {
    const onChange = vi.fn();
    render(
      <ChordEditor chords={[{ root: 0, quality: "7", start: 0, dur: 4 }]} onChange={onChange} />,
    );
    await userEvent.selectOptions(screen.getByLabelText("triad-0"), "m"); // C7 → Cm7
    expect(onChange).toHaveBeenLastCalledWith([{ root: 0, quality: "m7", start: 0, dur: 4 }]);
  });

  it("△で長7に＝ドミナント7→maj7（拡張7のまま△ON）", async () => {
    const onChange = vi.fn();
    render(
      <ChordEditor chords={[{ root: 0, quality: "7", start: 0, dur: 4 }]} onChange={onChange} />,
    );
    await userEvent.click(screen.getByLabelText("maj7-0")); // C7 → Cmaj7
    expect(onChange).toHaveBeenLastCalledWith([{ root: 0, quality: "maj7", start: 0, dur: 4 }]);
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

  it("付点ONで長さボタンが×1.5（1拍→1.5＝6/8の付点四分・#2）", async () => {
    const onChange = vi.fn();
    render(<ChordEditor chords={[{ root: 0, quality: "", start: 0, dur: 4 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("dotted")); // 付点 ON
    await userEvent.click(screen.getByLabelText("len-0-1")); // 1拍 ボタン
    expect(onChange).toHaveBeenCalledWith([{ root: 0, quality: "", start: 0, dur: 1.5 }]);
  });

  it("付点OFFは従来どおり（1拍=1）", async () => {
    const onChange = vi.fn();
    render(<ChordEditor chords={[{ root: 0, quality: "", start: 0, dur: 4 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("len-0-1"));
    expect(onChange).toHaveBeenCalledWith([{ root: 0, quality: "", start: 0, dur: 1 }]);
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
