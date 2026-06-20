import { Midi } from "@tonejs/midi";

// 音楽的中身（docs/design.md #16）。pitch は C基準のMIDI番号、start/dur は拍。
export interface Note {
  pitch: number;
  start: number;
  dur: number;
  vel?: number;
}

export interface MelodyContent {
  notes: Note[];
}

export function notesOf(content: unknown): Note[] {
  if (content && typeof content === "object" && Array.isArray((content as MelodyContent).notes)) {
    return (content as MelodyContent).notes;
  }
  return [];
}

export function notesToMidi(notes: Note[], bpm = 120): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const track = midi.addTrack();
  const spb = 60 / bpm;
  for (const n of notes) {
    track.addNote({
      midi: n.pitch,
      time: n.start * spb,
      duration: n.dur * spb,
      velocity: (n.vel ?? 100) / 127,
    });
  }
  return midi.toArray();
}

export function downloadMidi(notes: Note[], filename = "sketch.mid", bpm = 120): void {
  const blob = new Blob([notesToMidi(notes, bpm) as BlobPart], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Tone.js は再生時のみ動的import（jsdom/テストで読み込まない）。
export async function playNotes(notes: Note[], bpm = 120): Promise<void> {
  const Tone = await import("tone");
  await Tone.start();
  const synth = new Tone.PolySynth(Tone.Synth).toDestination();
  const t0 = Tone.now();
  const spb = 60 / bpm;
  for (const n of notes) {
    synth.triggerAttackRelease(
      Tone.Frequency(n.pitch, "midi").toNote(),
      n.dur * spb,
      t0 + n.start * spb,
      (n.vel ?? 100) / 127,
    );
  }
}
