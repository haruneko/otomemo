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
  it("consult: shows options, picks one → knowledge neta (not other) (#61)", async () => {
    createJob.mockResolvedValue({ id: "j1", status: "queued" });
    getJob.mockResolvedValue({
      status: "done",
      result: { type: "options", options: [{ title: "案A", body: "ほんぶん" }] },
      error: null,
    });
    createNeta.mockResolvedValue({ id: "n1" });
    const onChanged = vi.fn();

    render(<Chat onClose={vi.fn()} onChanged={onChanged} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "発展案ちょうだい");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() => expect(screen.getByText("案A")).toBeInTheDocument());

    await userEvent.click(screen.getByText("案A"));
    await waitFor(() => expect(createNeta).toHaveBeenCalled());
    expect(createNeta).toHaveBeenCalledWith({
      kind: "knowledge", // #61 無targetは other ではなく knowledge
      title: "案A",
      text: "ほんぶん",
      from_job: "j1",
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("consult: content → creates a proper-kind neta, no other (#61)", async () => {
    createJob.mockResolvedValue({ id: "jc", status: "queued" });
    getJob.mockResolvedValue({
      status: "done",
      result: {
        type: "content",
        neta_kind: "chord_progression",
        content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] },
      },
      error: null,
    });
    createNeta.mockResolvedValue({ id: "c1" });
    const onChanged = vi.fn();

    render(<Chat onClose={vi.fn()} onChanged={onChanged} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "コード進行作って");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() => expect(createNeta).toHaveBeenCalled());
    expect(createNeta).toHaveBeenCalledWith({
      kind: "chord_progression",
      content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] },
      from_job: "jc",
    });
    expect(onChanged).toHaveBeenCalled();
    expect(await screen.findByText(/「コード進行」を作りました/)).toBeInTheDocument();
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
