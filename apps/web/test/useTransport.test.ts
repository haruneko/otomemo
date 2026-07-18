import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// #27：useTransport は getPlan（PlaybackPlan）を受け、駆動層 startPlayback（playback.ts）経由で鳴らす。
// Tone を読み込まないよう usePlayhead と startPlayback を差し替え。
const { startPlayback, phStart, phStop } = vi.hoisted(() => ({
  startPlayback: vi.fn(),
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
vi.mock("../src/playback", () => ({ startPlayback }));

import { useTransport } from "../src/useTransport";
import type { PlaybackPlan } from "../src/music";

const NOTES = [{ pitch: 60, start: 0, dur: 2 }];
const PLAN: PlaybackPlan = { notes: NOTES, bpm: 120, vocalJobs: [] };
const getPlan = () => PLAN;

describe("useTransport (#59・#27 getPlan)", () => {
  beforeEach(() => {
    startPlayback.mockReset();
    phStart.mockReset();
    phStop.mockReset();
  });

  it("state machine: stopped→playing→paused→playing→stopped", async () => {
    const pause = vi.fn();
    const resume = vi.fn();
    const stop = vi.fn();
    startPlayback.mockResolvedValue({ pause, resume, stop });

    const { result } = renderHook(() => useTransport(getPlan, 120, { scaleBeats: 4, bpb: 4 }));
    expect(result.current.state).toBe("stopped");

    await act(async () => { result.current.playPause(); });
    await waitFor(() => expect(result.current.state).toBe("playing"));
    expect(startPlayback).toHaveBeenCalledTimes(1);
    expect(startPlayback.mock.calls[0]![1].vocalMode).toBe("ensure"); // 駆動層に ensure を渡す
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

  it("二重発火：startPlayback が null（ensure 進行中）＝playing に倒さない", async () => {
    startPlayback.mockResolvedValue(null);
    const { result } = renderHook(() => useTransport(getPlan, 120, { scaleBeats: 4 }));
    await act(async () => { result.current.playPause(); });
    await waitFor(() => expect(startPlayback).toHaveBeenCalledTimes(1));
    expect(result.current.state).toBe("stopped"); // null＝始めなかった
  });

  it("loop toggle while playing restarts playback with loop range", async () => {
    startPlayback.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop: vi.fn() });
    const { result } = renderHook(() => useTransport(getPlan, 120, { scaleBeats: 4 }));

    await act(async () => { result.current.playPause(); });
    await waitFor(() => expect(startPlayback).toHaveBeenCalledTimes(1));

    await act(async () => { result.current.toggleLoop(); });
    await waitFor(() => expect(result.current.loopOn).toBe(true));
    await waitFor(() => expect(startPlayback).toHaveBeenCalledTimes(2));
    // total = start0+dur2 = 2 → ループ区間 0..2
    expect(startPlayback.mock.calls[1]![1].loop).toEqual({ startBeat: 0, endBeat: 2 });
  });

  it("toggleLoop while playing switches in place via setLooping (弱起なし; no stop/begin)", async () => {
    const stop = vi.fn();
    const setLooping = vi.fn();
    const setLoopRange = vi.fn();
    startPlayback.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop, setLooping, setLoopRange, leadBeats: 0 });
    const { result } = renderHook(() => useTransport(getPlan, 120, { scaleBeats: 4, range: { startBeat: 0, endBeat: 2 } }));
    await act(async () => { result.current.playPause(); });
    await waitFor(() => expect(startPlayback).toHaveBeenCalledTimes(1));

    await act(async () => { result.current.toggleLoop(); });
    await waitFor(() => expect(result.current.loopOn).toBe(true));
    expect(setLooping).toHaveBeenCalledWith(true);
    expect(setLoopRange).toHaveBeenCalledWith(0, 2);
    expect(stop).not.toHaveBeenCalled();
    expect(startPlayback).toHaveBeenCalledTimes(1);
  });

  it("toggleLoop while playing falls back to stop→begin when 弱起 (leadBeats>0)", async () => {
    const stop = vi.fn();
    const setLooping = vi.fn();
    startPlayback.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop, setLooping, leadBeats: 0.5 });
    const { result } = renderHook(() => useTransport(getPlan, 120, { scaleBeats: 4 }));
    await act(async () => { result.current.playPause(); });
    await waitFor(() => expect(startPlayback).toHaveBeenCalledTimes(1));

    await act(async () => { result.current.toggleLoop(); });
    await waitFor(() => expect(startPlayback).toHaveBeenCalledTimes(2));
    expect(stop).toHaveBeenCalled();
    expect(setLooping).not.toHaveBeenCalled();
  });

  it("range option is forwarded as the loop window; omitted range keeps 0..total (bit一致)", async () => {
    startPlayback.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop: vi.fn() });
    const { result } = renderHook(() => useTransport(getPlan, 120, { scaleBeats: 8, range: { startBeat: 4, endBeat: 6 } }));
    act(() => result.current.toggleLoop());
    await act(async () => { result.current.playPause(); });
    await waitFor(() => expect(startPlayback).toHaveBeenCalledTimes(1));
    expect(startPlayback.mock.calls[0]![1].loop).toEqual({ startBeat: 4, endBeat: 6 });
  });

  it("reloop reschedules in place while playing (no stop/begin＝頭に戻らない); no-op while stopped", async () => {
    const stop = vi.fn();
    const reschedule = vi.fn();
    const setLoopRange = vi.fn();
    startPlayback.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop, setLensGain: vi.fn(), reschedule, setLoopRange });
    const { result } = renderHook(() => useTransport(getPlan, 120, { scaleBeats: 8, range: { startBeat: 0, endBeat: 8 } }));
    act(() => result.current.reloop());
    expect(startPlayback).not.toHaveBeenCalled();
    expect(reschedule).not.toHaveBeenCalled();
    await act(async () => { result.current.playPause(); });
    await waitFor(() => expect(startPlayback).toHaveBeenCalledTimes(1));
    await act(async () => { result.current.reloop(); });
    await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));
    expect(reschedule).toHaveBeenCalledWith(NOTES); // getPlan().notes を渡す
    expect(setLoopRange).toHaveBeenCalledWith(0, 8);
    expect(stop).not.toHaveBeenCalled();
    expect(startPlayback).toHaveBeenCalledTimes(1);
  });

  it("lens gate: setLensGain passes through to handle without rescheduling; activeLens forwarded", async () => {
    const setLensGain = vi.fn();
    startPlayback.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), setLensGain });
    const { result } = renderHook(() => useTransport(getPlan, 120, { scaleBeats: 4, activeLens: "fold" }));
    await act(async () => { result.current.playPause(); });
    await waitFor(() => expect(startPlayback).toHaveBeenCalledTimes(1));
    expect(startPlayback.mock.calls[0]![1].activeLens).toBe("fold");

    act(() => {
      result.current.setLensGain("fold", false);
      result.current.setLensGain("real", true);
    });
    expect(setLensGain).toHaveBeenCalledWith("fold", false);
    expect(setLensGain).toHaveBeenCalledWith("real", true);
    expect(startPlayback).toHaveBeenCalledTimes(1);
  });

  it("forwards handle.leadBeats to startPh (弱起 lead); omitted → 0", async () => {
    startPlayback.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), leadBeats: 0.5 });
    const { result } = renderHook(() => useTransport(getPlan, 120, { scaleBeats: 4, bpb: 4 }));
    await act(async () => { result.current.playPause(); });
    await waitFor(() => expect(phStart).toHaveBeenCalled());
    expect(phStart).toHaveBeenLastCalledWith(4, 120, 4, 0.5);

    phStart.mockClear();
    startPlayback.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop: vi.fn() });
    const { result: r2 } = renderHook(() => useTransport(getPlan, 120, { scaleBeats: 4, bpb: 4 }));
    await act(async () => { r2.current.playPause(); });
    await waitFor(() => expect(phStart).toHaveBeenCalled());
    expect(phStart).toHaveBeenLastCalledWith(4, 120, 4, 0);
  });

  it("unmount stops playback (no rogue audio)", async () => {
    const stop = vi.fn();
    startPlayback.mockResolvedValue({ pause: vi.fn(), resume: vi.fn(), stop });
    const { result, unmount } = renderHook(() => useTransport(getPlan, 120, { scaleBeats: 4 }));
    await act(async () => { result.current.playPause(); });
    await waitFor(() => expect(startPlayback).toHaveBeenCalled());
    unmount();
    expect(stop).toHaveBeenCalled();
  });
});
