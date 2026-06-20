import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { updateNeta, deleteNeta } = vi.hoisted(() => ({
  updateNeta: vi.fn().mockResolvedValue({}),
  deleteNeta: vi.fn().mockResolvedValue({ deleted: true }),
}));
vi.mock("../src/api", () => ({ api: { updateNeta, deleteNeta } }));

import { NetaDialog } from "../src/components/NetaDialog";

const neta: Neta = {
  id: "x",
  kind: "lyric",
  title: null,
  text: "夜",
  content: null,
  key: null,
  mode: null,
  tempo: null,
  meter: null,
  bars: null,
  mood: null,
  tags: ["サビ"],
  created: "",
  updated: "",
};

describe("NetaDialog", () => {
  it("edits text and saves", async () => {
    const onChanged = vi.fn();
    const onClose = vi.fn();
    render(<NetaDialog neta={neta} onClose={onClose} onChanged={onChanged} />);
    const ta = screen.getByLabelText("text");
    await userEvent.clear(ta);
    await userEvent.type(ta, "朝を待つ");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    expect(updateNeta.mock.calls[0]![1].text).toBe("朝を待つ");
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a piano roll for melody and saves notes", async () => {
    const melody: Neta = { ...neta, kind: "melody", text: null, content: null };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("pitch-60-beat-0"));
    await userEvent.selectOptions(screen.getByLabelText("key"), "9");
    const tempoInput = screen.getByLabelText("tempo");
    await userEvent.clear(tempoInput);
    await userEvent.type(tempoInput, "140");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content).toEqual({ notes: [{ pitch: 60, start: 0, dur: 1 }] });
    expect(patch.key).toBe(9);
    expect(patch.tempo).toBe(140);
  });

  it("edits a chord progression and saves content.chords", async () => {
    const cp: Neta = { ...neta, kind: "chord_progression", text: null, content: null };
    render(<NetaDialog neta={cp} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "＋コード" }));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content).toEqual({ chords: [{ root: "C", quality: "", start: 0, dur: 4 }] });
  });

  it("deletes after confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onChanged = vi.fn();
    render(<NetaDialog neta={neta} onClose={vi.fn()} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(deleteNeta).toHaveBeenCalledWith("x"));
    expect(onChanged).toHaveBeenCalled();
  });
});
