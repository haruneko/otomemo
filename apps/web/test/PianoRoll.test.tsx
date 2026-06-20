import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PianoRoll } from "../src/components/PianoRoll";

describe("PianoRoll", () => {
  it("adds a note on cell click", async () => {
    const onChange = vi.fn();
    render(<PianoRoll notes={[]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("pitch-60-beat-0"));
    expect(onChange).toHaveBeenCalledWith([{ pitch: 60, start: 0, dur: 1 }]);
  });

  it("labels rows with a fixed piano keyboard (note names)", () => {
    render(<PianoRoll notes={[]} onChange={vi.fn()} />);
    expect(screen.getByText("C4")).toBeInTheDocument();
    expect(screen.getByText("C5")).toBeInTheDocument();
  });

  it("removes a note when toggling an existing cell", async () => {
    const onChange = vi.fn();
    render(<PianoRoll notes={[{ pitch: 60, start: 0, dur: 1 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("pitch-60-beat-0"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
