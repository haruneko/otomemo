import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../src/api", () => ({
  KINDS: ["lyric", "melody"],
  api: {
    listNeta: vi.fn().mockResolvedValue([]),
    createNeta: vi.fn(),
    facets: vi.fn().mockResolvedValue({ kind: [], mood: [], meter: [], key: [], tags: [] }),
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
});
