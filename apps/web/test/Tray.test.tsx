import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { listJobs } = vi.hoisted(() => ({ listJobs: vi.fn() }));
vi.mock("../src/api", () => ({ api: { listJobs } }));

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
    render(<Tray onClose={vi.fn()} />);
    expect(await screen.findByText("research")).toBeInTheDocument();
    expect(screen.getByText(/要点A/)).toBeInTheDocument();
  });
});
