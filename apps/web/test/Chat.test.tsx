import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  createJob, getJob, jobOutcome, createNeta, getNeta, updateNeta, placeChild, deleteNeta,
  link, unlink, listChatMessages, addChatMessage, clearChatThread,
} = vi.hoisted(() => ({
  createJob: vi.fn(),
  getJob: vi.fn(),
  jobOutcome: vi.fn(),
  createNeta: vi.fn(),
  getNeta: vi.fn(),
  updateNeta: vi.fn(),
  placeChild: vi.fn(),
  deleteNeta: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
  listChatMessages: vi.fn(),
  addChatMessage: vi.fn(),
  clearChatThread: vi.fn(),
}));
vi.mock("../src/api", () => ({
  api: {
    createJob, getJob, jobOutcome, createNeta, getNeta, updateNeta, placeChild, deleteNeta,
    link, unlink, listChatMessages, addChatMessage, clearChatThread,
  },
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

  it("plan: waits for the worker in-chat and shows produced neta inline (not just inbox)", async () => {
    createJob.mockResolvedValue({ id: "jp", status: "queued" });
    getJob.mockResolvedValue({
      status: "done",
      result: { type: "plan", subtasks: [{ intent: "gen_pair_rule" }], plan: "1個に分解しました" },
      error: null,
    });
    // ディスパッチ後、このチャットで完了を待つ＝jobOutcome をポーリングし、できたネタを表示。
    jobOutcome.mockResolvedValue({
      settled: true,
      failed: 0,
      jobs: [{ id: "jp", intent: "consult", status: "done" }],
      neta: [{ id: "m1", kind: "melody", content: { notes: [] } }],
    });
    const onChanged = vi.fn();

    render(<Chat onClose={vi.fn()} onChanged={onChanged} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "一式そろえて");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));

    // チャット内で待って、できたネタ（開く）が出る
    await waitFor(() => expect(jobOutcome).toHaveBeenCalledWith("jp"), { timeout: 4000 });
    expect(await screen.findByText(/1個できました/, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByLabelText("open-neta")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("proposals: shows approval card with before/after, approve applies content edit (#102 S3)", async () => {
    createJob.mockResolvedValue({ id: "jx", status: "queued" });
    getJob.mockResolvedValue({
      status: "done",
      result: {
        type: "proposals",
        summary: "メロを直す提案",
        proposals: [
          {
            op: "update_content",
            target_id: "m1",
            args: { content: { notes: [{ pitch: 67, start: 0, dur: 1 }] } },
            rationale: "外し音を補正",
          },
        ],
      },
      error: null,
    });
    getNeta.mockResolvedValue({
      id: "m1",
      kind: "melody",
      content: { notes: [{ pitch: 60, start: 0, dur: 1 }] },
      key: 0,
      tempo: 120,
    });
    updateNeta.mockResolvedValue({ id: "m1" });
    const onChanged = vi.fn();

    render(<Chat onClose={vi.fn()} onChanged={onChanged} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "m1をコードに合わせて直して");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));

    // 承認カード＋原本/提案の再生ボタンが出る（適用はまだ）
    await waitFor(() => expect(screen.getByLabelText("proposal")).toBeInTheDocument());
    expect(screen.getByLabelText("play-before")).toBeInTheDocument();
    expect(screen.getByLabelText("play-after")).toBeInTheDocument();
    expect(updateNeta).not.toHaveBeenCalled();

    // 承認 → updateNeta が呼ばれて適用
    await userEvent.click(screen.getByLabelText("approve"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalledWith("m1", { content: { notes: [{ pitch: 67, start: 0, dur: 1 }] } }));
    expect(onChanged).toHaveBeenCalled();
    expect(await screen.findByText(/適用しました/)).toBeInTheDocument();
  });

  it("proposals: place_child approve calls placeChild; reject applies nothing (#102 S3)", async () => {
    createJob.mockResolvedValue({ id: "jy", status: "queued" });
    getJob.mockResolvedValue({
      status: "done",
      result: {
        type: "proposals",
        proposals: [
          { op: "place_child", target_id: "n2", args: { parent_id: "s1", position: 0 } },
          { op: "delete", target_id: "n3" },
        ],
      },
      error: null,
    });
    getNeta.mockResolvedValue({ id: "x", kind: "other", text: "ネタ", content: {} });
    placeChild.mockResolvedValue({ ok: true });

    render(<Chat onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "n2をs1に置いて、n3は消して");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));

    await waitFor(() => expect(screen.getAllByLabelText("proposal").length).toBe(2));
    const approves = screen.getAllByLabelText("approve");
    const rejects = screen.getAllByLabelText("reject");
    await userEvent.click(approves[0]!); // place_child を承認
    await waitFor(() => expect(placeChild).toHaveBeenCalledWith("s1", "n2", 0));
    await userEvent.click(rejects[1]!); // delete を却下
    expect(deleteNeta).not.toHaveBeenCalled();
    expect(await screen.findByText(/却下しました/)).toBeInTheDocument();
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
