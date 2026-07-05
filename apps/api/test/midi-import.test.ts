import { describe, it, expect } from "vitest";
import { Midi } from "@tonejs/midi";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { parseMidiImport } from "../src/midi-import";

// テスト用 MIDI を作る：メロ(ch0)＋ドラム(ch9)。tempo120 で time(秒)→beats に戻る。
function makeMidiB64(): string {
  const m = new Midi();
  m.header.setTempo(120); // spb=0.5s
  const mel = m.addTrack();
  mel.name = "Lead";
  mel.addNote({ midi: 60, time: 0, duration: 0.5 }); // 0拍
  mel.addNote({ midi: 64, time: 1, duration: 0.5 }); // 2拍（1s÷0.5）
  const dr = m.addTrack();
  dr.channel = 9;
  dr.name = "Drums";
  dr.addNote({ midi: 36, time: 0, duration: 0.1 }); // Kick @ step0
  dr.addNote({ midi: 38, time: 0.5, duration: 0.1 }); // Snare @ 1拍=step4
  return Buffer.from(m.toArray()).toString("base64");
}

describe("parseMidiImport（旧 worker import_midi の TS 移植）", () => {
  it("melody(ch0) と drum(ch9→rhythm) に分割し beats へ換算", () => {
    const { tracks } = parseMidiImport(makeMidiB64(), "path/to/song.mid");
    expect(tracks.length).toBe(2);
    const mel = tracks.find((t) => t.kind === "melody")!;
    const dr = tracks.find((t) => t.kind === "rhythm")!;
    expect(mel.title).toContain("song"); // 拡張子/パスを剥がした base
    const notes = (mel.content as { notes: { pitch: number; start: number }[] }).notes;
    expect(notes.map((n) => n.pitch)).toEqual([60, 64]);
    expect(notes[1]!.start).toBeCloseTo(2, 3); // 1秒＝2拍
    const lanes = (dr.content as { rhythm: { lanes: { name: string; hits: number[] }[] } }).rhythm.lanes;
    expect(lanes.some((l) => l.name === "Kick" && l.hits.includes(0))).toBe(true);
    expect(lanes.some((l) => l.name === "Snare" && l.hits.includes(4))).toBe(true);
  });

  it("壊れMIDIは空 tracks（無言で落とさない）", () => {
    expect(parseMidiImport(Buffer.from("not a midi").toString("base64"), "x.mid").tracks).toEqual([]);
  });

  it("job→completeJob→reap で melody/rhythm ネタが materialize される", () => {
    const core = new Core(openDb(":memory:"));
    core.enqueueJob({ intent: "import_midi", params: { midi_b64: makeMidiB64(), filename: "song.mid" } });
    const job = core.claimQueued(["import_midi"])!;
    const p = job.params as { midi_b64: string; filename: string };
    core.completeJob(job.id, parseMidiImport(p.midi_b64, p.filename));
    expect(core.reapResults()).toBeGreaterThanOrEqual(2);
    const netas = core.listNeta({ scope: "all", limit: 100 });
    expect(netas.some((n) => n.kind === "melody")).toBe(true);
    expect(netas.some((n) => n.kind === "rhythm")).toBe(true);
  });
});
