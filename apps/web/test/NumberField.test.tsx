import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { NumberField } from "../src/components/NumberField";

function Harness({ initial = 120 }: { initial?: number }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <NumberField aria-label="n" value={v} onChange={setV} />
      <span data-testid="val">{v}</span>
    </>
  );
}

describe("NumberField (#71)", () => {
  it("allows clearing to empty without inserting 0", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("n") as HTMLInputElement;
    await userEvent.clear(input);
    expect(input.value).toBe(""); // 0 が居座らない
    // 空の間は onChange を発火しない＝外部値は最後の有効値のまま
    expect(screen.getByTestId("val").textContent).toBe("120");
  });

  it("commits a typed number and reverts empty on blur", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("n") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "90");
    expect(screen.getByTestId("val").textContent).toBe("90");

    await userEvent.clear(input);
    fireEvent.blur(input);
    await waitFor(() => expect(input.value).toBe("90")); // 空のままblur→元値に戻す
  });

  it("does not call onChange with NaN/empty", async () => {
    const onChange = vi.fn();
    render(<NumberField aria-label="n" value={5} onChange={onChange} />);
    const input = screen.getByLabelText("n");
    await userEvent.clear(input); // 空→onChange呼ばない
    expect(onChange).not.toHaveBeenCalled();
  });
});
