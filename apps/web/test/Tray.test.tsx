import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { listJobs, jobOutcome, deleteJob } = vi.hoisted(() => ({
  listJobs: vi.fn(),
  jobOutcome: vi.fn(),
  deleteJob: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: { listJobs, jobOutcome, deleteJob } }));

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

  it("#8 相対時刻を出す＝created から「3分前」", async () => {
    const created = new Date(Date.now() - 3 * 60000).toISOString();
    listJobs.mockResolvedValue([
      { id: "j1", intent: "research", status: "done", result: {}, error: null, created },
    ]);
    jobOutcome.mockResolvedValue({ settled: true, failed: 0, jobs: [], neta: [] });
    render(<Tray onClose={vi.fn()} />);
    expect(await screen.findByText("3分前")).toBeInTheDocument();
  });

  it("#8 結果ネタ4件超は「N件できた ▸」で畳み、タップで展開", async () => {
    listJobs.mockResolvedValue([
      { id: "j1", intent: "gen_melody", status: "done", result: {}, error: null, created: "2026-07-15T00:00:00Z" },
    ]);
    const neta = Array.from({ length: 5 }, (_, i) => ({
      id: `n${i}`, kind: "melody", title: `m${i}`, text: null,
    }));
    jobOutcome.mockResolvedValue({ settled: true, failed: 0, jobs: [], neta });
    render(<Tray onClose={vi.fn()} onOpenNeta={vi.fn()} />);
    // 畳まれている＝結果ボタンは出さず「5件できた」チップだけ。
    const chip = await screen.findByLabelText("expand-results");
    expect(chip).toHaveTextContent("5件できた");
    expect(screen.queryAllByLabelText("open-result")).toHaveLength(0);
    await userEvent.click(chip);
    expect(screen.getAllByLabelText("open-result")).toHaveLength(5);
  });

  it("#8 waiting（回答待ち）ジョブは最前へ並ぶ", async () => {
    listJobs.mockResolvedValue([
      { id: "d1", intent: "research", status: "done", result: {}, error: null, created: "2026-07-15T00:00:00Z" },
      { id: "w1", intent: "gen_melody", status: "waiting", question: "何小節？", result: null, error: null, created: "2026-07-15T00:00:00Z" },
    ]);
    jobOutcome.mockResolvedValue({ settled: true, failed: 0, jobs: [], neta: [] });
    render(<Tray onClose={vi.fn()} />);
    const waiting = await screen.findByText("メロ生成");
    const done = screen.getByText("調べる");
    // waiting(メロ生成) が done(調べる) より前＝done は waiting の後に位置する。
    expect(waiting.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("死にジョブを🗑で消せる＝deleteJob を呼び一覧から消える（#100④-S6）", async () => {
    // 初回ロードは滞留ジョブ有り、削除後の reload はサーバから消えている（[]）。
    listJobs
      .mockResolvedValueOnce([
        { id: "stuck", intent: "gen_melody", status: "queued", result: null, error: null, created: "2026-07-05T00:00:00Z" },
      ])
      .mockResolvedValue([]);
    jobOutcome.mockResolvedValue({ settled: false, failed: 0, jobs: [], neta: [] });
    deleteJob.mockResolvedValue({ deleted: true });
    render(<Tray onClose={vi.fn()} />);
    expect(await screen.findByText("メロ生成")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "delete-job" }));
    expect(deleteJob).toHaveBeenCalledWith("stuck");
    expect(screen.queryByText("メロ生成")).not.toBeInTheDocument(); // 楽観削除で即消える
  });
});
