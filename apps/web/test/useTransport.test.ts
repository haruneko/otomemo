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
