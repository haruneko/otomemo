import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Tone を読み込まないよう usePlayhead と playNotes を差し替え（他の music は実物）。
const { playNotes, phStart, phStop } = vi.hoisted(() => ({
  playNotes: vi.fn(),
  phStart: vi.fn(),
  phStop: vi.fn(),
}));
vi.mock("../src/usePlayhead", () => ({
  usePlayhead: () => ({
    lineRef: { current: null },
    timeRef: { current: null },
    scrollerRef: { current: null },
    start: phStart,
    stop: phStop,
  }),
}));
vi.mock("../src/music", async (orig) => ({
  ...(await orig<typeof import("../src/music")>()),
  playNotes,
}));

import { useTransport } from "../src/useTransport";

const NOTES = [{ pitch: 60, start: 0, dur: 2 }];

describe("useTransport (#59)", () => {
  beforeEach(() => {
    playNotes.mockReset();
    phStart.mockReset();
    phStop.mockReset();
  });

  it("state machine: stopped→playing→paused→playing→stopped", async () => {
    const pause = vi.fn();
    const resume = vi.fn();
    const stop = vi.fn();
    playNotes.mockResolvedValue({ pause, resume, stop });

    const { result } = renderHook(() =>
      useTransport(() => NOTES, 120, { scaleBeats: 4, bpb: 4 }),
    );
    expect(result.current.state).toBe("stopped");

    await act(async () => {
      result.current.playPause();
    });
    await waitFor(() => expect(result.current.state).toBe("playing"));
    expect(playNotes).toHaveBeenCalledTimes(1);
    expect(phStart).toHaveBeenCalled();

    act(() => result.current.playPause()); // playing→paused
    expect(result.current.state).toBe("paused");
    expect(pause).toHaveBeenCalled();

    act(() => result.current.playPause()); // paused→playing
    expect(result.current.state).toBe("playing");
    expect(resume).toHaveBeenCalled();

    act(() => result.current.rewind()); // →stopped
    expect(result.current.state).toBe("stopped");
    expect(stop).toHaveBeenCalled();
    expect(phStop).toHaveBeenCalled();
  });

  it("loop toggle while playing restarts playback with loop range", async () => {
    playNotes.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop: vi.fn() });
    const { result } = renderHook(() => useTransport(() => NOTES, 120, { scaleBeats: 4 }));

    await act(async () => {
      result.current.playPause();
    });
    await waitFor(() => expect(playNotes).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.toggleLoop();
    });
    await waitFor(() => expect(result.current.loopOn).toBe(true));
    await waitFor(() => expect(playNotes).toHaveBeenCalledTimes(2));
    // total = start0+dur2 = 2 → ループ区間 0..2
    expect(playNotes.mock.calls[1]![2].loop).toEqual({ startBeat: 0, endBeat: 2 });
  });

  // #24 backlog toggleLoop の in-place 化：弱起なし（leadBeats=0）でハンドルが setLooping を持てば、
  //   再生を止めずその場でループ切替（stop→begin しない＝頭出し・全サンプラ再準備なし）。range 指定は先に窓更新。
  it("toggleLoop while playing switches in place via setLooping (弱起なし; no stop/begin)", async () => {
    const stop = vi.fn();
    const setLooping = vi.fn();
    const setLoopRange = vi.fn();
    playNotes.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop, setLooping, setLoopRange, leadBeats: 0 });
    const { result } = renderHook(() =>
      useTransport(() => NOTES, 120, { scaleBeats: 4, range: { startBeat: 0, endBeat: 2 } }),
    );
    await act(async () => {
      result.current.playPause();
    });
    await waitFor(() => expect(playNotes).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.toggleLoop();
    });
    await waitFor(() => expect(result.current.loopOn).toBe(true));
    expect(setLooping).toHaveBeenCalledWith(true);
    expect(setLoopRange).toHaveBeenCalledWith(0, 2); // range 指定＝ループ窓を先に走行中更新
    expect(stop).not.toHaveBeenCalled(); // ★止めない
    expect(playNotes).toHaveBeenCalledTimes(1); // ★begin を回さない＝頭出しなし
  });

  // #25 弱起（handle.leadBeats>0）は非ループ⇄ループでスケジュールが根本的に異なるため in-place 不可＝
  //   従来の stop→begin にフォールバック（setLooping は呼ばない）。
  it("toggleLoop while playing falls back to stop→begin when 弱起 (leadBeats>0)", async () => {
    const stop = vi.fn();
    const setLooping = vi.fn();
    playNotes.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop, setLooping, leadBeats: 0.5 });
    const { result } = renderHook(() => useTransport(() => NOTES, 120, { scaleBeats: 4 }));
    await act(async () => {
      result.current.playPause();
    });
    await waitFor(() => expect(playNotes).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.toggleLoop();
    });
    await waitFor(() => expect(playNotes).toHaveBeenCalledTimes(2)); // begin 再実行＝従来経路
    expect(stop).toHaveBeenCalled();
    expect(setLooping).not.toHaveBeenCalled();
  });

  // #20 S6骨格の机 D1.5：range 指定時は playNotes の loop がその区間・未指定は従来（0..total）。
  it("range option is forwarded as the loop window; omitted range keeps 0..total (bit一致)", async () => {
    playNotes.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop: vi.fn() });
    const { result } = renderHook(() =>
      useTransport(() => NOTES, 120, { scaleBeats: 8, range: { startBeat: 4, endBeat: 6 } }),
    );
    // ループ ON（停止中は begin を回さない）→ 再生（begin(true)）。
    act(() => result.current.toggleLoop());
    await act(async () => {
      result.current.playPause();
    });
    await waitFor(() => expect(playNotes).toHaveBeenCalledTimes(1));
    // range がそのまま loop 窓になる（total=2 ではなく指定の 4..6）。
    expect(playNotes.mock.calls[0]![2].loop).toEqual({ startBeat: 4, endBeat: 6 });
  });

  // #7-C reloop は「その場組み直し（reschedule-in-place）」＝再生を止めず・頭に戻さず最新ノート/レンジを反映。
  //   stop→begin をやめ handle.reschedule（＋range 指定時 setLoopRange）を呼ぶ＝playNotes 再呼び出し無し・stop 無し。
  it("reloop reschedules in place while playing (no stop/begin＝頭に戻らない); no-op while stopped", async () => {
    const stop = vi.fn();
    const reschedule = vi.fn();
    const setLoopRange = vi.fn();
    playNotes.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop, setLensGain: vi.fn(), reschedule, setLoopRange });
    const { result } = renderHook(() =>
      useTransport(() => NOTES, 120, { scaleBeats: 8, range: { startBeat: 0, endBeat: 8 } }),
    );
    // 停止中の reloop は no-op（reschedule も playNotes も回さない）。
    act(() => result.current.reloop());
    expect(playNotes).not.toHaveBeenCalled();
    expect(reschedule).not.toHaveBeenCalled();
    // 再生開始 → reloop はその場組み直し。
    await act(async () => {
      result.current.playPause();
    });
    await waitFor(() => expect(playNotes).toHaveBeenCalledTimes(1));
    await act(async () => {
      result.current.reloop();
    });
    await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));
    expect(setLoopRange).toHaveBeenCalledWith(0, 8); // range 指定＝ループ窓を走行中更新
    expect(stop).not.toHaveBeenCalled(); // ★stop を呼ばない＝音が途切れない
    expect(playNotes).toHaveBeenCalledTimes(1); // ★begin を回さない＝頭に戻らない
  });

  // #20 S6骨格の机：レンズ無停止切替。setLensGain は handle パススルーのみ＝begin（再スケジュール）を回さない。
  it("lens gate: setLensGain passes through to handle without rescheduling; activeLens is forwarded to playNotes", async () => {
    const setLensGain = vi.fn();
    playNotes.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), setLensGain });
    const { result } = renderHook(() =>
      useTransport(() => NOTES, 120, { scaleBeats: 4, activeLens: "fold" }),
    );
    await act(async () => {
      result.current.playPause();
    });
    await waitFor(() => expect(playNotes).toHaveBeenCalledTimes(1));
    // activeLens が playNotes opts に渡る（初期ゲート）。
    expect(playNotes.mock.calls[0]![2].activeLens).toBe("fold");

    // レンズトグル＝ゲート開閉のみ。playNotes は再度呼ばれない（＝再スケジュールしない＝位置が飛ばない）。
    act(() => {
      result.current.setLensGain("fold", false);
      result.current.setLensGain("real", true);
    });
    expect(setLensGain).toHaveBeenCalledWith("fold", false);
    expect(setLensGain).toHaveBeenCalledWith("real", true);
    expect(playNotes).toHaveBeenCalledTimes(1); // ★begin を回避＝再生位置が保持される
  });

  // #25 弱起（負start）の再生契約：playNotes が算出した handle.leadBeats を startPh の第4引数へ渡す
  //   （非ループ時のみ>0）。弱起なし＝leadBeats 0（未定義でも 0 フォールバック）＝従来と bit 一致。
  it("forwards handle.leadBeats to startPh (弱起 lead); omitted → 0", async () => {
    // 弱起あり：handle.leadBeats=0.5 → startPh(scale,bpm,bpb,0.5)。
    playNotes.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), leadBeats: 0.5 });
    const { result } = renderHook(() => useTransport(() => NOTES, 120, { scaleBeats: 4, bpb: 4 }));
    await act(async () => {
      result.current.playPause();
    });
    await waitFor(() => expect(phStart).toHaveBeenCalled());
    expect(phStart).toHaveBeenLastCalledWith(4, 120, 4, 0.5);

    // 弱起なし：handle に leadBeats 無し → 0 フォールバック（従来 bit 一致）。
    phStart.mockClear();
    playNotes.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop: vi.fn() });
    const { result: r2 } = renderHook(() => useTransport(() => NOTES, 120, { scaleBeats: 4, bpb: 4 }));
    await act(async () => {
      r2.current.playPause();
    });
    await waitFor(() => expect(phStart).toHaveBeenCalled());
    expect(phStart).toHaveBeenLastCalledWith(4, 120, 4, 0);
  });

  it("unmount stops playback (no rogue audio)", async () => {
    const stop = vi.fn();
    playNotes.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop });
    const { result, unmount } = renderHook(() =>
      useTransport(() => NOTES, 120, { scaleBeats: 4 }),
    );
    await act(async () => {
      result.current.playPause();
    });
    await waitFor(() => expect(playNotes).toHaveBeenCalled());
    unmount();
    expect(stop).toHaveBeenCalled();
  });
});
