import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChordEditor } from "../src/components/ChordEditor";

afterEach(() => vi.useRealTimers());

describe("ChordEditor（折り返しブロックタイムライン・#26）", () => {
  it("末尾の＋（追加）でコードを足す＝直前の複製→reflow", async () => {
    const onChange = vi.fn();
    render(<ChordEditor chords={[{ root: 0, quality: "", start: 0, dur: 4 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("chord-append"));
    // insertAt(chords, len)＝末尾を複製（root0/quality""/dur4 → 同じ）＋reflow。
    expect(onChange).toHaveBeenCalledWith([
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 0, quality: "", start: 4, dur: 4 },
    ]);
  });

  it("空状態＝初手ガイド（place-first-chord / pick-progression）を出す。タイムラインは出さない", () => {
    const onChange = vi.fn();
    render(<ChordEditor chords={[]} onChange={onChange} />);
    expect(screen.getByLabelText("place-first-chord")).toBeInTheDocument();
    expect(screen.queryByLabelText("chord-timeline")).toBeNull();
    expect(screen.queryByLabelText("chord-append")).toBeNull();
  });

  it("ブロックをタップ→シートで拡張を足して quality 合成（m に 7 = m7）", async () => {
    const onChange = vi.fn();
    render(<ChordEditor chords={[{ root: 0, quality: "m", start: 0, dur: 4 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("block-0")); // シートを開く
    await userEvent.selectOptions(screen.getByLabelText("sheet-ext"), "7"); // m + 7 = m7
    expect(onChange).toHaveBeenLastCalledWith([{ root: 0, quality: "m7", start: 0, dur: 4 }]);
  });

  it("シートで三和音 maj→m（7th 維持 7→m7）", async () => {
    const onChange = vi.fn();
    render(<ChordEditor chords={[{ root: 0, quality: "7", start: 0, dur: 4 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("block-0"));
    await userEvent.selectOptions(screen.getByLabelText("sheet-triad"), "m"); // C7 → Cm7
    expect(onChange).toHaveBeenLastCalledWith([{ root: 0, quality: "m7", start: 0, dur: 4 }]);
  });

  it("シートで三和音 maj＝C7(空欄)→Cmaj7(maj)", async () => {
    const onChange = vi.fn();
    render(<ChordEditor chords={[{ root: 0, quality: "7", start: 0, dur: 4 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("block-0"));
    await userEvent.selectOptions(screen.getByLabelText("sheet-triad"), "maj"); // C7 → Cmaj7
    expect(onChange).toHaveBeenLastCalledWith([{ root: 0, quality: "maj7", start: 0, dur: 4 }]);
  });

  it("消しゴムモード：ブロックをタップ→削除（removeAt→reflow）", async () => {
    const onChange = vi.fn();
    render(
      <ChordEditor
        chords={[{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }]}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByLabelText("mode-erase")); // 消しゴムへ
    await userEvent.click(screen.getByLabelText("block-0")); // 1つ目を外す
    expect(onChange).toHaveBeenCalledWith([{ root: 7, quality: "", start: 0, dur: 4 }]);
  });

  it("シートの削除ボタンでも消せる", async () => {
    const onChange = vi.fn();
    render(<ChordEditor chords={[{ root: 0, quality: "", start: 0, dur: 4 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("block-0"));
    await userEvent.click(screen.getByLabelText("sheet-delete"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("シートの長さボタンで dur を変え、start は順番から自動フロー", async () => {
    const onChange = vi.fn();
    render(
      <ChordEditor
        chords={[{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }]}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByLabelText("block-0"));
    await userEvent.click(screen.getByLabelText("sheet-len-2")); // 1つ目を2拍に
    expect(onChange).toHaveBeenCalledWith([
      { root: 0, quality: "", start: 0, dur: 2 },
      { root: 7, quality: "", start: 2, dur: 4 },
    ]);
  });

  it("シートの付点ボタンで長さ×1.5（1拍→1.5）", async () => {
    const onChange = vi.fn();
    render(<ChordEditor chords={[{ root: 0, quality: "", start: 0, dur: 1 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("block-0"));
    await userEvent.click(screen.getByLabelText("sheet-dot"));
    expect(onChange).toHaveBeenLastCalledWith([{ root: 0, quality: "", start: 0, dur: 1.5 }]);
  });

  it("＋シーム挿入＝境界に直前コードを複製→reflowで以降を右送り", async () => {
    const onChange = vi.fn();
    render(
      <ChordEditor
        chords={[{ root: 0, quality: "maj7", start: 0, dur: 4 }, { root: 7, quality: "7", start: 4, dur: 2 }]}
        onChange={onChange}
      />,
    );
    // block-0 の右境界＝seam-1（コード0と1の間）。直前=chords[0] を複製。
    await userEvent.click(screen.getByLabelText("seam-1"));
    expect(onChange).toHaveBeenCalledWith([
      { root: 0, quality: "maj7", start: 0, dur: 4 },
      { root: 0, quality: "maj7", start: 4, dur: 4 }, // duplicate of chord0
      { root: 7, quality: "7", start: 8, dur: 2 },
    ]);
  });

  it("空状態＝『よく使う進行から選ぶ』で定番進行を流し込む（#6）", async () => {
    const onChange = vi.fn();
    render(<ChordEditor chords={[]} onChange={onChange} />);
    expect(screen.queryByLabelText("popular-progressions")).toBeNull();
    await userEvent.click(screen.getByLabelText("pick-progression"));
    expect(screen.getByLabelText("popular-progressions")).toBeTruthy();
    await userEvent.click(screen.getByLabelText("prog-王道 I–V–vi–IV"));
    expect(onChange).toHaveBeenCalledWith([
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 7, quality: "", start: 4, dur: 4 },
      { root: 9, quality: "m", start: 8, dur: 4 },
      { root: 5, quality: "", start: 12, dur: 4 },
    ]);
  });

  it("空状態＝『最初のコードを置く』で1コード追加（#6）", async () => {
    const onChange = vi.fn();
    render(<ChordEditor chords={[]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("place-first-chord"));
    expect(onChange).toHaveBeenCalledWith([{ root: 0, quality: "", start: 0, dur: 4 }]);
  });

  it("再生中はプレイヘッド下のブロックが .playing（#76）", () => {
    vi.useFakeTimers();
    const chords = [
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 7, quality: "", start: 4, dur: 4 },
    ];
    const beatRef = { current: 5 }; // 2つ目のコード(4..8)内
    render(<ChordEditor chords={chords} onChange={() => {}} beatRef={beatRef} playing />);
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.getByLabelText("block-0").className).not.toContain("playing");
    expect(screen.getByLabelText("block-1").className).toContain("playing");
  });
});
