// design#25 受け入れ(e)：弱起（負start）の再生プレイヘッド。全イベントを +L シフトして 0 開始した分、
// 視覚は raw−L が真の拍。raw < L（リード区間）は線を 0 位置で待機し position を「弱起…」表示、L 到達後は
// beat=raw−L で従来通り。lead=0（弱起なし）は beat=raw＝従来と bit 一致。
// Tone は実物を読まずモック（getTransport.seconds を制御・getContext.lookAhead=0）。rAF は手動駆動。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// 制御可能な transport.seconds（テストから書き換える）。
const T = { secondsValue: 0 };
vi.mock("tone", () => ({
  getTransport: () => ({
    get seconds() {
      return T.secondsValue;
    },
  }),
  getContext: () => ({ lookAhead: 0 }),
}));

import { usePlayhead } from "../src/usePlayhead";

// rAF を手動駆動化：登録された最新コールバックを保持し、テストが明示的に1フレームだけ進める。
let rafCb: FrameRequestCallback | null = null;
beforeEach(() => {
  T.secondsValue = 0;
  rafCb = null;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCb = cb; // tick は末尾で自分を再登録するので毎回最新の tick を保持
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function frame() {
  const cb = rafCb;
  rafCb = null;
  cb?.(performance.now());
}

describe("#25 (e) usePlayhead リード区間：0 待機＋弱起表示、L 以降は beat=raw−L", () => {
  it("bpm=120・lead=1：raw<1 は線 0 待機＋『弱起…』、raw>=1 は beat=raw−1", async () => {
    const { result } = renderHook(() => usePlayhead());
    const line = document.createElement("div");
    const time = document.createElement("span");
    result.current.lineRef.current = line;
    result.current.timeRef.current = time as unknown as HTMLElement;

    // scaleBeats=8, bpm=120（raw=seconds*2 拍）, bpb=4, leadBeats=1。
    await act(async () => {
      await result.current.start(8, 120, 4, 1);
    });

    // seconds=0 → raw=0, beat=-1 <0 ＝リード区間：線 0・弱起表示。
    T.secondsValue = 0;
    act(() => frame());
    expect(line.style.getPropertyValue("--ph")).toBe("0");
    expect(line.style.getPropertyValue("--phb")).toBe("0");
    expect(time.textContent).toBe("弱起…");

    // seconds=0.25 → raw=0.5, beat=-0.5 <0 ＝まだリード区間。
    T.secondsValue = 0.25;
    act(() => frame());
    expect(line.style.getPropertyValue("--phb")).toBe("0");
    expect(time.textContent).toBe("弱起…");

    // seconds=0.5 → raw=1, beat=0 ＝下拍到達：従来表示（1:1）・線は先頭。
    T.secondsValue = 0.5;
    act(() => frame());
    expect(line.style.getPropertyValue("--phb")).toBe("0");
    expect(time.textContent).toBe("1:1");

    // seconds=1 → raw=2, beat=1 ＝1拍進む：--phb=1・2拍目表示。
    T.secondsValue = 1;
    act(() => frame());
    expect(line.style.getPropertyValue("--phb")).toBe("1");
    expect(line.style.getPropertyValue("--ph")).toBe(String(1 / 8));
    expect(time.textContent).toBe("1:2");
  });

  it("lead=0（弱起なし）は beat=raw＝従来と bit 一致（弱起表示は出ない）", async () => {
    const { result } = renderHook(() => usePlayhead());
    const line = document.createElement("div");
    const time = document.createElement("span");
    result.current.lineRef.current = line;
    result.current.timeRef.current = time as unknown as HTMLElement;

    await act(async () => {
      await result.current.start(8, 120, 4); // leadBeats 省略＝0
    });

    // seconds=0.5 → raw=1, beat=1（lead=0）＝従来どおり --phb=1・2拍目。
    T.secondsValue = 0.5;
    act(() => frame());
    expect(line.style.getPropertyValue("--phb")).toBe("1");
    expect(time.textContent).toBe("1:2");
    expect(time.textContent).not.toBe("弱起…");
  });
});
