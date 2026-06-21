import { describe, it, expect, vi } from "vitest";
import { Midi } from "@tonejs/midi";
import {
  notesToMidi,
  notesOf,
  midiToNotes,
  transpose,
  chordToMidi,
  chordsToNotes,
  rhythmToNotes,
  notesForContent,
  scheduleTimes,
  totalSec,
  loopRange,
  barBeat,
  playEvent,
  type Note,
} from "../src/music";

describe("music", () => {
  it("encodes notes into parseable MIDI", () => {
    const notes: Note[] = [
      { pitch: 60, start: 0, dur: 1 },
      { pitch: 64, start: 1, dur: 2 },
    ];
    const bytes = notesToMidi(notes, 120);
    expect(bytes.length).toBeGreaterThan(0);
    const back = new Midi(bytes);
    expect(back.tracks[0]!.notes.length).toBe(2);
    expect(back.tracks[0]!.notes[0]!.midi).toBe(60);
  });

  it("round-trips notes through MIDI import", () => {
    const bytes = notesToMidi(
      [
        { pitch: 60, start: 0, dur: 1 },
        { pitch: 67, start: 2, dur: 0.5 },
      ],
      120,
    );
    const { notes } = midiToNotes(bytes);
    expect(notes.length).toBe(2);
    expect(notes[0]!.pitch).toBe(60);
    expect(notes[1]!.start).toBeCloseTo(2, 1);
  });

  it("transposes C-base notes by semitones (key offset)", () => {
    expect(transpose([{ pitch: 60, start: 0, dur: 1 }], 9)[0]!.pitch).toBe(69);
    expect(transpose([{ pitch: 60, start: 0, dur: 1 }], 0)[0]!.pitch).toBe(60);
  });

  it("expands a chord symbol to ascending midi notes (C-base)", () => {
    expect(chordToMidi("C")).toEqual([60, 64, 67]); // C E G at octave 4
    expect(chordToMidi("Am")).toEqual([69, 72, 76]); // A C E ascending
  });

  it("expands chords to overlapping notes at each start/dur", () => {
    const notes = chordsToNotes([{ root: 0, quality: "", start: 0, dur: 4 }]);
    expect(notes).toHaveLength(3);
    expect(notes.every((n) => n.start === 0 && n.dur === 4)).toBe(true);
  });

  it("expands a rhythm lane's hits to drum notes (step/4 = beat)", () => {
    const notes = rhythmToNotes({ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0, 4] }] });
    expect(notes).toEqual([
      { pitch: 36, start: 0, dur: 0.25, drum: true },
      { pitch: 36, start: 1, dur: 0.25, drum: true },
    ]);
  });

  it("notesForContent dispatches by kind", () => {
    expect(notesForContent("melody", { notes: [{ pitch: 60, start: 0, dur: 1 }] })).toHaveLength(1);
    expect(
      notesForContent("rhythm", { rhythm: { steps: 16, lanes: [{ name: "K", midi: 36, hits: [0] }] } }),
    ).toHaveLength(1);
    expect(notesForContent("lyric", null)).toEqual([]);
  });

  it("notesOf extracts notes or empty", () => {
    expect(notesOf({ notes: [{ pitch: 60, start: 0, dur: 1 }] })).toHaveLength(1);
    expect(notesOf(null)).toEqual([]);
    expect(notesOf("x")).toEqual([]);
  });

  it("writes the GM program to the MIDI track (#47)", () => {
    const midi = new Midi(notesToMidi([{ pitch: 60, start: 0, dur: 1 }], 120, null, 24));
    expect(midi.tracks[0]!.instrument.number).toBe(24);
  });

  it("puts drums on channel 10 (#47)", () => {
    const midi = new Midi(notesToMidi([{ pitch: 36, start: 0, dur: 1, drum: true }], 120));
    expect(midi.tracks[0]!.channel).toBe(9);
  });

  // #57① Transport化：スケジュール時刻の純関数（音は鳴らさず算出だけ検証）
  describe("playback scheduling (#57)", () => {
    it("maps beats to Transport seconds (beat=quarter=1.0, spb=60/bpm)", () => {
      const ev = scheduleTimes([{ pitch: 60, start: 2, dur: 1, vel: 64 }], 120);
      expect(ev[0]!.time).toBeCloseTo(1.0); // 2拍 * 0.5s
      expect(ev[0]!.voice).toBe("poly");
      expect(ev[0]!.durSec).toBeCloseTo(0.5); // 1拍 * 0.5s
      expect(ev[0]!.vel).toBeCloseTo(64 / 127);
    });

    it("routes drums to membrane(<=41)/noise with fixed durations", () => {
      const ev = scheduleTimes(
        [
          { pitch: 36, start: 0, dur: 1, drum: true }, // kick
          { pitch: 42, start: 1, dur: 1, drum: true }, // hat
        ],
        120,
      );
      expect(ev[0]).toMatchObject({ voice: "membrane", durSec: 0.15 });
      expect(ev[1]).toMatchObject({ voice: "noise", durSec: 0.05 });
    });

    it("defaults velocity to 100/127 when missing", () => {
      expect(scheduleTimes([{ pitch: 60, start: 0, dur: 1 }], 120)[0]!.vel).toBeCloseTo(100 / 127);
    });

    it("totalSec is the end of the last note (drums are point events)", () => {
      expect(totalSec([{ pitch: 60, start: 0, dur: 2 }], 120)).toBeCloseTo(1.0); // 2拍*0.5
      expect(totalSec([{ pitch: 36, start: 4, dur: 1, drum: true }], 120)).toBeCloseTo(2.0); // start4拍のみ
    });

    it("loopRange defaults to 0..total, honors explicit beats", () => {
      const notes = [{ pitch: 60, start: 0, dur: 4 }];
      expect(loopRange(notes, 120)).toEqual({ start: 0, end: 2.0 });
      expect(loopRange(notes, 120, { startBeat: 2, endBeat: 6 })).toEqual({ start: 1.0, end: 3.0 });
    });

    it("barBeat formats beat as bar:beat (1始まり, 拍子で割る) (#59)", () => {
      expect(barBeat(0, 4)).toBe("1:1");
      expect(barBeat(3, 4)).toBe("1:4");
      expect(barBeat(4, 4)).toBe("2:1");
      expect(barBeat(7.5, 4)).toBe("2:4"); // 小数拍は切り捨て
      expect(barBeat(3, 3)).toBe("2:1"); // 3/4
      expect(barBeat(-1, 4)).toBe("1:1"); // 負はclamp
    });
  });

  // #55a SF2分岐：旋律はSF2があればそれ、無ければシンセ。ドラムは常にキット。
  describe("playEvent SF2 routing (#55a)", () => {
    const Tone = {
      Frequency: (p: number) => ({ toFrequency: () => p, toNote: () => `n${p}` }),
    };
    const mkKit = () => ({
      poly: { triggerAttackRelease: vi.fn() },
      membrane: { triggerAttackRelease: vi.fn() },
      noise: { triggerAttackRelease: vi.fn() },
    });

    it("melodic note uses SF2 (absolute time, vel 0..127) when loaded", () => {
      const kit = mkKit();
      const sf = { start: vi.fn() };
      playEvent({ time: 0, durSec: 0.5, voice: "poly", pitch: 60, vel: 0.5 }, 1.0, sf, kit, Tone);
      expect(sf.start).toHaveBeenCalledWith({ note: 60, time: 1.0, duration: 0.5, velocity: 64 });
      expect(kit.poly.triggerAttackRelease).not.toHaveBeenCalled();
    });

    it("melodic note falls back to poly synth without SF2", () => {
      const kit = mkKit();
      playEvent({ time: 0, durSec: 0.5, voice: "poly", pitch: 60, vel: 0.5 }, 1.0, null, kit, Tone);
      expect(kit.poly.triggerAttackRelease).toHaveBeenCalled();
    });

    it("drums fall back to the simple kit when no SF2 drum sampler matches", () => {
      const kit = mkKit();
      const sf = { start: vi.fn() };
      playEvent({ time: 0, durSec: 0.15, voice: "membrane", pitch: 36, vel: 0.8 }, 0, sf, kit, Tone);
      playEvent({ time: 0, durSec: 0.05, voice: "noise", pitch: 42, vel: 0.8 }, 0, sf, kit, Tone);
      expect(kit.membrane.triggerAttackRelease).toHaveBeenCalled();
      expect(kit.noise.triggerAttackRelease).toHaveBeenCalled();
      expect(sf.start).not.toHaveBeenCalled();
    });

    it("#55b drums use the matched SF2 drum sampler at its root note when available", () => {
      const kit = mkKit();
      const kick = { start: vi.fn() };
      // kick(36)→samplerをroot音(38)で鳴らす。snare(38)は未マッチ→簡易キット。
      const drumKits = new Map([[36, { sampler: kick, note: 38 }]]);
      playEvent({ time: 0, durSec: 0.15, voice: "membrane", pitch: 36, vel: 0.8 }, 2, null, kit, Tone, drumKits);
      playEvent({ time: 0, durSec: 0.05, voice: "noise", pitch: 38, vel: 0.8 }, 3, null, kit, Tone, drumKits);
      // 打楽器はワンショット＝loop:false（SF2サンプルのloop点による多重発音/鳴り続けを防ぐ）
      expect(kick.start).toHaveBeenCalledWith({ note: 38, time: 2, velocity: 102, loop: false });
      expect(kit.membrane.triggerAttackRelease).not.toHaveBeenCalled(); // kickはSF2へ
      expect(kit.noise.triggerAttackRelease).toHaveBeenCalled(); // snareは簡易へ
    });
  });

  describe("drumNameFor (#55b GM番号→楽器名)", () => {
    const names = [
      "Concert Bass Drum",
      "Jazz Snare 1",
      "Orchestra Hi-Hats",
      "Brushed Toms_1",
      "Orchestral Ride",
      "Grand Piano",
    ];
    it("maps kick/snare/hihat/tom/ride to drum-like instrument names", async () => {
      const { drumNameFor } = await import("../src/music");
      expect(drumNameFor(36, names)).toBe("Concert Bass Drum");
      expect(drumNameFor(38, names)).toBe("Jazz Snare 1");
      expect(drumNameFor(42, names)).toBe("Orchestra Hi-Hats");
      expect(drumNameFor(45, names)).toBe("Brushed Toms_1");
      expect(drumNameFor(51, names)).toBe("Orchestral Ride");
    });
    it("returns null when nothing matches", async () => {
      const { drumNameFor } = await import("../src/music");
      expect(drumNameFor(36, ["Grand Piano", "Violin"])).toBeNull();
    });
  });
});
