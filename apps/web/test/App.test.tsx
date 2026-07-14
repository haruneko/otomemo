import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/api", () => ({
  KINDS: ["lyric", "melody"],
  api: {
    listNeta: vi.fn().mockResolvedValue([]),
    createNeta: vi.fn().mockResolvedValue(undefined), // 返り値は使わない（setActive されるが編集面は本テスト対象外）
    facets: vi.fn().mockResolvedValue({ kind: [], mood: [], meter: [], key: [], tags: [] }),
    listProjectNames: vi.fn().mockResolvedValue([]),
    getProjectCounts: vi.fn().mockResolvedValue({ all: 0, unassigned: 0, projects: [] }),
    listJobs: vi.fn().mockResolvedValue([]),
  },
}));

import { api } from "../src/api";

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

  // トップ再設計 S2：作成タイルはトップから消え「＋作る▾」の棚（ボトムシート）へ。
  // 既定でトップに .create-tiles が無いこと＝壁の撤去を回帰で固定。
  it("hides the create tiles from the top (they live in the ＋作る shelf) — S2", () => {
    const { container } = render(<App />);
    expect(container.querySelector(".create-tiles")).toBeNull(); // トップに作成タイルの壁は無い
    expect(screen.getByLabelText("open-create-shelf")).toBeInTheDocument(); // 代わりに＋作る▾の扉
  });

  // ＋作る→棚が開く→メロtapで createBlank("melody") を呼び棚が閉じる（S2 主動線＝作成2タップ）。
  it("opens the create shelf and creates a melody, then closes — S2", async () => {
    render(<App />);
    expect(screen.queryByRole("dialog", { name: "create-shelf" })).toBeNull();
    await userEvent.click(screen.getByLabelText("open-create-shelf"));
    expect(screen.getByRole("dialog", { name: "create-shelf" })).toBeInTheDocument();
    await userEvent.click(screen.getByText("＋メロ"));
    expect(api.createNeta).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "melody", title: "新しいメロ" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "create-shelf" })).toBeNull());
  });

  // 負債D6 の分割回帰：取込パネルは棚(CreateShelf)の中。棚を開いてトグル→取込各手段が現れる。
  it("toggles the import panel inside the create shelf (ImportPanel 分割の回帰)", async () => {
    render(<App />);
    expect(screen.queryByLabelText("analyze-url")).toBeNull();
    await userEvent.click(screen.getByLabelText("open-create-shelf")); // 棚を開く
    expect(screen.queryByLabelText("analyze-url")).toBeNull(); // 取込は既定畳み
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

  // 絞る▾で引き出しが開き、種別フィルタ(kind-filter-*)と mood が扉の奥に居る（S2）。
  it("opens the filter drawer with kind filters and mood — S2", async () => {
    render(<App />);
    expect(screen.queryByRole("dialog", { name: "filter-drawer" })).toBeNull();
    await userEvent.click(screen.getByLabelText("open-filter-drawer"));
    expect(screen.getByRole("dialog", { name: "filter-drawer" })).toBeInTheDocument();
    expect(screen.getByLabelText("kind-filter-melody")).toBeInTheDocument();
    expect(screen.getByLabelText("mood-filter")).toBeInTheDocument();
  });
});
