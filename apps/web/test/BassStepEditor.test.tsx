import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BassStepEditor } from "../src/components/BassStepEditor";

describe("BassStepEditor (#bass S2 相対度数グリッド)", () => {
  it("tapping an off cell sets degree R", async () => {
    const onChange = vi.fn();
    render(<BassStepEditor pattern={[]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("bass-0"));
    expect(onChange).toHaveBeenCalledWith([{ step: 0, degree: "R", dur: 1 }]);
  });

  it("cycles degree R→3 on subsequent taps", async () => {
    const onChange = vi.fn();
    render(<BassStepEditor pattern={[{ step: 0, degree: "R", dur: 1 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("bass-0"));
    expect(onChange).toHaveBeenCalledWith([{ step: 0, degree: "3", dur: 1 }]);
  });

  it("cycles approach→off (removes the step)", async () => {
    const onChange = vi.fn();
    render(<BassStepEditor pattern={[{ step: 2, degree: "approach", dur: 1 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("bass-2"));
    expect(onChange).toHaveBeenCalledWith([]); // approach の次は off
  });
});
