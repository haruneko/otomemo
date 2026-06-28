import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// プロジェクト画面（Claude Projects 風ランディング）：会話起点＋曲/ファイル/会話の集約（S3/UI）。
const { listNeta, listProjectFiles, listChatThreads, getProject, setProject } = vi.hoisted(() => ({
  listNeta: vi.fn(),
  listProjectFiles: vi.fn(),
  listChatThreads: vi.fn(),
  getProject: vi.fn(),
  setProject: vi.fn(),
}));
vi.mock("../src/api", () => ({
  api: { listNeta, listProjectFiles, listChatThreads, getProject, setProject },
}));

import { ProjectScreen } from "../src/components/ProjectScreen";

describe("ProjectScreen", () => {
  it("aggregates songs/files/sessions and exposes a chat starter", async () => {
    listNeta.mockResolvedValue([
      { id: "s1", kind: "song", title: "本曲" },
      { id: "sec1", kind: "section", title: "サビ" },
      { id: "m1", kind: "melody", title: "メロ片" }, // 曲・セクションには出ない
    ]);
    listProjectFiles.mockResolvedValue([
      { id: "a1", kind: "lyrics", name: "歌詞.txt", size: 1200, mime: "text/plain", created: "x", attachedTo: [{ netaId: "s1", title: "本曲", kind: "song", role: "source" }] },
    ]);
    listChatThreads.mockResolvedValue([
      { thread: "chat:z", last: "2026-06-28T00:00:00Z", count: 3, preview: "サビのメロ案", project: "みなそこ", title: null },
    ]);
    getProject.mockResolvedValue({ name: "みなそこ", description: "切ない疾走の一曲", instructions: null, created: null, updated: null });
    const onOpenSession = vi.fn();
    const onStartChat = vi.fn();
    render(
      <ProjectScreen project="みなそこ" onOpenNeta={vi.fn()} onOpenSession={onOpenSession} onStartChat={onStartChat} />,
    );

    // 器の説明が見出し下に出る
    expect(await screen.findByText("切ない疾走の一曲")).toBeInTheDocument();

    // 集約：曲・セクション（melody除外）／ファイル／会話
    expect(await screen.findByText("本曲")).toBeInTheDocument();
    expect(screen.getByText("サビ")).toBeInTheDocument();
    expect(screen.queryByText("メロ片")).not.toBeInTheDocument();
    expect(screen.getByText("歌詞.txt")).toBeInTheDocument();
    expect(screen.getByText("サビのメロ案")).toBeInTheDocument();

    // 会話起点：入力して送ると seed 付きで onStartChat
    fireEvent.change(screen.getByLabelText("start-chat"), { target: { value: "サビ作りたい" } });
    fireEvent.click(screen.getByLabelText("start-chat-go"));
    expect(onStartChat).toHaveBeenCalledWith("サビ作りたい");

    // 会話クリックで開く
    fireEvent.click(screen.getByText("サビのメロ案"));
    expect(onOpenSession).toHaveBeenCalledWith("chat:z");
  });

  it("edits description/instructions and saves via setProject", async () => {
    listNeta.mockResolvedValue([]);
    listProjectFiles.mockResolvedValue([]);
    listChatThreads.mockResolvedValue([]);
    getProject.mockResolvedValue({ name: "みなそこ", description: null, instructions: null, created: null, updated: null });
    setProject.mockResolvedValue({ name: "みなそこ", description: "新説明", instructions: "Amで上行", created: "x", updated: "x" });
    render(<ProjectScreen project="みなそこ" onOpenNeta={vi.fn()} onOpenSession={vi.fn()} onStartChat={vi.fn()} />);

    fireEvent.click(await screen.findByLabelText("edit-project"));
    fireEvent.change(screen.getByLabelText("project-description"), { target: { value: "新説明" } });
    fireEvent.change(screen.getByLabelText("project-instructions"), { target: { value: "Amで上行" } });
    fireEvent.click(screen.getByText("保存"));
    expect(setProject).toHaveBeenCalledWith("みなそこ", { description: "新説明", instructions: "Amで上行" });
  });
});
