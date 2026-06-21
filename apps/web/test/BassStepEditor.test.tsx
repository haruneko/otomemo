import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BassStepEditor } from "../src/components/BassStepEditor";

describe("BassStepEditor (#bass S2 度数レーン×ステップ)", () => {
  it("tapping a lane cell places that degree with selected length (既定8分=2step)", async () => {
    const onChange = vi.fn();
    render(<BassStepEditor pattern={[]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("bass-3-0")); // 3度レーンの step0
    expect(onChange).toHaveBeenCalledWith([{ step: 0, degree: "3", dur: 2 }]);
  });

  it("tapping an active cell removes it", async () => {
    const onChange = vi.fn();
    render(<BassStepEditor pattern={[{ step: 0, degree: "R", dur: 2 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("bass-R-0"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("is monophonic: placing in another lane at the same step replaces", async () => {
    const onChange = vi.fn();
    render(<BassStepEditor pattern={[{ step: 0, degree: "R", dur: 2 }]} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("bass-5-0")); // 同 step0 に 5度
    expect(onChange).toHaveBeenCalledWith([{ step: 0, degree: "5", dur: 2 }]); // R は消える
  });

  it("length tool changes the placed duration", async () => {
    const onChange = vi.fn();
    render(<BassStepEditor pattern={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "4" })); // 4分=4step
    await userEvent.click(screen.getByLabelText("bass-R-0"));
    expect(onChange).toHaveBeenCalledWith([{ step: 0, degree: "R", dur: 4 }]);
  });
});
