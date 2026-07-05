import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createNeta, updateNeta } = vi.hoisted(() => ({ createNeta: vi.fn(), updateNeta: vi.fn() }));
vi.mock("../src/api", () => ({ api: { createNeta, updateNeta } }));
vi.mock("../src/audio", () => ({ playNotes: vi.fn(async () => ({ stop: vi.fn(), pause: vi.fn(), resume: vi.fn() })) }));

import { AnalysisWorkbench } from "../src/components/AnalysisWorkbench";
import { playNotes } from "../src/audio";

const neta = {
  id: "a1", kind: "analysis", title: "アナリーゼ: テスト曲", key: 2, mode: "major", tempo: 120,
  content: {
    meta: { bpm: 120, meter: 4, key: { key: "D", mode: "major" }, duration_sec: 8 },
    raw: {
      beat_times: [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5],
      melody_notes: [[0, 0.5, 69], [0.5, 1.0, 72]], // A4, C5
      melody_f0: [],
      chords_timeline: [[0, 2, "A:min"], [2, 4, "C"], [4, 6, "D:7"], [6, 8, "G"]],
    },
    overlay: { anchors: [{ t_sec: 0, meter: 4, bar_no: 1 }], cuts: [], chord_edits: [], sections: [] },
    prose: "これはテストの所見です。",
  },
} as never;

describe("AnalysisWorkbench（アナリーゼ・ワークベンチ）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNeta.mockResolvedValue({ id: "cp1" });
    updateNeta.mockResolvedValue({});
  });

  it("コードチップとメロ音符を描く", () => {
    render(<AnalysisWorkbench neta={neta} onClose={vi.fn()} />);
    expect(screen.getByText("Am")).toBeInTheDocument(); // A:min→Am
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.getByText("D7")).toBeInTheDocument(); // D:7→D7
    // メロ音符2つ（.awb-note）
    expect(document.querySelectorAll(".awb-note").length).toBe(2);
  });

  it("▶再生で playNotes を呼ぶ（メロ＋コード＋クリック合成）", async () => {
    render(<AnalysisWorkbench neta={neta} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "play" }));
    await waitFor(() => expect(playNotes).toHaveBeenCalled());
    const notes = (playNotes as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as { drum?: boolean }[];
    expect(notes.some((n) => n.drum)).toBe(true); // クリックが混ざる
  });

  it("切り出し→chord_progression ネタを作る（実キー・切出タグ）", async () => {
    render(<AnalysisWorkbench neta={neta} onChanged={vi.fn()} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "cut" }));
    await waitFor(() => expect(createNeta).toHaveBeenCalled());
    const arg = createNeta.mock.calls[0]![0] as { kind: string; tags: string[]; content: { chords: unknown[] } };
    expect(arg.kind).toBe("chord_progression");
    expect(arg.tags).toContain("切出");
    expect(arg.content.chords.length).toBeGreaterThanOrEqual(1);
  });

  it("小節頭アンカーを拍▶でずらすと updateNeta で overlay を保存", async () => {
    render(<AnalysisWorkbench neta={neta} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "anchor-next" }));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const arg = updateNeta.mock.calls[0]![1] as { content: { overlay: { anchors: { t_sec: number }[] } } };
    expect(arg.content.overlay.anchors[0]!.t_sec).toBeCloseTo(0.5, 2); // 次のビートへ
  });
});
