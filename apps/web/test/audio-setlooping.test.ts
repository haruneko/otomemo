// toggleLoop の in-place 化（design#24 backlog）：PlaybackHandle.setLooping の audio 側単体。
// 実 Tone は読まずモック（transport / context / synth を最小フェイク）。SF2 は未選択＝簡易シンセ経路。
// 検証：ON=終端 scheduleOnce の解除＋loop点設定、OFF=loop 解除＋終端 stop 再スケジュール、再生は止めない。
import { describe, it, expect, vi, beforeEach } from "vitest";

const holder = vi.hoisted(() => ({ current: null as any }));

vi.mock("tone", () => {
  class FakeNode {
    gain = { value: 1, setTargetAtTime: () => {} };
    threshold = { value: 0 };
    knee = { value: 0 };
    ratio = { value: 0 };
    attack = { value: 0 };
    release = { value: 0 };
    connect() {
      return this;
    }
    triggerAttackRelease() {}
    dispose() {}
    start() {}
    stop() {}
  }
  const ctx = {
    currentTime: 0,
    destination: {},
    createGain: () => new FakeNode(),
    createDynamicsCompressor: () => new FakeNode(),
  };
  return {
    start: async () => {},
    getTransport: () => holder.current,
    getContext: () => ({ rawContext: ctx }),
    PolySynth: FakeNode,
    Synth: FakeNode,
    MembraneSynth: FakeNode,
    NoiseSynth: FakeNode,
    Frequency: () => ({ toFrequency: () => 440, toNote: () => "A4" }),
  };
});

import { playNotes, setActiveSoundFont } from "../src/audio";

function makeTransport() {
  let seq = 0;
  return {
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    seconds: 0,
    bpm: { value: 0 },
    schedule: vi.fn(() => ++seq),
    scheduleOnce: vi.fn(() => ++seq),
    clear: vi.fn(),
    cancel: vi.fn(),
    stop: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
  };
}

beforeEach(() => {
  holder.current = makeTransport();
  setActiveSoundFont(null); // SF2 未選択＝ensureSoundFont は即 null（簡易シンセ経路・実音源読まない）
});

describe("#24 backlog PlaybackHandle.setLooping（in-place ループ切替）", () => {
  it("弱起なし：ON=終端解除＋loop点設定 / OFF=loop解除＋終端再スケジュール（再生を止めない）", async () => {
    const t = holder.current;
    const handle = await playNotes([{ pitch: 60, start: 0, dur: 2 }], 120, {});

    // 初回＝非ループ：終端 自動停止の scheduleOnce が1回。
    expect(t.scheduleOnce).toHaveBeenCalledTimes(1);
    const endId = t.scheduleOnce.mock.results[0]!.value;
    expect(t.loop).toBe(false);

    // 以降 stop が呼ばれないこと（setup の transport.stop() は除外）を見るためクリア。
    t.stop.mockClear();

    handle.setLooping(true);
    expect(t.clear).toHaveBeenCalledWith(endId); // 終端 自動停止を解除
    expect(t.loop).toBe(true);
    expect(t.loopStart).toBe(0);
    expect(t.loopEnd).toBe(1); // total 2拍 × spb(0.5) = 1秒

    handle.setLooping(false);
    expect(t.loop).toBe(false);
    expect(t.scheduleOnce).toHaveBeenCalledTimes(2); // 終端 stop を再スケジュール
    expect(t.stop).not.toHaveBeenCalled(); // ★再生を止めない（stop→begin しない＝頭出しなし）
  });

  it("弱起あり（leadBeats>0）は setLooping を no-op（in-place 不可＝呼び出し側が従来経路）", async () => {
    const t = holder.current;
    const handle = await playNotes([{ pitch: 60, start: -0.5, dur: 1 }], 120, {});
    expect(handle.leadBeats).toBe(0.5);

    t.clear.mockClear();
    handle.setLooping(true);
    expect(t.loop).toBe(false); // 変わらない
    expect(t.clear).not.toHaveBeenCalled();
  });

  it("stop 後の setLooping は no-op", async () => {
    const t = holder.current;
    const handle = await playNotes([{ pitch: 60, start: 0, dur: 2 }], 120, {});
    handle.stop();
    t.clear.mockClear();
    handle.setLooping(true);
    expect(t.clear).not.toHaveBeenCalled();
  });
});
