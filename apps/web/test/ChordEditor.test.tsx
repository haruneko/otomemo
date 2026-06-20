import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChordEditor } from "../src/components/ChordEditor";

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
});
