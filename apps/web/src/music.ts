import { Midi } from "@tonejs/midi";
import { Chord as TonalChord, Note as TonalNote } from "tonal";

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

// C基準保存（design #16）。再生/書き出し時に実調へ移調する（key=ピッチクラス 0=C..11=B）。
export function transpose(notes: Note[], semitones: number): Note[] {
  if (!semitones) return notes;
  return notes.map((n) => ({ ...n, pitch: n.pitch + semitones }));
}

// --- コード（chord / chord_progression）。C基準で記号保存し、再生時に音符へ展開＋移調 ---
export interface ChordEntry {
  root: string; // "C".."B"（ピッチクラス）
  quality: string; // ""(major) / "m" / "7" / "maj7" / "m7" / "dim" ...
  start: number; // 拍
  dur: number; // 拍
}

export function chordsOf(content: unknown): ChordEntry[] {
  const c = content as { chords?: unknown } | null;
  return c && Array.isArray(c.chords) ? (c.chords as ChordEntry[]) : [];
}

// コード記号（例 "Cm7"）→ midi 番号（octave 基準・昇順に積む）
export function chordToMidi(sym: string, octave = 4): number[] {
  const pcs = TonalChord.get(sym).notes;
  let oct = octave;
  let prev = -Infinity;
  const out: number[] = [];
  for (const pc of pcs) {
    let m = TonalNote.midi(`${pc}${oct}`);
    if (m == null) continue;
    if (m <= prev) {
      oct += 1;
      m = TonalNote.midi(`${pc}${oct}`);
      if (m == null) continue;
    }
    prev = m;
    out.push(m);
  }
  return out;
}

// コード列を、各コードの start/dur に重ねたノート列へ（再生/MIDIはメロと同じ経路）
export function chordsToNotes(chords: ChordEntry[]): Note[] {
  return chords.flatMap((c) =>
    chordToMidi(c.root + c.quality).map((pitch) => ({ pitch, start: c.start, dur: c.dur })),
  );
}

// --- リズム（rhythm）。GMドラムのステップグリッド。1ステップ=16分音符（拍=step/4） ---
export interface RhythmLane {
  name: string;
  midi: number; // GMドラム番号（移調しない）
  hits: number[]; // ステップindex（0..steps-1）
}
export interface RhythmContent {
  steps: number;
  lanes: RhythmLane[];
}

export const DRUMS: { name: string; midi: number }[] = [
  { name: "Kick", midi: 36 },
  { name: "Snare", midi: 38 },
  { name: "HiHat", midi: 42 },
  { name: "OpenHat", midi: 46 },
  { name: "Clap", midi: 39 },
  { name: "Tom", midi: 45 },
];

export function rhythmOf(content: unknown): RhythmContent {
  const r = (content as { rhythm?: RhythmContent } | null)?.rhythm;
  if (r && Array.isArray(r.lanes)) return r;
  return { steps: 16, lanes: DRUMS.map((d) => ({ ...d, hits: [] })) };
}

export function rhythmToNotes(r: RhythmContent): Note[] {
  return r.lanes.flatMap((l) =>
    l.hits.map((step) => ({ pitch: l.midi, start: step / 4, dur: 0.25 })),
  );
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

export function midiToNotes(buf: ArrayBuffer | Uint8Array): { notes: Note[]; bpm: number } {
  const midi = new Midi(buf as ArrayBuffer);
  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const spb = 60 / bpm;
  const all = midi.tracks.flatMap((t) => t.notes);
  const minTime = all.length ? Math.min(...all.map((n) => n.time)) : 0;
  const notes: Note[] = all
    .map((n) => ({
      pitch: n.midi,
      start: (n.time - minTime) / spb,
      dur: n.duration / spb,
      vel: Math.round(n.velocity * 127),
    }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  return { notes, bpm };
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
