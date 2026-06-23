import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { listJobs, jobOutcome } = vi.hoisted(() => ({ listJobs: vi.fn(), jobOutcome: vi.fn() }));
vi.mock("../src/api", () => ({ api: { listJobs, jobOutcome } }));

import { Tray } from "../src/components/Tray";

describe("Tray", () => {
  it("lists jobs with status and a peek of the result", async () => {
    listJobs.mockResolvedValue([
      {
        id: "j1",
        intent: "research",
        status: "done",
        result: { summary: "要点A" },
        error: null,
        created: "2026-06-20T00:00:00Z",
      },
    ]);
    jobOutcome.mockResolvedValue({ settled: true, failed: 0, jobs: [], neta: [] }); // 生成ネタ無し→peek表示
    render(<Tray onClose={vi.fn()} />);
    expect(await screen.findByText("調べる")).toBeInTheDocument(); // 生intentでなく日本語ラベル（fb-1）
    expect(screen.getByText(/要点A/)).toBeInTheDocument();
  });
});
