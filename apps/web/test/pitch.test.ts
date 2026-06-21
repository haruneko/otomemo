import { describe, it, expect } from "vitest";
import { detectPitchHz, hzToMidi, pitchTrackToNotes } from "../src/pitch";

function sine(hz: number, sr: number, n: number): Float32Array {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = Math.sin((2 * Math.PI * hz * i) / sr);
  return b;
}

describe("pitch detection (#56 音声)", () => {
  it("detects A4=440Hz from a synthetic sine (→MIDI 69)", () => {
    const sr = 44100;
    const hz = detectPitchHz(sine(440, sr, 2048), sr);
    expect(hz).not.toBeNull();
    expect(Math.abs(hz! - 440)).toBeLessThan(10);
    expect(hzToMidi(hz!)).toBe(69);
  });

  it("detects C5=523Hz (→MIDI 72)", () => {
    const sr = 44100;
    expect(hzToMidi(detectPitchHz(sine(523.25, sr, 2048), sr)!)).toBe(72);
  });

  it("returns null on silence", () => {
    expect(detectPitchHz(new Float32Array(2048), 44100)).toBeNull();
  });

  it("hzToMidi: 440→69, 261.63→60", () => {
    expect(hzToMidi(440)).toBe(69);
    expect(hzToMidi(261.63)).toBe(60);
    expect(hzToMidi(0)).toBeNull();
  });

  it("pitchTrackToNotes segments a track, drops too-short blips", () => {
    // 60Hzフレーム間隔=各0.1秒, bpm120(1拍0.5秒)。midi60×4フレーム=0.4秒=0.8拍, 休符, 62×4
    const notes = pitchTrackToNotes(
      [60, 60, 60, 60, null, 62, 62, 62, 62],
      0.1,
      120,
      0.125,
    );
    expect(notes.map((n) => n.pitch)).toEqual([60, 62]);
    expect(notes[0]!.dur).toBeCloseTo(0.8, 5); // 0.4秒/0.5秒
    // 1フレーム(0.2拍)の音は minBeat=0.3 未満なので捨てる（チャタリング除去）
    const blip = pitchTrackToNotes([null, 64, null], 0.1, 120, 0.3);
    expect(blip.length).toBe(0);
  });
});
