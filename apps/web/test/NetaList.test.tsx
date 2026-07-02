import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { createJob, getJob, createNeta, link, placeChild, assignProject } = vi.hoisted(() => ({
  createJob: vi.fn(),
  getJob: vi.fn(),
  createNeta: vi.fn(),
  link: vi.fn(),
  placeChild: vi.fn(),
  assignProject: vi.fn(),
}));
vi.mock("../src/api", () => ({
  api: { createJob, getJob, createNeta, link, placeChild, assignProject },
}));

import { NetaList, NetaCard } from "../src/components/NetaList";

const mk = (over: Partial<Neta>): Neta => ({
  id: "abcdef12-0000",
  kind: "lyric",
  title: null,
  text: "夜",
  content: null,
  key: null,
  mode: null,
  tempo: null,
  meter: null,
  bars: null,
  mood: null,
  tags: [],
  created: "",
  updated: "",
  ...over,
});

describe("NetaList", () => {
  it("renders a card per neta with tags", () => {
    render(
      <NetaList
        items={[
          mk({ id: "1", text: "夜", tags: ["サビ"] }),
          mk({ id: "2", kind: "melody", title: "m" }),
        ]}
      />,
    );
    expect(screen.getAllByLabelText("neta-card")).toHaveLength(2);
    expect(screen.getByText("#サビ")).toBeInTheDocument();
  });

  it("hides prj: tags from the semantic tag chips", () => {
    render(<NetaCard neta={mk({ id: "p", text: "夜", tags: ["サビ", "prj:みなそこ"] })} />);
    expect(screen.getByText("#サビ")).toBeInTheDocument();
    expect(screen.queryByText("#prj:みなそこ")).not.toBeInTheDocument();
  });

  it("shows an empty state", () => {
    render(<NetaList items={[]} />);
    expect(screen.getByText("まだネタがありません。")).toBeInTheDocument();
  });

  it("opens the neta in the main pane when the card body is clicked", async () => {
    const onOpen = vi.fn();
    render(<NetaCard neta={mk({ id: "x", text: "夜を駆ける" })} onOpen={onOpen} />);
    await userEvent.click(screen.getByText("夜を駆ける"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "x" }));
  });

  it("LV2: 副アクションは既定で畳まれ「…」で開く", async () => {
    render(<NetaCard neta={mk({ id: "x", kind: "melody", title: "m" })} />);
    // 既定＝主要2つ(相談＋…)のみ。複製/生成は隠れている。
    expect(screen.queryByRole("button", { name: "複製" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成 ▾" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("more-x"));
    expect(screen.getByRole("button", { name: "複製" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成 ▾" })).toBeInTheDocument();
  });

  it("P3: 「…」→「器へ」ピッカーで既存器に入れる(member=true)", async () => {
    assignProject.mockResolvedValue({});
    render(<NetaCard neta={mk({ id: "x", kind: "melody", title: "m" })} projects={["みなそこ"]} />);
    await userEvent.click(screen.getByLabelText("more-x"));
    await userEvent.click(screen.getByLabelText("assign-x")); // 器へ ▾
    await userEvent.click(screen.getByRole("button", { name: "みなそこ" }));
    expect(assignProject).toHaveBeenCalledWith("x", "みなそこ", true);
  });

  it("P3: 在籍している器は✓表示＝押すと出す(member=false)", async () => {
    assignProject.mockResolvedValue({});
    render(
      <NetaCard
        neta={mk({ id: "y", kind: "melody", title: "m", tags: ["prj:みなそこ"] })}
        projects={["みなそこ"]}
      />,
    );
    await userEvent.click(screen.getByLabelText("more-y"));
    await userEvent.click(screen.getByLabelText("assign-y"));
    await userEvent.click(screen.getByRole("button", { name: "✓ みなそこ" }));
    expect(assignProject).toHaveBeenCalledWith("y", "みなそこ", false);
  });

  it("P3: 「＋新しい器」で作成しつつ入れる", async () => {
    assignProject.mockResolvedValue({});
    const spy = vi.spyOn(window, "prompt").mockReturnValue("新器");
    render(<NetaCard neta={mk({ id: "z", kind: "melody", title: "m" })} projects={[]} />);
    await userEvent.click(screen.getByLabelText("more-z"));
    await userEvent.click(screen.getByLabelText("assign-z"));
    await userEvent.click(screen.getByLabelText("assign-new-z"));
    expect(assignProject).toHaveBeenCalledWith("z", "新器", true);
    spy.mockRestore();
  });

  it("LV2: 並べ替え=タイトル順で表示順が変わる", async () => {
    localStorage.clear();
    render(
      <NetaList
        items={[
          mk({ id: "1", kind: "melody", title: "ん最後" }),
          mk({ id: "2", kind: "melody", title: "あ最初" }),
        ]}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText("並べ替え"), "title");
    const cards = screen.getAllByLabelText("neta-card");
    expect(cards[0]).toHaveTextContent("あ最初");
    expect(cards[1]).toHaveTextContent("ん最後");
  });

  it("generates from the 生成 menu (melody) and creates a linked neta", async () => {
    createJob.mockResolvedValue({ id: "j1", status: "queued" });
    getJob.mockResolvedValue({ id: "j1", status: "done", result: { content: { notes: [] } }, error: null });
    createNeta.mockResolvedValue({ id: "m1" });
    const onChanged = vi.fn();
    render(<NetaCard neta={mk({ id: "x", text: "夜" })} onChanged={onChanged} />);
    await userEvent.click(screen.getByLabelText("more-x")); // LV2: 副アクションは「…」の裏
    await userEvent.click(screen.getByRole("button", { name: "生成 ▾" }));
    await userEvent.click(screen.getByRole("button", { name: "メロ" }));
    await waitFor(() => expect(createNeta).toHaveBeenCalled());
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({ intent: "gen_melody" }));
    expect(createNeta).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "melody", from_job: "j1" }),
    );
  });

  it("generates a full set (全体) into a section", async () => {
    createJob.mockResolvedValue({ id: "j1", status: "queued" });
    getJob.mockResolvedValue({ id: "j1", status: "done", result: { content: {} }, error: null });
    createNeta.mockResolvedValue({ id: "s1" });
    placeChild.mockResolvedValue({ ok: true });
    render(<NetaCard neta={mk({ id: "x", text: "夜" })} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("more-x")); // LV2: 副アクションは「…」の裏
    await userEvent.click(screen.getByRole("button", { name: "生成 ▾" }));
    await userEvent.click(screen.getByRole("button", { name: "全体" }));
    await waitFor(() => expect(placeChild).toHaveBeenCalledTimes(3));
    expect(createNeta).toHaveBeenCalledWith(expect.objectContaining({ kind: "section" }));
  });

  it("相談 opens the chat for that neta (relocated from inline panel)", async () => {
    const onChat = vi.fn();
    render(<NetaCard neta={mk({ id: "x", text: "夜を駆ける" })} onChat={onChat} />);
    await userEvent.click(screen.getByRole("button", { name: "相談" }));
    expect(onChat).toHaveBeenCalledWith(expect.objectContaining({ id: "x" }));
  });

  it("section card has a composite play button (#73)", () => {
    render(<NetaCard neta={mk({ id: "s1", kind: "section", title: "曲A" })} />);
    expect(screen.getByLabelText("play-s1")).toBeInTheDocument();
  });
});
