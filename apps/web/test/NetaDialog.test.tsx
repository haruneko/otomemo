import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { updateNeta, deleteNeta, getRelations, detectKeyFromChords, playNotes, phStart, phStop } =
  vi.hoisted(() => ({
    updateNeta: vi.fn().mockResolvedValue({}),
    deleteNeta: vi.fn().mockResolvedValue({ deleted: true }),
    getRelations: vi.fn().mockResolvedValue([]),
    detectKeyFromChords: vi.fn(),
    playNotes: vi.fn(),
    phStart: vi.fn(),
    phStop: vi.fn(),
  }));
vi.mock("../src/api", () => ({ api: { updateNeta, deleteNeta, getRelations, detectKeyFromChords } }));
// Tone を読み込まないよう usePlayhead と playNotes だけ差し替え（他の music エクスポートは実物）
vi.mock("../src/usePlayhead", () => ({
  usePlayhead: () => ({
    lineRef: { current: null },
    timeRef: { current: null },
    start: phStart,
    stop: phStop,
  }),
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
  beforeEach(() => localStorage.clear()); // メタ折りたたみ状態が test 間に残らないよう

  it("編集すると自動保存される（明示「保存」不要・押さずに残る）", async () => {
    const onChanged = vi.fn();
    const onClose = vi.fn();
    render(<NetaDialog neta={neta} onClose={onClose} onChanged={onChanged} />);
    const ta = screen.getByLabelText("text");
    await userEvent.clear(ta);
    await userEvent.type(ta, "朝を待つ");
    // 何も押さずデバウンス(600ms)で PATCH が飛ぶ＝メモの当たり前（design 自動保存）
    await waitFor(() => expect(updateNeta).toHaveBeenCalled(), { timeout: 1500 });
    expect(updateNeta.mock.calls.at(-1)![1].text).toBe("朝を待つ");
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled(); // 自動保存は閉じない（保存＝閉じるの2役を解体）
  });

  it("← 戻る は未保存ぶんをフラッシュしてから閉じる", async () => {
    const onChanged = vi.fn();
    const onClose = vi.fn();
    render(<NetaDialog neta={neta} onClose={onClose} onChanged={onChanged} />);
    const ta = screen.getByLabelText("text");
    await userEvent.clear(ta);
    await userEvent.type(ta, "宵闇");
    await userEvent.click(screen.getByLabelText("close")); // ← 戻る
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateNeta).toHaveBeenCalled();
    expect(updateNeta.mock.calls.at(-1)![1].text).toBe("宵闇");
  });

  // userEvent 連打が多くフルスイート並列時に既定5sを超えることがある（2026-07-15夜間監査で3連続タイムアウト・
  // 単体では5.3sで緑）＝ロジックでなく負荷のフレークなので、このテストだけ期限を延ばす。
  it("shows a piano roll for melody and saves notes", { timeout: 20_000 }, async () => {
    const melody: Neta = { ...neta, kind: "melody", text: null, content: null };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("cell-60-0"));
    await userEvent.click(screen.getByLabelText("toggle-meta")); // メタは既定で畳む→開く
    await userEvent.selectOptions(screen.getByLabelText("key"), "9");
    await userEvent.selectOptions(screen.getByLabelText("mode"), "minor"); // 長短を選べる（調号）
    const tempoInput = screen.getByLabelText("tempo");
    await userEvent.clear(tempoInput);
    await userEvent.type(tempoInput, "140");
    // 拍子は単体メロ編集でも変えられる（旧=container限定の非対称を解消・監査 MB-05）。
    await userEvent.selectOptions(screen.getByLabelText("meter"), "6/8");
    await userEvent.click(screen.getByLabelText("save-status")); // 状態ピル＝押すと即フラッシュ
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content).toEqual({ notes: [{ pitch: 60, start: 0, dur: 1 }], program: 0 }); // #47
    expect(patch.key).toBe(9);
    expect(patch.mode).toBe("minor"); // A短として保存（メロ配置の相対移調に効く）
    expect(patch.tempo).toBe(140);
    expect(patch.meter).toBe("6/8"); // 単体メロでも拍子を保存
  });

  it("transport: play→pause→rewind drives playhead (#57/#58/#59)", async () => {
    const pause = vi.fn();
    const stop = vi.fn();
    playNotes.mockResolvedValue({ stop, pause, resume: vi.fn() });
    const melody: Neta = { ...neta, kind: "melody", text: null, content: null };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("cell-60-0")); // ノートを1つ置く

    const pp = screen.getByLabelText("play-pause");
    await userEvent.click(pp); // stopped → playing
    await waitFor(() => expect(playNotes).toHaveBeenCalled());
    expect(phStart).toHaveBeenCalled();
    await waitFor(() => expect(pp).toHaveAttribute("aria-pressed", "true"));

    await userEvent.click(pp); // playing → paused（位置保持）
    expect(pause).toHaveBeenCalled();
    expect(pp).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByLabelText("rewind")); // 頭出し→stopped
    expect(stop).toHaveBeenCalled();
    expect(phStop).toHaveBeenCalled();
  });

  it("transport: loop toggle restarts playback while playing (#59)", async () => {
    playNotes.mockClear(); // 前テストの呼び出し回数をリセット
    playNotes.mockResolvedValue({ stop: vi.fn(), pause: vi.fn(), resume: vi.fn() });
    const melody: Neta = { ...neta, kind: "melody", text: null, content: null };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("cell-60-0"));

    await userEvent.click(screen.getByLabelText("play-pause"));
    await waitFor(() => expect(playNotes).toHaveBeenCalledTimes(1));
    const loop = screen.getByLabelText("loop");
    await userEvent.click(loop); // 再生中のループON→鳴らし直し
    await waitFor(() => expect(loop).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(playNotes).toHaveBeenCalledTimes(2));
    // 2回目はループ指定で呼ばれる
    expect(playNotes.mock.calls[1]![2].loop).toEqual({ startBeat: 0, endBeat: 1 });
  });

  it("edits a chord progression and saves content.chords", async () => {
    const cp: Neta = { ...neta, kind: "chord_progression", text: null, content: null };
    render(<NetaDialog neta={cp} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "＋コード" }));
    await userEvent.click(screen.getByLabelText("save-status")); // 状態ピル＝押すと即フラッシュ
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content).toEqual({ chords: [{ root: 0, quality: "", start: 0, dur: 4 }] }); // CP1: 進行は抽象＝program持たない
  });

  it("#9 調を推定：コードから key+mode を設定し、再クリックで候補を切替", async () => {
    detectKeyFromChords.mockResolvedValue({
      candidates: [
        { key: 6, mode: "minor", score: 1 }, // F#m
        { key: 9, mode: "major", score: 0.8 }, // A
      ],
    });
    const cp: Neta = {
      ...neta,
      kind: "chord_progression",
      text: null,
      content: { chords: [{ root: 6, quality: "m", start: 0, dur: 4 }] },
    };
    render(<NetaDialog neta={cp} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("toggle-meta")); // メタは既定で畳む→開く
    // 1回目：第1候補 F#m を設定
    await userEvent.click(screen.getByLabelText("detect-key"));
    await waitFor(() => expect((screen.getByLabelText("key") as HTMLSelectElement).value).toBe("6"));
    expect((screen.getByLabelText("mode") as HTMLSelectElement).value).toBe("minor");
    // 2回目：次候補 A(長調) へ切替
    await userEvent.click(screen.getByLabelText("detect-key"));
    await waitFor(() => expect((screen.getByLabelText("key") as HTMLSelectElement).value).toBe("9"));
    expect((screen.getByLabelText("mode") as HTMLSelectElement).value).toBe("major");
    // 保存パッチに反映
    await userEvent.click(screen.getByLabelText("save-status")); // 状態ピル＝押すと即フラッシュ
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    expect(updateNeta.mock.calls.at(-1)![1].key).toBe(9);
    expect(updateNeta.mock.calls.at(-1)![1].mode).toBe("major");
  });

  it("edits a rhythm and saves content.rhythm", async () => {
    const r: Neta = { ...neta, kind: "rhythm", text: null, content: null };
    render(<NetaDialog neta={r} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("hit-Kick-0"));
    await userEvent.click(screen.getByLabelText("save-status")); // 状態ピル＝押すと即フラッシュ
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content.rhythm.lanes[0]).toEqual({ name: "Kick", midi: 36, hits: [0] });
  });

  it("shows related neta (連関)", async () => {
    getRelations.mockResolvedValueOnce([
      { type: "result", neta: { ...neta, id: "m1", kind: "melody", title: "メロ案", text: null } },
    ]);
    render(<NetaDialog neta={neta} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText(/メロディ: メロ案/)).toBeInTheDocument(); // 種別は日本語ラベル
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
