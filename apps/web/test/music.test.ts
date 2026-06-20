import { describe, it, expect } from "vitest";
import { Midi } from "@tonejs/midi";
import { notesToMidi, notesOf, midiToNotes, type Note } from "../src/music";

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

  it("notesOf extracts notes or empty", () => {
    expect(notesOf({ notes: [{ pitch: 60, start: 0, dur: 1 }] })).toHaveLength(1);
    expect(notesOf(null)).toEqual([]);
    expect(notesOf("x")).toEqual([]);
  });
});
