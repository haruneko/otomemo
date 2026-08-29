import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ドラム引き出し「フィルの作り方」3択（M2/M3・物理フィル）：
//   ""=格子 / physical=型辞書 / body=解いて作る（body のときだけ「行き先」「手触り」select が追加で送られる）。
// 守りたいのは「未指定は何も送らない＝従来 bit 一致」と「body 以外では行き先/手触りを送らない」の2点。
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

const GEN_DRUMS = GEN_PARTS.find((p) => p.op === "gen_drums")!;

function makeCtx(over: Partial<MelodyGenCtx> = {}): MelodyGenCtx {
  return {
    neta: { id: "sec1", kind: "section", title: "Aメロ", mode: "major", tags: [] } as never,
    keyPc: 0, tempo: 120, liveMeter: "4/4", liveTitle: "曲", BARS: 8, BPB: 4,
    lanes: [], laneChildren: () => [], laneOf: () => undefined,
    sectionChords: () => [{ root: 0, quality: "", start: 0, dur: 4 }],
    sectionBass: () => [],
    sectionDrums: () => null,
    contentDur: () => 4, childDur: () => 0, progForKind: () => undefined,
    reload: vi.fn(async () => {}), onChanged: vi.fn(),
    ...over,
  };
}

describe("ドラム『フィルの作り方』3択→ gen_drums payload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.music.mockResolvedValue({ items: [{ kind: "rhythm", content: { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [] } } }] });
    api.listNeta.mockResolvedValue([]); // fill=0 のライブラリ検索経路（generator を叩かないケース）用

  });

  // 最重要＝drumFillStyle が既定("")のままなら fillStyle キー自体を送らない＝サーバ側の従来 grid 経路(bit一致)に落ちる。
  it("drumFillStyle=\"\"（既定）＝fill を立てても fillStyle を送らない", async () => {
    const { result } = renderHook(() => useMelodyGen(makeCtx()));
    act(() => { result.current.setDrumFill(0.6); });
    await act(async () => { await result.current.genPart(GEN_DRUMS); });
    const body = api.music.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.fill).toBe(0.6);
    expect(body).not.toHaveProperty("fillStyle");
    expect(body).not.toHaveProperty("bodyDepth");
    expect(body).not.toHaveProperty("bodyDrummer");
  });

  it("drumFillStyle=\"physical\"＝fillStyle だけ送る（行き先/手触りは送らない＝body 専用）", async () => {
    const { result } = renderHook(() => useMelodyGen(makeCtx()));
    act(() => { result.current.setDrumFill(0.6); result.current.setDrumFillStyle("physical"); });
    await act(async () => { await result.current.genPart(GEN_DRUMS); });
    const body = api.music.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.fillStyle).toBe("physical");
    expect(body).not.toHaveProperty("bodyDepth");
    expect(body).not.toHaveProperty("bodyDrummer");
  });

  it("drumFillStyle=\"body\"＋行き先\"up\"＝bodyDepth=-0.3 を送る", async () => {
    const { result } = renderHook(() => useMelodyGen(makeCtx()));
    act(() => { result.current.setDrumFill(0.6); result.current.setDrumFillStyle("body"); result.current.setDrumBodyAim("up"); });
    await act(async () => { await result.current.genPart(GEN_DRUMS); });
    const body = api.music.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.fillStyle).toBe("body");
    expect(body.bodyDepth).toBe(-0.3);
  });

  it("drumFillStyle=\"body\"＋行き先\"down\"＝bodyDepth=0.8 を送る", async () => {
    const { result } = renderHook(() => useMelodyGen(makeCtx()));
    act(() => { result.current.setDrumFill(0.6); result.current.setDrumFillStyle("body"); result.current.setDrumBodyAim("down"); });
    await act(async () => { await result.current.genPart(GEN_DRUMS); });
    const body = api.music.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.bodyDepth).toBe(0.8);
  });

  it("drumFillStyle=\"body\"＋手触り指定＝bodyDrummer を送る／おまかせ(\"\")は送らない", async () => {
    const { result } = renderHook(() => useMelodyGen(makeCtx()));
    act(() => { result.current.setDrumFill(0.6); result.current.setDrumFillStyle("body"); result.current.setDrumBodyDrummer("none"); });
    await act(async () => { await result.current.genPart(GEN_DRUMS); });
    const body = api.music.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.bodyDrummer).toBe("none");

    api.music.mockClear();
    const { result: r2 } = renderHook(() => useMelodyGen(makeCtx()));
    act(() => { r2.current.setDrumFill(0.6); r2.current.setDrumFillStyle("body"); });
    await act(async () => { await r2.current.genPart(GEN_DRUMS); });
    const body2 = api.music.mock.calls[0]![1] as Record<string, unknown>;
    expect(body2).not.toHaveProperty("bodyDrummer"); // 手触り「おまかせ」＝未送信
  });

  // fill 自体が立っていない（=0）ときは、フィル関連の設定を選んでいても一切送らない（サーバ側の
  // fillStyle が opt-in と解釈される契約＝「fillCue か opts.fill が無いと物理フィル経路に入らない」）。
  it("fill=0（未指定）のときは drumFillStyle を選んでいても fillStyle を送らない", async () => {
    const { result } = renderHook(() => useMelodyGen(makeCtx()));
    act(() => { result.current.setDrumFillStyle("body"); result.current.setDrumBodyAim("up"); });
    await act(async () => { await result.current.genPart(GEN_DRUMS); });
    // fill=0 のままなので gen_drums はライブラリ検索経路（生成器を叩かない）＝bit 一致の既定を崩さない
    expect(api.music).not.toHaveBeenCalled();
  });
});
