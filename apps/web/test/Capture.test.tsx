import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { outboxCount } from "../src/outbox";

const { createNeta } = vi.hoisted(() => ({ createNeta: vi.fn() }));
vi.mock("../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api")>();
  return { ...actual, api: { createNeta } };
});

import { Capture } from "../src/components/Capture";
import { ApiError } from "../src/api";

beforeEach(() => {
  localStorage.clear();
  createNeta.mockReset();
});

describe("Capture", () => {
  it("submits body + tags as a neta and notifies", async () => {
    createNeta.mockResolvedValue({ id: "x", kind: "lyric" });
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

  it("disables submit when body is empty", () => {
    render(<Capture />);
    expect(screen.getByRole("button", { name: "放り込む" })).toBeDisabled();
  });

  it("queues to outbox on network error", async () => {
    createNeta.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Capture />);
    await userEvent.type(screen.getByLabelText("body"), "夜");
    await userEvent.click(screen.getByRole("button", { name: "放り込む" }));
    expect(await screen.findByText(/オフライン/)).toBeInTheDocument();
    expect(outboxCount()).toBe(1);
  });

  it("does NOT queue on a server (4xx) error", async () => {
    createNeta.mockRejectedValue(new ApiError(400, "bad"));
    render(<Capture />);
    await userEvent.type(screen.getByLabelText("body"), "夜");
    await userEvent.click(screen.getByRole("button", { name: "放り込む" }));
    expect(await screen.findByText(/失敗/)).toBeInTheDocument();
    expect(outboxCount()).toBe(0);
  });
});
