import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RhythmEditor } from "../src/components/RhythmEditor";

describe("RhythmEditor", () => {
  it("toggles a hit on", async () => {
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
});
