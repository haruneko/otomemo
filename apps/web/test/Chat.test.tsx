import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  createJob, getJob, jobOutcome, createNeta, getNeta, updateNeta, placeChild, deleteNeta,
  link, unlink, listChatMessages, addChatMessage, clearChatThread, chatTurnStream,
  chatTurnLiveStream, chatTurnStop,
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
  chatTurnStream: vi.fn(),
  chatTurnLiveStream: vi.fn(),
  chatTurnStop: vi.fn(),
}));
vi.mock("../src/api", () => ({
  api: {
    createJob, getJob, jobOutcome, createNeta, getNeta, updateNeta, placeChild, deleteNeta,
    link, unlink, listChatMessages, addChatMessage, clearChatThread, chatTurnStream,
    chatTurnLiveStream, chatTurnStop,
  },
}));

// #100④-S3 常駐 claude の stream-json を擬似発火（consult＝SSE 経路の駆動）。
function streamEvents(...events: unknown[]) {
  chatTurnStream.mockImplementation(
    async (_t: string, _text: string, onEvent: (e: unknown) => void) => {
      for (const e of events) onEvent(e);
    },
  );
}
const asst = (text: string) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
const toolUse = (name: string) => ({ type: "assistant", message: { content: [{ type: "tool_use", name, input: {} }] } });
const result = (text: string, is_error = false) => ({ type: "result", subtype: "success", result: text, is_error });
// 永続履歴に proposals メッセージを置く（#100 で proposals は判別ユニオンでなく履歴経由で描く）。
import { Chat } from "../src/components/Chat";

