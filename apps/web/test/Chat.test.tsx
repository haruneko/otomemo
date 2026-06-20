import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createJob, getJob, createNeta } = vi.hoisted(() => ({
  createJob: vi.fn(),
  getJob: vi.fn(),
  createNeta: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: { createJob, getJob, createNeta } }));

import { Chat } from "../src/components/Chat";

describe("Chat", () => {
  it("sends, shows options, and picks one to create a neta", async () => {
    createJob.mockResolvedValue({ id: "j1", status: "queued" });
    getJob.mockResolvedValue({
      status: "done",
      result: { options: [{ title: "案A", body: "ほんぶん" }] },
      error: null,
    });
    createNeta.mockResolvedValue({ id: "n1" });
    const onChanged = vi.fn();

    render(<Chat onClose={vi.fn()} onChanged={onChanged} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "明るいサビのコード進行");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() => expect(screen.getByText("案A")).toBeInTheDocument());

    await userEvent.click(screen.getByText("案A"));
    await waitFor(() => expect(createNeta).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalled();
  });
});
