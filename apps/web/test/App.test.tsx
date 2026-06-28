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
    listJobs: vi.fn().mockResolvedValue([]),
  },
}));

import { App } from "../src/App";

describe("App", () => {
  it("renders title and empty state", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "creative_manager" })).toBeInTheDocument();
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
});
