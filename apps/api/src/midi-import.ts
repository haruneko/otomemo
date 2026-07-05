// MIDI取込を api 内で（旧 worker handle_import_midi の TS 移植＝worker全撤去の最後の1機能）。
// トラック×チャンネルで分割し melody/rhythm ネタの素材に。ch10(0-index 9)=ドラム→rhythm、他=melody。
// 純パース＝claude 不要・高速。返り {tracks:[{kind,title,content}]}＝既存 reaper がそのまま materialize。
// @tonejs/midi は CJS。tsx(Node ESM 実行)だと名前付き import `{ Midi }` が実行時に解決できない
// （vite/vitest は相互運用で通るが本番 tsx で ERR_MODULE）。実行時は default import で受け、型は
// `import type` から与える（キャストで両立）。
import midiPkg from "@tonejs/midi";
import type { Midi as MidiInstance } from "@tonejs/midi";
const MidiCtor = (midiPkg as unknown as { Midi: new (data?: Uint8Array | ArrayBuffer) => MidiInstance }).Midi;

// GM ドラムマップ（旧 worker _GM_DRUM と同一）。
const GM_DRUM: Record<number, string> = {
  35: "Kick", 36: "Kick", 37: "RimShot", 38: "Snare", 39: "Clap", 40: "Snare",
  41: "Tom", 43: "Tom", 45: "Tom", 47: "Tom", 48: "Tom", 50: "Tom",
  42: "HiHat", 44: "PedalHat", 46: "OpenHat", 49: "Crash", 57: "Crash", 51: "Ride", 53: "Ride",
};

interface PNote {
  pitch: number;
  start: number;
  dur: number;
  vel: number;
}
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

// ドラム note 列 → rhythm content（pitch ごとに lane、hits は16分step）。旧 _drum_rhythm と同一。
function drumRhythm(notes: PNote[]): { rhythm: { steps: number; lanes: { name: string; midi: number; hits: number[] }[] } } {
  const lanes = new Map<number, { name: string; midi: number; hits: Set<number> }>();
  let maxStep = 0;
  for (const n of notes) {
    const step = Math.round(n.start * 4); // 16分 step
    maxStep = Math.max(maxStep, step);
    if (!lanes.has(n.pitch)) lanes.set(n.pitch, { name: GM_DRUM[n.pitch] ?? `Drum${n.pitch}`, midi: n.pitch, hits: new Set() });
    lanes.get(n.pitch)!.hits.add(step);
  }
  const steps = Math.max(16, (Math.floor(maxStep / 16) + 1) * 16);
  return {
    rhythm: {
      steps,
      lanes: [...lanes.values()]
        .sort((a, b) => b.midi - a.midi)
        .map((l) => ({ name: l.name, midi: l.midi, hits: [...l.hits].sort((a, b) => a - b) })),
    },
  };
}

export interface ImportedTrack {
  kind: string;
  title: string;
  content: unknown;
}

export function parseMidiImport(midiB64: string, filename: string): { tracks: ImportedTrack[] } {
  const base = ((filename || "midi").split("/").pop() ?? "midi").replace(/\.midi?$/i, "") || "midi";
  let midi: MidiInstance;
  try {
    midi = new MidiCtor(Buffer.from(midiB64, "base64"));
  } catch {
    return { tracks: [] }; // 壊れMIDIは空（無言で落とさない・旧workerと同じ）
  }
  const ppq = midi.header.ppq || 480; // ticks_per_beat 相当。ticks/ppq = beats。
  const out: ImportedTrack[] = [];
  midi.tracks.forEach((track, idx) => {
    if (!track.notes.length) return;
    const tname = (track.name || "").trim();
    const label = tname || `Track${idx + 1}`;
    const notes: PNote[] = track.notes.map((n) => ({
      pitch: n.midi,
      start: r3(n.ticks / ppq),
      dur: r3(Math.max(1, n.durationTicks) / ppq),
      vel: Math.round(n.velocity * 127),
    }));
    if (track.channel === 9) {
      out.push({ kind: "rhythm", title: `${base} - ${tname || "ドラム"}`, content: drumRhythm(notes) });
    } else {
      out.push({ kind: "melody", title: `${base} - ${label}`, content: { notes: notes.slice(0, 1000) } });
    }
  });
  return { tracks: out.slice(0, 24) };
}
