import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { createJob, getJob, createNeta, link } = vi.hoisted(() => ({
  createJob: vi.fn(),
  getJob: vi.fn(),
  createNeta: vi.fn(),
  link: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: { createJob, getJob, createNeta, link } }));

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

  it("壁打ち shows selectable options; choosing one creates a neta", async () => {
    createJob.mockResolvedValue({ id: "j1", status: "queued" });
    getJob.mockResolvedValue({
      id: "j1",
      status: "done",
      result: { options: [{ title: "案A", body: "ほんぶんA" }] },
      error: null,
    });
    createNeta.mockResolvedValue({ id: "new1", kind: "lyric" });
    link.mockResolvedValue({ ok: true });
    const onChanged = vi.fn();

    render(<NetaCard neta={mk({ id: "x", text: "夜を駆ける" })} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: "壁打ち" }));
    await waitFor(() => expect(screen.getByText("案A")).toBeInTheDocument());

    await userEvent.click(screen.getByText("案A"));
    await waitFor(() => expect(createNeta).toHaveBeenCalled());
    expect(createNeta).toHaveBeenCalledWith({ kind: "lyric", title: "案A", text: "ほんぶんA" });
    expect(onChanged).toHaveBeenCalled();
  });
});
