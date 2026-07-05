import { describe, it, expect } from "vitest";
import { Midi } from "@tonejs/midi";
import { notesToMidi, tracksToMidi } from "../src/music";

describe("MIDI出力の正しさ検証", () => {
  it("単一トラック：テンポ・拍子ヘッダ・音符の秒時刻・velocity（4/4）", () => {
    const notes = [
      { pitch: 60, start: 0, dur: 1, vel: 100 },
      { pitch: 64, start: 2, dur: 0.5, vel: 80 },
      { pitch: 67, start: 3, dur: 1 },
    ];
    const m = new Midi(notesToMidi(notes, 120, "4/4", 4).buffer as ArrayBuffer);
    expect(Math.round(m.header.tempos[0]!.bpm)).toBe(120);
    expect(m.header.timeSignatures[0]!.timeSignature).toEqual([4, 4]);
    const t = m.tracks[0]!;
    expect(t.instrument.number).toBe(4); // program (エレピ)
    const spb = 0.5; // 60/120
    expect(t.notes.length).toBe(3);
    expect(t.notes[0]!.midi).toBe(60);
    expect(t.notes[0]!.time).toBeCloseTo(0 * spb, 5);
    expect(t.notes[1]!.time).toBeCloseTo(2 * spb, 5); // start=2拍→1.0秒
    expect(t.notes[1]!.duration).toBeCloseTo(0.5 * spb, 5);
    expect(Math.round(t.notes[1]!.velocity * 127)).toBe(80);
    expect(t.notes[2]!.duration).toBeCloseTo(1 * spb, 5);
  });

  it("6/8：拍子ヘッダ[6,8]・音符時刻は秒絶対（拍子で不変）", () => {
    const notes = [{ pitch: 60, start: 0, dur: 3 }, { pitch: 62, start: 3, dur: 3 }];
    const m = new Midi(notesToMidi(notes, 100, "6/8").buffer as ArrayBuffer);
    expect(m.header.timeSignatures[0]!.timeSignature).toEqual([6, 8]);
    expect(Math.round(m.header.tempos[0]!.bpm)).toBe(100);
    const spb = 60 / 100;
    expect(m.tracks[0]!.notes[1]!.time).toBeCloseTo(3 * spb, 5); // 3拍=1.8秒
  });

  it("ドラム：ch10(=channel 9)＋kitがprogram", () => {
    const notes = [
      { pitch: 36, start: 0, dur: 0.25, drum: true, kit: 0 },
      { pitch: 38, start: 1, dur: 0.25, drum: true, kit: 0 },
    ];
    const m = new Midi(notesToMidi(notes, 120, "4/4").buffer as ArrayBuffer);
    expect(m.tracks[0]!.channel).toBe(9); // GM ch10
    expect(m.tracks[0]!.notes.map((n) => n.midi)).toEqual([36, 38]);
  });

  it("合成：ドラムとピッチ楽器が混在したら別トラックに分離（ピッチは非ch9・ドラムはch10）", () => {
    // 監査 SG-04：以前は1音でも drum があるとトラック全体を ch9 固定し、メロ/ベースがドラム音源で鳴った。
    const notes = [
      { pitch: 60, start: 0, dur: 1 }, // メロ
      { pitch: 64, start: 1, dur: 1 }, // メロ
      { pitch: 36, start: 0, dur: 0.25, drum: true, kit: 0 }, // キック
      { pitch: 38, start: 1, dur: 0.25, drum: true, kit: 0 }, // スネア
    ];
    const m = new Midi(notesToMidi(notes, 120, "4/4", 4).buffer as ArrayBuffer);
    expect(m.tracks.length).toBe(2); // ピッチ＋ドラムの2トラック
    const pitched = m.tracks.find((t) => t.channel !== 9)!;
    const drum = m.tracks.find((t) => t.channel === 9)!;
    expect(pitched.notes.map((n) => n.midi)).toEqual([60, 64]); // ピッチ楽器は非ch9
    expect(pitched.instrument.number).toBe(4); // program 反映
    expect(drum.notes.map((n) => n.midi)).toEqual([36, 38]); // ドラムは ch10
  });

  it("多トラック：レーン別にトラック分け＋名前＋program、ドラムのみch10、空レーンは省く", () => {
    const tracks = [
      { name: "Melody", program: 0, notes: [{ pitch: 72, start: 0, dur: 1 }] },
      { name: "Bass", program: 33, notes: [{ pitch: 40, start: 0, dur: 2 }] },
      { name: "Drums", drum: true, kit: 0, notes: [{ pitch: 36, start: 0, dur: 0.25, drum: true }] },
      { name: "Empty", notes: [] }, // 省かれる
    ];
    const m = new Midi(tracksToMidi(tracks, 120, "4/4").buffer as ArrayBuffer);
    expect(m.tracks.length).toBe(3); // 空レーン省略
    expect(m.tracks.map((t) => t.name)).toEqual(["Melody", "Bass", "Drums"]) // ASCII＝文字化けしない;
    expect(m.tracks[0]!.instrument.number).toBe(0);
    expect(m.tracks[1]!.instrument.number).toBe(33);
    expect(m.tracks[0]!.channel).not.toBe(9); // メロは非ドラム
    expect(m.tracks[2]!.channel).toBe(9); // リズムだけch10
  });
});
