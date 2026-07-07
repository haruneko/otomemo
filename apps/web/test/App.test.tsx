import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/api", () => ({
  KINDS: ["lyric", "melody"],
  api: {
    listNeta: vi.fn().mockResolvedValue([]),
    createNeta: vi.fn(),
    facets: vi.fn().mockResolvedValue({ kind: [], mood: [], meter: [], key: [], tags: [] }),
    listProjectNames: vi.fn().mockResolvedValue([]),
    getProjectCounts: vi.fn().mockResolvedValue({ all: 0, unassigned: 0, projects: [] }),
    listJobs: vi.fn().mockResolvedValue([]),
  },
}));

import { App } from "../src/App";

describe("App", () => {
  it("renders title and empty state", async () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Otomemo" })).toBeInTheDocument(); // ヘッダ左のアプリ名ロゴ
    await waitFor(() =>
      expect(screen.getByText("まだネタがありません。")).toBeInTheDocument(),
    );
  });

  it("renders the 2-pane workspace (notebook rail + main pane)", () => {
    render(<App />);
    expect(screen.getByLabelText("notebook")).toBeInTheDocument();
    expect(screen.getByLabelText("mainpane")).toBeInTheDocument();
  });

  it("toggles the notebook rail open/closed", async () => {
    render(<App />);
    const rail = screen.getByLabelText("notebook");
    expect(rail.className).not.toContain("closed");
    await userEvent.click(screen.getByLabelText("toggle-rail"));
    expect(rail.className).toContain("closed");
  });

  it("opens the settings dialog with theme colors", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "settings" }));
    expect(screen.getByRole("dialog", { name: "settings" })).toBeInTheDocument();
    expect(screen.getByText("テーマ（色）")).toBeInTheDocument();
  });

  // 負債D6 の分割回帰：取込パネルを <ImportPanel> に切り出したので、トグルで実際に
  // パネル(取込各手段)が現れることを確認＝配線が壊れていないことの回帰ネット。
  it("toggles the import panel (ImportPanel 分割の回帰)", async () => {
    render(<App />);
    // 既定は畳まれていて中身は出ていない。
    expect(screen.queryByLabelText("analyze-url")).toBeNull();
    await userEvent.click(screen.getByLabelText("toggle-import"));
    // 取込の各手段が現れる（MIDI/楽譜/音源URL/歌詞）。
    expect(screen.getByLabelText("analyze-url")).toBeInTheDocument();
    expect(screen.getByText("MIDI取込")).toBeInTheDocument();
    expect(screen.getByText("楽譜取込")).toBeInTheDocument();
    expect(screen.getByText("歌詞取込")).toBeInTheDocument();
    // もう一度押すと畳まれる。
    await userEvent.click(screen.getByLabelText("toggle-import"));
    expect(screen.queryByLabelText("analyze-url")).toBeNull();
  });
});
