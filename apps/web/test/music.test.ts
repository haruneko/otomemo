import { describe, it, expect } from "vitest";
import { Midi } from "@tonejs/midi";
import {
  notesToMidi,
  notesOf,
  midiToNotes,
  transpose,
  chordToMidi,
  chordsToNotes,
  rhythmToNotes,
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
    const notes = chordsToNotes([{ root: "C", quality: "", start: 0, dur: 4 }]);
    expect(notes).toHaveLength(3);
    expect(notes.every((n) => n.start === 0 && n.dur === 4)).toBe(true);
  });

  it("expands a rhythm lane's hits to drum notes (step/4 = beat)", () => {
    const notes = rhythmToNotes({ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0, 4] }] });
    expect(notes).toEqual([
      { pitch: 36, start: 0, dur: 0.25 },
      { pitch: 36, start: 1, dur: 0.25 },
    ]);
  });

  it("notesOf extracts notes or empty", () => {
    expect(notesOf({ notes: [{ pitch: 60, start: 0, dur: 1 }] })).toHaveLength(1);
    expect(notesOf(null)).toEqual([]);
    expect(notesOf("x")).toEqual([]);
  });
});
