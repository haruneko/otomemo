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

describe("SectionEditor", () => {
  it("loads children and removes one", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 0, ord: 0, node: { neta: mk("c1", "melody"), children: [] } }],
    });
    removeChild.mockResolvedValue({ ok: true });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("remove-c1");
    await userEvent.click(screen.getByLabelText("remove-c1"));
    expect(removeChild).toHaveBeenCalledWith("s1", "c1");
  });

  it("searches and adds a child at the end", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    listNeta.mockResolvedValue([mk("c2", "chord", { title: "Am" })]);
    placeChild.mockResolvedValue({ ok: true });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await userEvent.type(screen.getByLabelText("add-child"), "Am");
    await waitFor(() => expect(screen.getByText(/Am/)).toBeInTheDocument());
    await userEvent.click(screen.getByText(/Am/));
    expect(placeChild).toHaveBeenCalledWith("s1", "c2", 0, 0);
  });
});
