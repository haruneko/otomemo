import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createJob, getJob, createNeta, listChatMessages, addChatMessage, clearChatThread } =
  vi.hoisted(() => ({
    createJob: vi.fn(),
    getJob: vi.fn(),
    createNeta: vi.fn(),
    listChatMessages: vi.fn(),
    addChatMessage: vi.fn(),
    clearChatThread: vi.fn(),
  }));
vi.mock("../src/api", () => ({
  api: { createJob, getJob, createNeta, listChatMessages, addChatMessage, clearChatThread },
}));

import { Chat } from "../src/components/Chat";

describe("Chat", () => {
  beforeEach(() => {
    // #70 既定：履歴は空、保存はスタブ成功（既存テストの挙動を保つ）。
    listChatMessages.mockResolvedValue([]);
    addChatMessage.mockResolvedValue({ id: "m" });
    clearChatThread.mockResolvedValue({ cleared: true });
  });
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

  it("consult: content → creates a proper-kind neta, no other (#61), with open link (#68)", async () => {
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
    createNeta.mockResolvedValue({
      id: "c1",
      kind: "chord_progression",
      content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] },
    });
    const onChanged = vi.fn();
    const onClose = vi.fn();
    const onOpenNeta = vi.fn();

    render(<Chat onClose={onClose} onChanged={onChanged} onOpenNeta={onOpenNeta} />);
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

    // #68 「開く」→ onOpenNeta(neta) ＋ Chat を閉じる
    await userEvent.click(screen.getByLabelText("open-neta"));
    expect(onOpenNeta).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
    expect(onClose).toHaveBeenCalled();
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

  it("#70 restores persisted messages on open", async () => {
    listChatMessages.mockResolvedValue([
      { id: "1", thread: "global", role: "user", kind: "chat", text: "前の質問", data: null },
      { id: "2", thread: "global", role: "ai", kind: "chat", text: "前の回答", data: null },
    ]);
    render(<Chat onClose={vi.fn()} />);
    expect(await screen.findByText("前の質問")).toBeInTheDocument();
    expect(await screen.findByText("前の回答")).toBeInTheDocument();
    expect(listChatMessages).toHaveBeenCalledWith("global");
  });

  it("#70 persists the user message when sending", async () => {
    listChatMessages.mockResolvedValue([]);
    createJob.mockResolvedValue({ id: "j1", status: "queued" });
    getJob.mockResolvedValue({ status: "done", result: { type: "chat", text: "ok" }, error: null });

    render(<Chat onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "こんにちは");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() =>
      expect(addChatMessage).toHaveBeenCalledWith(
        "global",
        expect.objectContaining({ role: "user", text: "こんにちは" }),
      ),
    );
  });
});
