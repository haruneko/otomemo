import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createNeta } = vi.hoisted(() => ({ createNeta: vi.fn() }));
vi.mock("../src/api", () => ({ api: { createNeta } }));
// 音高検出は pitch.ts（別途テスト済）。ここは「録音→melodyネタ化にタグが付くか」だけ見る。
vi.mock("../src/pitch", () => ({
  detectPitchHz: () => null,
  hzToMidi: (h: number) => h,
  pitchTrackToNotes: () => [{ pitch: 60, start: 0, dur: 0.5 }],
}));

import { HummingRecorder } from "../src/components/HummingRecorder";

// getUserMedia / AudioContext の最小フェイク（マイク実体なしでフローを通す）。
class FakeAudioContext {
  sampleRate = 44100;
  createAnalyser() {
    return {
      fftSize: 2048,
      connect() {},
      getFloatTimeDomainData() {},
    };
  }
  createMediaStreamSource() {
    return { connect() {} };
  }
  close() {
    return Promise.resolve();
  }
}

beforeEach(() => {
  createNeta.mockReset().mockResolvedValue(undefined);
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop() {} }] }) },
    configurable: true,
  });
});

describe("HummingRecorder（監査#5：録音ネタに projectTags）", () => {
  it("tags the created melody with projectTags (=仕分け先が付く)", async () => {
    render(<HummingRecorder projectTags={["prj:みなそこ"]} />);
    await userEvent.click(screen.getByRole("button", { name: "ハミング録音" }));
    // start() の await 後、停止ボタンに切り替わる＝録音中。
    const stop = await screen.findByRole("button", { name: "● 停止してネタ化" });
    await userEvent.click(stop);
    await waitFor(() =>
      expect(createNeta).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "melody", tags: ["prj:みなそこ"] }),
      ),
    );
  });

  it("defaults to empty tags when projectTags is not given", async () => {
    render(<HummingRecorder />);
    await userEvent.click(screen.getByRole("button", { name: "ハミング録音" }));
    const stop = await screen.findByRole("button", { name: "● 停止してネタ化" });
    await userEvent.click(stop);
    await waitFor(() =>
      expect(createNeta).toHaveBeenCalledWith(expect.objectContaining({ tags: [] })),
    );
  });
});
