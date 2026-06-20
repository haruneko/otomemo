import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { createJob, getJob } = vi.hoisted(() => ({
  createJob: vi.fn(),
  getJob: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: { createJob, getJob } }));

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

  it("throws a brainstorm job and shows the result", async () => {
    createJob.mockResolvedValue({ id: "j1", status: "queued" });
    getJob.mockResolvedValue({
      id: "j1",
      status: "done",
      result: { suggestions: "- 案A\n- 案B" },
      error: null,
    });
    render(<NetaCard neta={mk({ id: "x", text: "夜を駆ける" })} />);
    await userEvent.click(screen.getByRole("button", { name: "壁打ち" }));
    await waitFor(() => expect(screen.getByText(/案A/)).toBeInTheDocument());
    expect(createJob).toHaveBeenCalledWith({
      intent: "brainstorm",
      target_neta_id: "x",
      params: { context: "夜を駆ける" },
    });
  });
});
