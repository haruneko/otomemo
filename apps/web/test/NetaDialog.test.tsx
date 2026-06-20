import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { updateNeta, deleteNeta, getRelations, playNotes, phStart, phStop } = vi.hoisted(() => ({
  updateNeta: vi.fn().mockResolvedValue({}),
  deleteNeta: vi.fn().mockResolvedValue({ deleted: true }),
  getRelations: vi.fn().mockResolvedValue([]),
  playNotes: vi.fn(),
  phStart: vi.fn(),
  phStop: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: { updateNeta, deleteNeta, getRelations } }));
// Tone を読み込まないよう usePlayhead と playNotes だけ差し替え（他の music エクスポートは実物）
vi.mock("../src/usePlayhead", () => ({
  usePlayhead: () => ({ lineRef: { current: null }, start: phStart, stop: phStop }),
}));
vi.mock("../src/music", async (orig) => ({
  ...(await orig<typeof import("../src/music")>()),
  playNotes,
}));

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
    await userEvent.click(screen.getByLabelText("cell-60-0"));
    await userEvent.selectOptions(screen.getByLabelText("key"), "9");
    const tempoInput = screen.getByLabelText("tempo");
    await userEvent.clear(tempoInput);
    await userEvent.type(tempoInput, "140");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content).toEqual({ notes: [{ pitch: 60, start: 0, dur: 1 }], program: 0 }); // #47
    expect(patch.key).toBe(9);
    expect(patch.tempo).toBe(140);
    expect(patch.bars).toBe(4); // 既定16拍 = 4小節
  });

  it("toggles play↔stop and drives the playhead (#57/#58)", async () => {
    playNotes.mockResolvedValue({ stop: vi.fn(), pause: vi.fn(), resume: vi.fn() });
    const melody: Neta = { ...neta, kind: "melody", text: null, content: null };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("cell-60-0")); // ノートを1つ置く

    await userEvent.click(screen.getByRole("button", { name: "▶ 再生" }));
    await waitFor(() => expect(playNotes).toHaveBeenCalled());
    expect(phStart).toHaveBeenCalled(); // プレイヘッド開始
    // ボタンが停止に変わる
    expect(await screen.findByRole("button", { name: "■ 停止" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "■ 停止" }));
    expect(phStop).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "▶ 再生" })).toBeInTheDocument();
  });

  it("edits a chord progression and saves content.chords", async () => {
    const cp: Neta = { ...neta, kind: "chord_progression", text: null, content: null };
    render(<NetaDialog neta={cp} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "＋コード" }));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content).toEqual({ chords: [{ root: 0, quality: "", start: 0, dur: 4 }], program: 0 }); // #47
  });

  it("edits a rhythm and saves content.rhythm", async () => {
    const r: Neta = { ...neta, kind: "rhythm", text: null, content: null };
    render(<NetaDialog neta={r} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("hit-Kick-0"));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content.rhythm.lanes[0]).toEqual({ name: "Kick", midi: 36, hits: [0] });
  });

  it("shows related neta (連関)", async () => {
    getRelations.mockResolvedValueOnce([
      { type: "result", neta: { ...neta, id: "m1", kind: "melody", title: "メロ案", text: null } },
    ]);
    render(<NetaDialog neta={neta} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText(/melody: メロ案/)).toBeInTheDocument();
  });

  it("remounts with fresh state when the keyed neta changes (no stale swap)", () => {
    const a: Neta = { ...neta, id: "a", kind: "lyric", title: "AAA", text: null };
    const b: Neta = { ...neta, id: "b", kind: "lyric", title: "BBB", text: null };
    const { rerender } = render(<NetaDialog key={a.id} neta={a} onClose={vi.fn()} />);
    expect((screen.getByLabelText("title") as HTMLInputElement).value).toBe("AAA");
    rerender(<NetaDialog key={b.id} neta={b} onClose={vi.fn()} />);
    expect((screen.getByLabelText("title") as HTMLInputElement).value).toBe("BBB");
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
