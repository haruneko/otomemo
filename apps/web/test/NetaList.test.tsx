import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { createJob, getJob, createNeta, link, placeChild } = vi.hoisted(() => ({
  createJob: vi.fn(),
  getJob: vi.fn(),
  createNeta: vi.fn(),
  link: vi.fn(),
  placeChild: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: { createJob, getJob, createNeta, link, placeChild } }));

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

  it("generates from the 生成 menu (melody) and creates a linked neta", async () => {
    createJob.mockResolvedValue({ id: "j1", status: "queued" });
    getJob.mockResolvedValue({ id: "j1", status: "done", result: { content: { notes: [] } }, error: null });
    createNeta.mockResolvedValue({ id: "m1" });
    const onChanged = vi.fn();
    render(<NetaCard neta={mk({ id: "x", text: "夜" })} onChanged={onChanged} />);
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
    await userEvent.click(screen.getByRole("button", { name: "生成 ▾" }));
    await userEvent.click(screen.getByRole("button", { name: "全体" }));
    await waitFor(() => expect(placeChild).toHaveBeenCalledTimes(3));
    expect(createNeta).toHaveBeenCalledWith(expect.objectContaining({ kind: "section" }));
  });

  it("壁打ち opens the chat for that neta (relocated from inline panel)", async () => {
    const onChat = vi.fn();
    render(<NetaCard neta={mk({ id: "x", text: "夜を駆ける" })} onChat={onChat} />);
    await userEvent.click(screen.getByRole("button", { name: "壁打ち" }));
    expect(onChat).toHaveBeenCalledWith(expect.objectContaining({ id: "x" }));
  });
});
