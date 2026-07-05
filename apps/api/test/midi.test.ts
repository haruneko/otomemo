import { describe, it, expect } from "vitest";
import { parseMidi, skylineMelody, notesOfTrackNamed } from "../src/music/midi";

// S6-b：SMF→notes＋skyline メロ抽出。合成MIDI（2旋律ch＋ドラムch10）で検証。
function buildMidi(events: number[][], division = 96): Uint8Array {
  const trk: number[] = [];
  for (const [delta, ...rest] of events) {
    // delta はテスト範囲では <128 ＝ 1バイト varlen
    trk.push(delta!, ...rest);
  }
  const len = trk.length;
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (division >> 8) & 0xff, division & 0xff, // MThd format0 1trk
    0x4d, 0x54, 0x72, 0x6b, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, // MTrk + len
    ...trk,
  ]);
}

const EVENTS = [
  [0, 0x90, 60, 64], // on ch0 C4
  [0, 0x91, 72, 64], // on ch1 C5
  [0, 0x99, 38, 64], // on ch10(drum) snare
  [96, 0x80, 60, 64], // off ch0 (t=96=1拍)
  [0, 0x81, 72, 64], // off ch1
  [0, 0x89, 38, 64], // off drum
  [0, 0x90, 64, 64], // on ch0 E4
  [0, 0x91, 67, 64], // on ch1 G4
  [96, 0x80, 64, 64], // off ch0 (t=192)
  [0, 0x81, 67, 64], // off ch1
  [0, 0xff, 0x2f, 0x00], // end of track
];

describe("parseMidi / skylineMelody", () => {
  it("note on/off を 拍単位の notes に展開（division=96）", () => {
    const { division, notes } = parseMidi(buildMidi(EVENTS));
    expect(division).toBe(96);
    expect(notes.length).toBe(5); // 60,72,38(drum),64,67
    const c4 = notes.find((n) => n.pitch === 60)!;
    expect(c4.start).toBe(0);
    expect(c4.dur).toBe(1); // 96tick / 96 = 1拍
    expect(c4.channel).toBe(0);
  });

  it("skyline：ドラム(ch10)除外・各オンセットで最高音＝単旋律の輪郭", () => {
    const { notes } = parseMidi(buildMidi(EVENTS));
    const mel = skylineMelody(notes);
    expect(mel.map((n) => n.pitch)).toEqual([72, 67]); // onset0=max(60,72)=72, onset1=max(64,67)=67（drum除外）
    expect(mel.map((n) => n.start)).toEqual([0, 1]);
  });

  it("program change(0xC0) を channel→program に拾う（楽器フィルタ用）", () => {
    const ev = [
      [0, 0xc0, 34], // ch0 program 34 = Bass
      [0, 0x90, 60, 64], [96, 0x80, 60, 64],
      [0, 0xc1, 80], // ch1 program 80 = Synth Lead
      [0, 0x91, 64, 64], [96, 0x81, 64, 64],
      [0, 0xff, 0x2f, 0x00],
    ];
    const parsed = parseMidi(buildMidi(ev));
    expect(parsed.programs[0]).toBe(34);
    expect(parsed.programs[1]).toBe(80);
  });

  it("トラック名(0xFF 03)を拾い notesOfTrackNamed で抽出（POP909 MELODY 用）", () => {
    const ev = [
      [0, 0xff, 0x03, 0x06, 0x4d, 0x45, 0x4c, 0x4f, 0x44, 0x59], // track name "MELODY"
      [0, 0x90, 60, 64], [96, 0x80, 60, 64],
      [0, 0x90, 64, 64], [96, 0x80, 64, 64],
      [0, 0xff, 0x2f, 0x00],
    ];
    const parsed = parseMidi(buildMidi(ev));
    expect(parsed.trackNames[0]).toBe("MELODY");
    expect(notesOfTrackNamed(parsed, "melody").length).toBe(2); // 大小無視で一致
  });
});
