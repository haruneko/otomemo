import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// 奏法UIスライスD：ベース引き出し「細かく（ドラム絡み・分数）」群→ genPart(gen_bass) の payload に
// kickLock/snareGap/approach/slashBass＋drums が載る。全 OFF＝未送信＝従来 bit 一致。
const api = vi.hoisted(() => ({
  createNeta: vi.fn(),
  placeChild: vi.fn(),
  removeChild: vi.fn(),
  link: vi.fn(),
  music: vi.fn(),
  listNeta: vi.fn(),
}));
vi.mock("../src/api", () => ({ api }));

import { useMelodyGen, GEN_PARTS, type MelodyGenCtx } from "../src/useMelodyGen";

const GEN_BASS = GEN_PARTS.find((p) => p.op === "gen_bass")!;
const DRUMS = { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "Kick", midi: 36, hits: [0, 8], vel: 115 }] } };

function makeCtx(over: Partial<MelodyGenCtx> = {}): MelodyGenCtx {
  return {
    neta: { id: "sec1", kind: "section", title: "Aメロ", mode: "major", tags: [] } as never,
    keyPc: 0, tempo: 120, liveMeter: "4/4", liveTitle: "曲", BARS: 8, BPB: 4,
    lanes: [], laneChildren: () => [], laneOf: () => undefined,
    sectionChords: () => [{ root: 0, quality: "", start: 0, dur: 4 }],
    sectionBass: () => [],
    sectionDrums: () => DRUMS,
    contentDur: () => 4, childDur: () => 0, progForKind: () => undefined,
    reload: vi.fn(async () => {}), onChanged: vi.fn(),
    ...over,
  };
}

describe("ベース×ドラム『細かく』群→ gen_bass payload（スライスD）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.music.mockResolvedValue({ items: [{ kind: "bass", content: { notes: [] } }] });
    api.listNeta.mockResolvedValue([]); // Task2/L3：既定（ノブ無し）はライブラリ検索＝seed 未投入なら空
  });

  // Task2/L3：既定（全OFF）はライブラリ検索へ寄る＝生成器 gen_bass は叩かない（ノブが立つと第二経路＝生成器へ・下記）。
  it("既定（全OFF）＝ライブラリ検索（kind:'bass' scope:'library'）へ・gen_bass 生成器は叩かない", async () => {
    const { result } = renderHook(() => useMelodyGen(makeCtx()));
    await act(async () => { await result.current.genPart(GEN_BASS); });
    expect(api.music).not.toHaveBeenCalled();
    const q = api.listNeta.mock.calls[0]![0] as { kind: string; scope: string };
    expect(q.kind).toBe("bass");
    expect(q.scope).toBe("library");
  });

  it("ノブを立てると payload に値＋drums が載る", async () => {
    const { result } = renderHook(() => useMelodyGen(makeCtx()));
    act(() => { result.current.setBassKickLock(0.6); result.current.setBassSnareGap(0.4); result.current.setBassApproach(0.3); result.current.setBassSlash(true); });
    await act(async () => { await result.current.genPart(GEN_BASS); });
    const body = api.music.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.kickLock).toBe(0.6);
    expect(body.snareGap).toBe(0.4);
    expect(body.approach).toBe(0.3);
    expect(body.slashBass).toBe(true);
    expect(body.drums).toEqual(DRUMS); // kick 絡みノブ在時のみ drums を渡す
  });

  it("逆相（kickLock=-0.6）も送る／分数のみ ON は drums 不要で slashBass だけ載る", async () => {
    const { result } = renderHook(() => useMelodyGen(makeCtx()));
    act(() => { result.current.setBassKickLock(-0.6); });
    await act(async () => { await result.current.genPart(GEN_BASS); });
    expect((api.music.mock.calls[0]![1] as Record<string, unknown>).kickLock).toBe(-0.6);

    api.music.mockClear();
    const { result: r2 } = renderHook(() => useMelodyGen(makeCtx()));
    act(() => { r2.current.setBassSlash(true); });
    await act(async () => { await r2.current.genPart(GEN_BASS); });
    const body2 = api.music.mock.calls[0]![1] as Record<string, unknown>;
    expect(body2.slashBass).toBe(true);
    expect(body2).not.toHaveProperty("drums"); // 分数は単独＝キック絡み無し＝drums 不要
  });
});
