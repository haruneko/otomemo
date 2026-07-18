// #27 駆動層 playback.ts の契約（正典 §2.3・§4 S2）。
//  ensureVocal 進捗／peek 非待機／startPlayback ensure→play 順序／stale-stop no-op／二重発火 no-op。
import { describe, it, expect, vi, beforeEach } from "vitest";

const singControl = vi.hoisted(() => {
  const pending: { resolve: (v: any) => void; reject: (e: any) => void }[] = [];
  return {
    pending,
    sing: vi.fn(() => new Promise((resolve, reject) => { pending.push({ resolve, reject }); })),
    reset: () => { pending.length = 0; singControl.sing.mockClear(); },
  };
});
const playControl = vi.hoisted(() => ({ playNotes: vi.fn(), reset: () => playControl.playNotes.mockReset() }));

vi.mock("../src/api", () => ({ api: { sing: singControl.sing, assetUrl: (id: string) => `blob:asset-${id}` } }));
// playback.ts は playNotes/decodeVocal を "./audio" から直 import（#27 S5）。ここを差し替えて Tone を起動しない。
vi.mock("../src/audio", () => ({ decodeVocal: vi.fn(async () => ({ length: 1, sampleRate: 48000 })), playNotes: playControl.playNotes }));

import { ensureVocal, peekVocal, startPlayback, __resetPlaybackForTest } from "../src/playback";
import type { PlaybackPlan, VocalJob } from "../src/music";

const job = (key: string): VocalJob => ({ key, notes: [{ pitch: 60, start: 0, dur: 1, syllable: "ら" }], bpm: 120, firstNoteBeat: 0 });
const plan = (over?: Partial<PlaybackPlan>): PlaybackPlan => ({ notes: [{ pitch: 60, start: 0, dur: 1 }], bpm: 120, vocalJobs: [], ...over });
const flushMicro = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const fakeHandle = () => ({ pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), setLensGain: vi.fn(), reschedule: vi.fn(), setLoopRange: vi.fn(), setLooping: vi.fn(), leadBeats: 0 });

beforeEach(() => {
  singControl.reset();
  playControl.reset();
  __resetPlaybackForTest();
  (globalThis as any).fetch = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(4) }));
  playControl.playNotes.mockResolvedValue(fakeHandle());
});

describe("ensureVocal 進捗（missing 2件）", () => {
  it("直列レンダで sing が1本ずつ発火し VocalPlay[] を返す", async () => {
    const done = ensureVocal([job("a"), job("b")]);
    await flushMicro();
    expect(singControl.sing).toHaveBeenCalledTimes(1); // 直列＝1本目のみ
    singControl.pending[0]!.resolve({ assetId: "a", shift: 0, clamped: 0, speaker: 0, leadRestSec: 0 });
    await flushMicro();
    expect(singControl.sing).toHaveBeenCalledTimes(2);
    singControl.pending[1]!.resolve({ assetId: "b", shift: 0, clamped: 0, speaker: 0, leadRestSec: 0 });
    const plays = await done;
    expect(plays).toHaveLength(2);
  });
});

describe("peekVocal は絶対に待たない", () => {
  it("未レンダ＝null（api.sing を呼ばない）", () => {
    expect(peekVocal([job("nope")])).toBeNull();
    expect(singControl.sing).not.toHaveBeenCalled();
  });
});

describe("startPlayback", () => {
  it("ensure→play 順序：sing 完了後に playNotes へ vocal を渡す", async () => {
    const p = plan({ vocalJobs: [job("v")], notes: [{ pitch: 60, start: 0, dur: 1, muted: true, sungBy: { singer: "s0" } }] });
    const started = startPlayback(p, { vocalMode: "ensure" });
    await flushMicro();
    expect(singControl.sing).toHaveBeenCalledTimes(1);
    expect(playControl.playNotes).not.toHaveBeenCalled(); // まだ ensure 待ち＝再生していない
    singControl.pending[0]!.resolve({ assetId: "v", shift: 0, clamped: 0, speaker: 0, leadRestSec: 0.18 });
    await started;
    expect(playControl.playNotes).toHaveBeenCalledTimes(1);
    const passedVocal = playControl.playNotes.mock.calls[0]![2].vocal;
    expect(Array.isArray(passedVocal) && passedVocal.length).toBe(1); // 歌 wav が渡る
  });

  it("peek 非待機：未レンダでも即 playNotes（vocal=null＝楽器で鳴る）", async () => {
    const p = plan({ vocalJobs: [job("v2")] });
    await startPlayback(p, { vocalMode: "peek" });
    expect(singControl.sing).not.toHaveBeenCalled();
    expect(playControl.playNotes).toHaveBeenCalledTimes(1);
    expect(playControl.playNotes.mock.calls[0]![2].vocal).toBeNull();
  });

  it("off：muted+sungBy を unmute して楽器で鳴らす・vocal は渡さない", async () => {
    const p = plan({ notes: [{ pitch: 60, start: 0, dur: 1, muted: true, sungBy: { singer: "s0" } }], vocalJobs: [job("v3")] });
    await startPlayback(p, { vocalMode: "off" });
    const notes = playControl.playNotes.mock.calls[0]![0];
    expect(notes[0].muted).toBe(false);
    expect(playControl.playNotes.mock.calls[0]![2].vocal).toBeNull();
  });

  it("stale-stop no-op：A→B 再生後、A の stop は現行(B)を殺さない", async () => {
    const hA = fakeHandle(); const hB = fakeHandle();
    playControl.playNotes.mockResolvedValueOnce(hA).mockResolvedValueOnce(hB);
    const a = (await startPlayback(plan(), { vocalMode: "off" }))!;
    const b = (await startPlayback(plan(), { vocalMode: "off" }))!;
    a.stop(); // 代替わり済み＝no-op
    expect(hA.stop).not.toHaveBeenCalled();
    b.stop(); // 現行＝効く
    expect(hB.stop).toHaveBeenCalledTimes(1);
  });

  it("二重発火 no-op：ensure 進行中の再 start は null（playNotes を二重に呼ばない）", async () => {
    const p = plan({ vocalJobs: [job("busy")] });
    const first = startPlayback(p, { vocalMode: "ensure" });
    await flushMicro(); // busy=true
    const second = await startPlayback(p, { vocalMode: "ensure" });
    expect(second).toBeNull();
    singControl.pending[0]!.resolve({ assetId: "busy", shift: 0, clamped: 0, speaker: 0, leadRestSec: 0 });
    await first;
    expect(playControl.playNotes).toHaveBeenCalledTimes(1); // first だけ
  });
});