describe("Chat", () => {
  beforeEach(() => {
    // #70 既定：履歴は空、保存はスタブ成功（既存テストの挙動を保つ）。
    vi.resetAllMocks(); // テスト間でモック実装/呼出が漏れないよう毎回リセット。
    listChatMessages.mockResolvedValue([]);
    addChatMessage.mockResolvedValue({ id: "m" });
    clearChatThread.mockResolvedValue({ cleared: true });
    chatTurnLiveStream.mockResolvedValue(undefined); // 再アタッチ：既定は走行中ターン無し（no-op）。
    chatTurnStop.mockResolvedValue({ stopped: true });
    streamEvents(result("")); // 既定：何も言わず終わる（各テストで上書き）。
  });

  it("生成中は「停止」ボタンが出て、押すと chatTurnStop を呼ぶ（#100④-S6）", async () => {
    // ストリームを解決させない＝busy を保つ（停止ボタンが出続ける）。
    chatTurnStream.mockImplementation(async (_t: string, _x: string, onEvent: (e: unknown) => void) => {
      onEvent(asst("考え中の途中…"));
      await new Promise(() => {}); // 保留（result を出さない）
    });
    render(<Chat onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "重い相談");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    const stopBtn = await screen.findByRole("button", { name: "stop-turn" });
    await userEvent.click(stopBtn);
    await waitFor(() => expect(chatTurnStop).toHaveBeenCalledWith("global"));
  });

  it("consult(streaming): Claude の自然文返答を表示する（#100④）", async () => {
    streamEvents(asst("Cメジャーで明るい進行はいかが？"), result("Cメジャーで明るい進行はいかが？"));
    render(<Chat onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "発展案ちょうだい");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    expect(await screen.findByText(/Cメジャーで明るい進行/)).toBeInTheDocument();
    expect(chatTurnStream).toHaveBeenCalledWith("global", "発展案ちょうだい", expect.any(Function));
    expect(createJob).not.toHaveBeenCalled(); // 旧ジョブ経路は使わない
  });

  it("consult(streaming): tool_use を挟んでも最終テキストで確定する（#100④）", async () => {
    streamEvents(asst("作るね"), toolUse("mcp__creative-manager__generate"), result("できました：C-G-Am-F"));
    render(<Chat onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "コード進行作って");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    expect(await screen.findByText(/できました：C-G-Am-F/)).toBeInTheDocument();
  });

  it("S3b: generate 候補は保存カードで出て、保存で createNeta (#100④)", async () => {
    const content = { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] };
    streamEvents(
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "mcp__creative-manager__generate", input: {} }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: JSON.stringify({ items: [{ kind: "chord_progression", content }] }) }] }] } },
      result("候補を作りました"),
    );
    createNeta.mockResolvedValue({ id: "c9" });
    const onChanged = vi.fn();
    render(<Chat onClose={vi.fn()} onChanged={onChanged} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "コード進行作って");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));

    expect(await screen.findByLabelText("candidate-card")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("save-candidate"));
    await waitFor(() => expect(createNeta).toHaveBeenCalledWith({ kind: "chord_progression", content }));
    expect(onChanged).toHaveBeenCalled();
  });

  it("S3b: capture 書込は「開く」＋「取り消す(undo)」カードで出る (#100④a)", async () => {
    const neta = { id: "n9", kind: "knowledge", text: "メモ", content: null };
    streamEvents(
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t2", name: "mcp__creative-manager__capture", input: {} }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: JSON.stringify(neta) }] }] } },
      result("登録しました"),
    );
    deleteNeta.mockResolvedValue({ deleted: true });
    const onOpenNeta = vi.fn();
    const onClose = vi.fn();
    render(<Chat onClose={onClose} onChanged={vi.fn()} onOpenNeta={onOpenNeta} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "メモして");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));

    expect(await screen.findByLabelText("write-card")).toBeInTheDocument();
    // 取り消す → deleteNeta（可逆）
    await userEvent.click(screen.getByLabelText("undo-card"));
    await waitFor(() => expect(deleteNeta).toHaveBeenCalledWith("n9"));
    expect(await screen.findByText(/取り消しました/)).toBeInTheDocument();
  });

  it("consult(streaming): result が空でも無言で消えない（失敗を明示）", async () => {
    streamEvents(result("", true));
    render(<Chat onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "むちゃ");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    expect(await screen.findByText(/うまくいきませんでした/)).toBeInTheDocument();
  });

  it("history: 作成ネタの「開く」→ onOpenNeta ＋ Chat を閉じる (#68)", async () => {
    // #100 では capture が server 側で書く＝結果ネタは履歴に content メッセージとして残る。
    const neta = { id: "c1", kind: "chord_progression", content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } };
    listChatMessages.mockReset();
    listChatMessages.mockResolvedValue([
      { id: "n", thread: "global", role: "ai", kind: "content", text: "「コード進行」を作りました", data: { neta }, created: "" },
    ]);
    const onClose = vi.fn();
    const onOpenNeta = vi.fn();

    render(<Chat onClose={onClose} onChanged={vi.fn()} onOpenNeta={onOpenNeta} />);
    expect(await screen.findByText(/「コード進行」を作りました/)).toBeInTheDocument();

    // #68 「開く」→ onOpenNeta(neta) ＋ Chat を閉じる
    await userEvent.click(screen.getByLabelText("open-neta"));
    expect(onOpenNeta).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("research(streaming): 調べる モードも常駐 claude へ（リサーチ依頼に包んで /turn）(#100④)", async () => {
    streamEvents(asst("『曲A』(X) が近い。IVmの翳りが効いてる。"), result("『曲A』(X) が近い。IVmの翳りが効いてる。"));
    render(<Chat onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "調べる" }));
    await userEvent.type(screen.getByLabelText("chat-input"), "夜の曲");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    expect(await screen.findByText(/曲A/)).toBeInTheDocument();
    // 旧ジョブ経路は使わず、ユーザー文を「リサーチ依頼」に包んで常駐へ流す（脳は Claude）。
    const sent = chatTurnStream.mock.calls[0]?.[1] as string;
    expect(sent).toContain("リサーチ依頼");
    expect(sent).toContain("夜の曲");
    expect(createJob).not.toHaveBeenCalled();
  });

  it("AI 本文のマークダウン表は <table> で描画（生の | を出さない）", async () => {
    const md = "整理します。\n\n| 小節 | コード |\n|------|--------|\n| 1 | C |\n| 2 | F |";
    listChatMessages.mockReset();
    listChatMessages.mockResolvedValue([
      { id: "m", thread: "global", role: "ai", kind: "chat", text: md, data: null, created: "" },
    ]);
    render(<Chat onClose={vi.fn()} />);
    // 表が要素として描かれる（生の "|------|" が見えるのではなく table/セル）
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "小節" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "C" })).toBeInTheDocument();
    expect(screen.queryByText(/\|------\|/)).toBeNull();
  });

  it("user 文は素のまま（マークダウン解釈しない）", async () => {
    listChatMessages.mockReset();
    listChatMessages.mockResolvedValue([
      { id: "u", thread: "global", role: "user", kind: "chat", text: "# これは見出しにしない", data: null, created: "" },
    ]);
    render(<Chat onClose={vi.fn()} />);
    expect(await screen.findByText("# これは見出しにしない")).toBeInTheDocument();
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

  it("#70 user は即永続化／AI 返答はサーバ側で永続化＝クライアントからは addChatMessage しない（ストリーム切れ対策）", async () => {
    listChatMessages.mockResolvedValue([]);
    streamEvents(asst("はい"), result("はい"));
    render(<Chat onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("chat-input"), "メロ直して");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    // ユーザー発言は開始時にクライアントが永続化（切断前に残る）。
    await waitFor(() =>
      expect(addChatMessage).toHaveBeenCalledWith(
        "global",
        expect.objectContaining({ role: "user", text: "メロ直して" }),
      ),
    );
    // AI 返答は画面には出るが…
    await waitFor(() => expect(screen.getByText("はい")).toBeInTheDocument());
    // …クライアントからは保存しない（/turn 完了時にサーバが chat_message へ書く＝閉じても消えない・重複しない）。
    expect(addChatMessage).not.toHaveBeenCalledWith("global", expect.objectContaining({ role: "ai" }));
  });
});
