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
    expect(createNeta).toHaveBeenCalledWith({
      kind: "other",
      title: "案A",
      text: "ほんぶん",
      from_job: "j1",
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("research mode shows reference songs and saves one as a reference neta (#9)", async () => {
    createJob.mockResolvedValue({ id: "jr", status: "queued" });
    getJob.mockResolvedValue({
      status: "done",
      result: {
        summary: "夜系の要点",
        references: [{ title: "曲A", artist: "X", why: "進行が近い", points: "IVmで翳り" }],
      },
      error: null,
    });
    createNeta.mockResolvedValue({ id: "r1" });
    const onChanged = vi.fn();

    render(<Chat onClose={vi.fn()} onChanged={onChanged} />);
    // research モードに切替
    await userEvent.click(screen.getByRole("button", { name: "調べる" }));
    await userEvent.type(screen.getByLabelText("chat-input"), "夜の曲");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() => expect(screen.getByText("曲A")).toBeInTheDocument());

    await userEvent.click(screen.getByLabelText("save-ref-0"));
    await waitFor(() => expect(createNeta).toHaveBeenCalled());
    expect(createNeta).toHaveBeenCalledWith({
      kind: "reference",
      title: "曲A / X",
      text: "進行が近い\nIVmで翳り",
      content: { references: [{ title: "曲A", artist: "X", why: "進行が近い", points: "IVmで翳り" }] },
      from_job: "jr",
    });
    expect(onChanged).toHaveBeenCalled();
  });
});
