import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createNeta, updateNeta } = vi.hoisted(() => ({ createNeta: vi.fn(), updateNeta: vi.fn() }));
vi.mock("../src/api", () => ({ api: { createNeta, updateNeta } }));
vi.mock("../src/audio", () => ({ playNotes: vi.fn(async () => ({ stop: vi.fn(), pause: vi.fn(), resume: vi.fn() })) }));

import { AnalysisWorkbench, fitScale, seekBeatAt, MIN_PXB, AWB_ZOOMS } from "../src/components/AnalysisWorkbench";
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

  it("ズームUI（全体/×2/×4）を出す＝初期は全体フィットが選択", () => {
    render(<AnalysisWorkbench neta={neta} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "zoom-fit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "zoom-x2" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "zoom-x4" })).toBeInTheDocument();
  });

  it("ズーム段変更でストリップ幅が倍率どおり広がる", async () => {
    render(<AnalysisWorkbench neta={neta} onClose={vi.fn()} />);
    const strip = document.querySelector(".awb-strip") as HTMLElement;
    const wFit = parseFloat(strip.style.width); // 全体フィット時の幅
    await userEvent.click(screen.getByRole("button", { name: "zoom-x2" }));
    const wX2 = parseFloat(strip.style.width);
    expect(wX2).toBeCloseTo(wFit * 2, 1); // ×2 で2倍
    expect(screen.getByRole("button", { name: "zoom-x2" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "zoom-x4" }));
    expect(parseFloat(strip.style.width)).toBeCloseTo(wFit * 4, 1); // ×4 で4倍
  });
});

// スケール算出の純関数（全体フィット px/拍・最小ガード）＝長い曲でストリップが3万px超になる問題の是正の核。
describe("fitScale（全体フィットの px/拍）", () => {
  it("可視幅を総拍数で割る＝曲全体が収まる px/拍", () => {
    expect(fitScale(100, 800)).toBeCloseTo(8, 6); // 800px / 100拍 = 8px/拍
    expect(fitScale(50, 800)).toBeCloseTo(16, 6);
  });
  it("下限 MIN_PXB でガード＝長い曲でも音符が潰れない（フルには収まらないがスクロールで読む）", () => {
    expect(fitScale(10000, 800)).toBe(MIN_PXB); // 800/10000=0.08 → 下限へ
  });
  it("幅0/拍0はフォールバック(48)＝未測定でも壊れない", () => {
    expect(fitScale(100, 0)).toBe(48);
    expect(fitScale(0, 800)).toBe(48);
  });
});

// シーク座標が可変スケールに追従する（本丸＝取りこぼすと再生開始位置がズレる）。
describe("seekBeatAt（シーク拍＝可変スケール追従）", () => {
  it("クリックX をその時の pxb で割る＝スケールが変われば同じ画素でも別の拍", () => {
    expect(seekBeatAt(480, 0, 48, 100)).toBeCloseTo(10, 6); // 480px / 48 = 10拍
    expect(seekBeatAt(480, 0, 8, 100)).toBeCloseTo(60, 6);  // 同じ480pxでも 8px/拍 なら60拍
  });
  it("コンテナ左端(rectLeft)を差し引き、[0,totalBeat] にクランプ", () => {
    expect(seekBeatAt(100, 100, 48, 100)).toBe(0);   // 左端ちょうど＝0拍
    expect(seekBeatAt(50, 100, 48, 100)).toBe(0);    // 左端より手前＝0にクランプ
    expect(seekBeatAt(999999, 0, 48, 100)).toBe(100); // 右端超え＝totalBeat にクランプ
  });
});

describe("AWB_ZOOMS（ズーム段の定義）", () => {
  it("全体=×1・×2・×4 の3段（先頭=全体フィット）", () => {
    expect(AWB_ZOOMS.map((z) => z.id)).toEqual(["fit", "x2", "x4"]);
    expect(AWB_ZOOMS.map((z) => z.mult)).toEqual([1, 2, 4]);
  });
});
