import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// 巻き込み削除の確認ダイアログ（オーナー仕様 2026-07-15）：placeCandidate は同レーンで尺が重なる
// 既存配置を **無確認で消さない**。重なりがあれば window.confirm を出し、OK=既存を外して置く／
// キャンセル=何も変えない（createNeta もしない）。重なり無し=confirm を呼ばず即配置。
const api = vi.hoisted(() => ({
  createNeta: vi.fn(),
  placeChild: vi.fn(),
  removeChild: vi.fn(),
  link: vi.fn(),
  music: vi.fn(),
}));
vi.mock("../src/api", () => ({ api }));

import { useMelodyGen, type Cand, type MelodyGenCtx } from "../src/useMelodyGen";
import type { Lane, Child } from "../src/components/sectionLanes";

const MEL_LANE: Lane = { key: "melody", label: "メロ", kinds: ["melody"], row: 0 };

// 位置 pos・尺 dur の melody 子（title 付き）を作る。
function child(id: string, title: string, pos: number, dur: number): { ch: Child; dur: number } {
  const ch = {
    position: pos,
    ord: 0,
    node: { neta: { id, kind: "melody", title }, children: [] },
  } as unknown as Child;
  return { ch, dur };
}

function makeCtx(children: { ch: Child; dur: number }[]): MelodyGenCtx {
  const durOf = new Map(children.map((c) => [c.ch.node.neta.id, c.dur]));
  return {
    neta: { id: "sec1", kind: "section", title: "Aメロ", mode: "major", tags: [] } as never,
    keyPc: 0,
    tempo: 120,
    liveMeter: "4/4",
    liveTitle: "テスト曲",
    BARS: 8,
    BPB: 4,
    lanes: [MEL_LANE],
    laneChildren: () => children.map((c) => c.ch),
    laneOf: (kind) => (kind === "melody" ? MEL_LANE : undefined),
    sectionChords: () => [],
    sectionBass: () => [],
    sectionDrums: () => null,
    contentDur: () => 4, // 置く新メロの尺＝4拍（=1小節）
    childDur: (ch) => durOf.get(ch.node.neta.id) ?? 0,
    progForKind: () => undefined,
    reload: vi.fn(async () => {}),
    onChanged: vi.fn(),
  };
}

const cand: Cand = { kind: "melody", content: { notes: [] }, cid: 1 };

describe("placeCandidate 巻き込み削除の確認ダイアログ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.createNeta.mockResolvedValue({ id: "new1" });
    api.placeChild.mockResolvedValue({});
    api.removeChild.mockResolvedValue({});
    api.link.mockResolvedValue({});
  });
  afterEach(() => vi.restoreAllMocks());

  it("重なり有り＋confirm OK → 既存を外して配置", async () => {
    // 既存メロが位置0..4に居る＝新メロ(0..4)と重なる。
    const ctx = makeCtx([child("old1", "既存メロ", 0, 4)]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = renderHook(() => useMelodyGen(ctx));
    await act(async () => { await result.current.placeCandidate(cand); });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0]![0]).toContain("既存メロ"); // 何が消えるかを文言に含む
    expect(confirmSpy.mock.calls[0]![0]).toContain("1件");
    expect(api.createNeta).toHaveBeenCalledTimes(1);
    expect(api.removeChild).toHaveBeenCalledTimes(1);
    expect(api.removeChild).toHaveBeenCalledWith("sec1", "old1", 0); // 重なる既存が外れる
    expect(api.placeChild).toHaveBeenCalledTimes(1); // 新メロが置かれる
  });

  it("重なり有り＋confirm キャンセル → 何も変わらない（createNeta もしない）", async () => {
    const ctx = makeCtx([child("old1", "既存メロ", 0, 4)]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useMelodyGen(ctx));
    await act(async () => { await result.current.placeCandidate(cand); });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(api.createNeta).not.toHaveBeenCalled();
    expect(api.removeChild).not.toHaveBeenCalled();
    expect(api.placeChild).not.toHaveBeenCalled();
  });

  it("重なり無し → confirm を呼ばず即配置（別小節の既存を巻き添えにしない）", async () => {
    // 既存メロは位置8..12＝新メロ(0..4)と重ならない。
    const ctx = makeCtx([child("old2", "別小節メロ", 8, 4)]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = renderHook(() => useMelodyGen(ctx));
    await act(async () => { await result.current.placeCandidate(cand); });

    expect(confirmSpy).not.toHaveBeenCalled(); // 重なり無し＝確認しない
    expect(api.createNeta).toHaveBeenCalledTimes(1);
    expect(api.removeChild).not.toHaveBeenCalled(); // 別小節は外さない
    expect(api.placeChild).toHaveBeenCalledTimes(1);
  });
});
