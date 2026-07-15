import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PianoRoll } from "../src/components/PianoRoll";

describe("PianoRoll", () => {
  it("adds a note on cell click (default length = 1 beat)", async () => {
    const onChange = vi.fn();
    render(<PianoRoll notes={[]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("cell-60-0"));
    expect(onChange).toHaveBeenCalledWith([{ pitch: 60, start: 0, dur: 1 }]);
  });

  it("removes a note when clicking its bar", async () => {
    const onChange = vi.fn();
    render(<PianoRoll notes={[{ pitch: 60, start: 0, dur: 1 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("note-60-0"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("removes a covering note when clicking its cell (edits off-grid notes)", async () => {
    const onChange = vi.fn();
    render(<PianoRoll notes={[{ pitch: 60, start: 0, dur: 2 }]} onChange={onChange} />);
    // cell-60-4 = step 4 = beat 1, inside the note span [0,2) -> toggles it off
    await userEvent.click(screen.getByLabelText("cell-60-4"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("erase mode: note tap deletes, empty cell does nothing (④)", async () => {
    const onChange = vi.fn();
    render(<PianoRoll notes={[{ pitch: 60, start: 0, dur: 1 }]} onChange={onChange} mode="erase" />);
    // 空セルは無反応（描くと違い足さない）
    await userEvent.click(screen.getByLabelText("cell-62-0"));
    expect(onChange).not.toHaveBeenCalled();
    // ノートtapで削除
    await userEvent.click(screen.getByLabelText("note-60-0"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("labels rows with a fixed piano keyboard (note names)", () => {
    render(<PianoRoll notes={[]} onChange={vi.fn()} />);
    expect(screen.getByText("C4")).toBeInTheDocument();
    expect(screen.getByText("C5")).toBeInTheDocument();
  });

  it("shows out-of-range and sub-beat notes faithfully (see = play)", () => {
    render(<PianoRoll notes={[{ pitch: 88, start: 1.5, dur: 0.5 }]} onChange={vi.fn()} />);
    // pitch 88 is above the default C4-B5 window; it must still be visible
    expect(screen.getByLabelText("note-88-1.5")).toBeInTheDocument();
  });

  // --- 歌詞をノート上に描画（別レーン廃止・オーナーFB直結） ---
  it("draws the syllable inside the note rect (no separate lyric lane)", () => {
    render(<PianoRoll notes={[{ pitch: 60, start: 0, dur: 1, syllable: "そ" }]} onChange={vi.fn()} enableLyric />);
    const note = screen.getByLabelText("note-60-0");
    expect(note).toHaveTextContent("そ"); // 歌詞は音符矩形内
    expect(document.querySelector(".proll-note-syl")?.textContent).toBe("そ");
    // 旧・下段の別レーンは廃止
    expect(screen.queryByLabelText("lyrics")).toBeNull();
    expect(document.querySelector(".proll-lyric-lane")).toBeNull();
  });

  it("puts prosody hit onto the note's bottom border (fit-red) with an info mark", () => {
    // 「は→し」を上行(60→64)で歌う＝A-01 赤（lyricFit）。hit は idx1 の音符側へ。
    render(
      <PianoRoll
        notes={[
          { pitch: 60, start: 0, dur: 1, syllable: "は" },
          { pitch: 64, start: 1, dur: 1, syllable: "し" },
        ]}
        onChange={vi.fn()}
        enableLyric
      />,
    );
    expect(screen.getByLabelText("note-64-1").className).toContain("fit-red");
    expect(screen.getByLabelText("note-60-0").className).not.toContain("fit-red");
    // 理由アイコン（ⓘ）が hit 音符に付く＝タップで理由バナー
    expect(screen.getByLabelText("fit-info-1")).toBeInTheDocument();
  });

  it("hit info mark tap opens the reason banner without editing the note", async () => {
    const onChange = vi.fn();
    render(
      <PianoRoll
        notes={[
          { pitch: 60, start: 0, dur: 1, syllable: "は" },
          { pitch: 64, start: 1, dur: 1, syllable: "し" },
        ]}
        onChange={onChange}
        enableLyric
      />,
    );
    await userEvent.click(screen.getByLabelText("fit-info-1"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("A-01");
    expect(onChange).not.toHaveBeenCalled(); // 編集tapと競合しない（stopPropagation）
  });

  // ※♪歌うボタンは撤去（仮歌の入れ方はメロの楽器＝仮歌に集約）。旧 sing-button テストは削除。

  // --- 詞モード（歌詞リタッチ）---
  it("lyric mode: note tap opens retouch input with current syllable, does NOT delete the note", async () => {
    const onChange = vi.fn();
    render(
      <PianoRoll
        notes={[{ pitch: 60, start: 0, dur: 1, syllable: "あ" }]}
        onChange={onChange}
        enableLyric
        mode="lyric"
      />,
    );
    // 流し込み行は詞モード中は出ない（リタッチバーに切替・分業）
    expect(screen.queryByLabelText("lyric-draft")).toBeNull();
    expect(screen.getByLabelText("lyric-retouch")).toHaveTextContent("音符をタップして歌詞を編集");
    await userEvent.click(screen.getByLabelText("note-60-0"));
    expect(onChange).not.toHaveBeenCalled(); // 削除しない（ノート編集無効化）
    expect(screen.getByLabelText("syllable-input")).toHaveValue("あ");
  });

  it("lyric mode: commit updates syllable and auto-advances to the next note (time order)", async () => {
    const onChange = vi.fn();
    render(
      <PianoRoll
        notes={[
          { pitch: 60, start: 0, dur: 1, syllable: "あ" },
          { pitch: 62, start: 1, dur: 1, syllable: "い" },
        ]}
        onChange={onChange}
        enableLyric
        mode="lyric"
      />,
    );
    await userEvent.click(screen.getByLabelText("note-60-0"));
    const input = screen.getByLabelText("syllable-input");
    await userEvent.clear(input);
    await userEvent.type(input, "か");
    await userEvent.click(screen.getByLabelText("syllable-commit"));
    // idx0 の syllable が「か」へ（他は不変）
    expect(onChange).toHaveBeenCalledWith([
      { pitch: 60, start: 0, dur: 1, syllable: "か" },
      { pitch: 62, start: 1, dur: 1, syllable: "い" },
    ]);
    // 次の音符（1拍・い）へ自動フォーカス＝入力欄の値が次の syllable に
    expect(screen.getByLabelText("syllable-input")).toHaveValue("い");
  });

  it("lyric mode: empty commit clears the syllable; last note ends editing", async () => {
    const onChange = vi.fn();
    render(
      <PianoRoll
        notes={[{ pitch: 60, start: 0, dur: 1, syllable: "あ" }]}
        onChange={onChange}
        enableLyric
        mode="lyric"
      />,
    );
    await userEvent.click(screen.getByLabelText("note-60-0"));
    await userEvent.clear(screen.getByLabelText("syllable-input"));
    await userEvent.click(screen.getByLabelText("syllable-commit"));
    const out = onChange.mock.calls[0]![0] as { syllable?: string }[];
    expect(out[0]!.syllable).toBeUndefined(); // 空確定＝クリア
    // 最後の音符＝次が無いので編集終了（ヒントに戻る）
    expect(screen.queryByLabelText("syllable-input")).toBeNull();
  });

  it("lyric mode: cell tap does not create a note (note editing disabled)", async () => {
    const onChange = vi.fn();
    render(<PianoRoll notes={[]} onChange={onChange} enableLyric mode="lyric" />);
    await userEvent.click(screen.getByLabelText("cell-60-0"));
    expect(onChange).not.toHaveBeenCalled();
  });

});
