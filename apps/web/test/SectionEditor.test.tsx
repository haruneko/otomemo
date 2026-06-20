import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { getComposition, listNeta, placeChild, removeChild } = vi.hoisted(() => ({
  getComposition: vi.fn(),
  listNeta: vi.fn(),
  placeChild: vi.fn(),
  removeChild: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: { getComposition, listNeta, placeChild, removeChild } }));

import { SectionEditor } from "../src/components/SectionEditor";

const mk = (id: string, kind: string, over: Partial<Neta> = {}): Neta => ({
  id,
  kind,
  title: null,
  text: id,
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

describe("SectionEditor (3-lane timeline)", () => {
  it("shows a placed child on its lane and removes it on tap", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 0, ord: 0, node: { neta: mk("c1", "melody", { title: "メロ案" }), children: [] } }],
    });
    removeChild.mockResolvedValue({ ok: true });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-c1");
    await userEvent.click(screen.getByLabelText("block-c1"));
    expect(removeChild).toHaveBeenCalledWith("s1", "c1");
  });

  it("taps a melody-lane cell to place a neta at that bar (position = bar*4)", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    listNeta.mockResolvedValue([mk("c2", "melody", { title: "メロ素材" })]);
    placeChild.mockResolvedValue({ ok: true });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await userEvent.click(screen.getByLabelText("place-melody-1")); // 2小節目 = position 4
    await waitFor(() => expect(screen.getByText("メロ素材")).toBeInTheDocument());
    await userEvent.click(screen.getByText("メロ素材"));
    expect(placeChild).toHaveBeenCalledWith("s1", "c2", 4, 0);
  });
});
