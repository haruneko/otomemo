import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StepPad } from "../src/components/StepPad";

describe("StepPad (#35 パッドステップ)", () => {
  it("tapping a cell emits a note at that pitch/step", async () => {
    const onChange = vi.fn();
    render(<StepPad notes={[]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("pad-72-4")); // C5, step4 → start 1.0
    expect(onChange).toHaveBeenCalledWith([{ pitch: 72, start: 1, dur: 0.25 }]);
  });

  it("tapping an existing cell removes it", async () => {
    const onChange = vi.fn();
    render(<StepPad notes={[{ pitch: 72, start: 1, dur: 0.25 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("pad-72-4"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
