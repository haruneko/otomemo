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
});
