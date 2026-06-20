import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createNeta } = vi.hoisted(() => ({
  createNeta: vi.fn().mockResolvedValue({ id: "x", kind: "lyric" }),
}));
vi.mock("../src/api", () => ({
  KINDS: ["lyric", "melody", "theme"],
  api: { createNeta },
}));

import { Capture } from "../src/components/Capture";

describe("Capture", () => {
  it("submits body + tags as a neta and notifies", async () => {
    const onCreated = vi.fn();
    render(<Capture onCreated={onCreated} />);
    await userEvent.type(screen.getByLabelText("body"), "夜を駆ける");
    await userEvent.type(screen.getByLabelText("tags"), "サビ 疾走");
    await userEvent.click(screen.getByRole("button", { name: "放り込む" }));

    expect(createNeta).toHaveBeenCalledWith({
      kind: "lyric",
      text: "夜を駆ける",
      tags: ["サビ", "疾走"],
    });
    expect(onCreated).toHaveBeenCalled();
  });

  it("does not submit when body is empty", async () => {
    render(<Capture />);
    expect(screen.getByRole("button", { name: "放り込む" })).toBeDisabled();
  });
});
