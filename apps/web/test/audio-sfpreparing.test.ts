// 再生ローディング表示（設計 2026-07-17）赤③：W3 sampler 準備中フラグ sfPreparing の新設。
// playNotes が SF2 有効経路で prepareDrumKits/prepareMelodicSamplers を包む間だけ true→false を1往復。
// SF2 無し（activeSfUrl=null）経路では prepare を通らない＝発火しない。
// 実 Tone は読まずモック（audio-setlooping と同型）。SF2 ロードは __setSfTestHooks の fake makeSampler で温める。
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

import {
  playNotes,
  setActiveSoundFont,
  ensureSoundFont,
  __setSfTestHooks,
  subscribeSfPreparing,
  isSfPreparing,
} from "../src/audio";

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

// 即解決の fake sampler（instrumentNames 空でも prepare の wrap は通る）。
function fakeSampler() {
  return {
    ready: Promise.resolve(),
    instrumentNames: ["Acoustic Grand Piano"],
    loadInstrument: async () => {},
  };
}

beforeEach(() => {
  holder.current = makeTransport();
});

describe("sfPreparing 通知（設計 2026-07-17 赤③）", () => {
  it("SF2 有効経路の playNotes は sfPreparing を true→false と1往復させる", async () => {
    __setSfTestHooks({ makeSampler: async () => fakeSampler(), reset: true });
    setActiveSoundFont("blob:sfprep-1");
    // 事前に SF2 を温める（warm）＝playNotes 内 ensureSoundFont(false) が sfSampler を即返す。
    await ensureSoundFont({}, 0, true);

    const seen: boolean[] = [];
    const unsub = subscribeSfPreparing((v) => seen.push(v));
    expect(isSfPreparing()).toBe(false);

    await playNotes([{ pitch: 60, start: 0, dur: 1 }], 120, {});

    unsub();
    expect(seen).toEqual([true, false]); // prepare を包む間だけ true、抜けたら false
    expect(isSfPreparing()).toBe(false);

    __setSfTestHooks({ makeSampler: null, reset: true });
    setActiveSoundFont(null);
  });

  it("SF2 無し（activeSfUrl=null）経路では sfPreparing は発火しない", async () => {
    __setSfTestHooks({ makeSampler: null, reset: true });
    setActiveSoundFont(null); // ensureSoundFont は即 null＝prepare を通らない

    const seen: boolean[] = [];
    const unsub = subscribeSfPreparing((v) => seen.push(v));

    await playNotes([{ pitch: 60, start: 0, dur: 1 }], 120, {});

    unsub();
    expect(seen).toEqual([]);
    expect(isSfPreparing()).toBe(false);
  });
});
