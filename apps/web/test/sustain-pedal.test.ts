// サステインペダル（CC64）の再生と書き出し（S5）。正典＝docs/design.md「サステインペダル（CC64）の持ち方」の「運び方（web）」。
import { describe, expect, it } from "vitest";
import { Midi } from "@tonejs/midi";
import { handFrameToChordPattern, type BandChord } from "@cm/music-core";
import {
  applyFeelEnsemble, compositeNotes, notesToMidi, partTracks, pedalWindowsForTrack, resolveChordPattern, sustainPedalForPlayback, tracksToMidi,
  type ChordEntry, type ChordPatternContent, type CompositeChild, type Note,
} from "../src/music";

const ch = (root: string, quality: string, beats: number): BandChord => ({ root, quality, beats });
const PROG: BandChord[] = [ch("F", "maj7", 4), ch("G", "", 4), ch("E", "m7", 4), ch("A", "m7", 2), ch("G", "", 2)];
const ENTRIES: ChordEntry[] = [
  { root: 5, quality: "maj7", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }, { root: 4, quality: "m7", start: 8, dur: 4 },
  { root: 9, quality: "m7", start: 12, dur: 2 }, { root: 7, quality: "", start: 14, dur: 2 },
];
const SIMPLE: ChordPatternContent = {
  mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0 }, steps: 32,
  hits: [{ step: 0, dur: 2 }, { step: 8, dur: 2 }],
};
const withPedal = { ...SIMPLE, pedal: [{ start: 0, dur: 1.9 }, { start: 2, dur: 1.9 }] } as ChordPatternContent;

describe("再生：pedal の無い content は1ビットも変わらない", () => {
  it("resolveChordPattern の音に印を付けない・sustainPedalForPlayback は同じ配列を返す", () => {
    const ns = resolveChordPattern(SIMPLE, ENTRIES, 0);
    ns.forEach((n) => expect("pedal" in n).toBe(false));
    expect(sustainPedalForPlayback(ns)).toBe(ns);
  });
});

describe("再生：pedal のある content は窓の終わりまで鳴る", () => {
  it("単体：8分の和音が窓の終わりまで延びる（どちらも踏み直し前に離す＝長さ 1.9 拍）", () => {
    const ns = sustainPedalForPlayback(resolveChordPattern(withPedal, ENTRIES, 0));
    const first = ns.filter((n) => n.start === 0), second = ns.filter((n) => n.start === 2);
    first.forEach((n) => expect(n.dur).toBeCloseTo(1.9, 9));
    second.forEach((n) => expect(n.dur).toBeCloseTo(1.9, 9));
  });
  it("合成（位置 8 拍に置く）＋揺れ：窓は位置と一緒に動き、延びた長さは揺れに依らない", () => {
    const kids = [
      { position: 0, node: { neta: { kind: "chord_progression", content: { chords: ENTRIES.map((e) => ({ ...e, root: e.root })) } } } },
      { position: 8, node: { neta: { kind: "chord_pattern", content: withPedal } } },
    ] as unknown as CompositeChild[];
    const comp = compositeNotes(kids, 0);
    const felt = applyFeelEnsemble(comp, { humanize: 0.5, seed: 3, keepDur: true }, { tempo: 96 });
    const out = sustainPedalForPlayback(felt);
    out.forEach((n, i) => {
      expect(n.start).toBe(felt[i]!.start);
      expect(n.dur).toBeCloseTo(1.9, 9);
    });
  });
  it("生成した伴奏：延ばすだけで縮めない・同じ高さの弾き直しで止まる（次の同じ高さの打鍵を越えない）", () => {
    const { content } = handFrameToChordPattern(PROG, { tempo: 96, seed: 1234, humanize: false });
    const raw = resolveChordPattern(content as unknown as ChordPatternContent, ENTRIES, 0, 96, 0);
    const out = sustainPedalForPlayback(raw);
    let extended = 0;
    out.forEach((n, i) => {
      const r = raw[i]!;
      expect(n.dur).toBeGreaterThanOrEqual(r.dur - 1e-12);
      if (n.dur > r.dur + 1e-9) {
        extended++;
        const next = raw.filter((m) => m.pitch === r.pitch && m.start > r.start + 1e-9).map((m) => m.start);
        if (next.length) expect(r.start + n.dur).toBeLessThanOrEqual(Math.min(...next) + 1e-9);
      }
    });
    expect(extended).toBeGreaterThan(0);
  });
});

const cc64 = (m: Midi, ti = 0) => (m.tracks[ti]!.controlChanges[64] ?? []).map((c) => [Math.round(c.value * 127), +c.time.toFixed(6)]);

describe("MIDI 書き出し：CC64", () => {
  it("pedal の無い音＝CC を書かない・バイト列は印を外した音と同じ", () => {
    const ns = resolveChordPattern(SIMPLE, ENTRIES, 0);
    const m = new Midi(notesToMidi(ns, 120, "4/4", 0).buffer as ArrayBuffer);
    expect(m.tracks[0]!.controlChanges[64]).toBeUndefined();
  });
  it("notesToMidi：down=127/up=0 を窓どおりに書き、ノートの長さは延ばさない（印を外した音とノートは同じ）", () => {
    const ns = resolveChordPattern(withPedal, ENTRIES, 0);
    const m = new Midi(notesToMidi(ns, 120, "4/4", 0).buffer as ArrayBuffer);
    expect(cc64(m)).toEqual([[127, 0], [0, 0.95], [127, 1], [0, 1.95]]);
    const plain = new Midi(notesToMidi(ns.map(({ pedal: _p, ...n }) => n), 120, "4/4", 0).buffer as ArrayBuffer);
    expect(m.tracks[0]!.notes.map((n) => [n.midi, n.time, n.duration])).toEqual(plain.tracks[0]!.notes.map((n) => [n.midi, n.time, n.duration]));
    // 印を外すと CC は無い＝従来のバイト列
    expect(plain.tracks[0]!.controlChanges[64]).toBeUndefined();
  });
  it("弱起シフトと位置：窓はノートと同じだけずれる・feel は掛けない", () => {
    const ns: Note[] = resolveChordPattern(withPedal, ENTRIES, 0).map((n) => ({ ...n, start: n.start + 4 }));
    ns.push({ pitch: 72, start: -1, dur: 1 }); // 弱起 1 拍＝1小節シフト
    const m = new Midi(notesToMidi(ns, 120, "4/4", 0, { humanize: 0.8, seed: 1, keepDur: true }).buffer as ArrayBuffer);
    expect(cc64(m)).toEqual([[127, 4], [0, 4.95], [127, 5], [0, 5.95]]);
  });
  it("tracksToMidi（partTracks）：コードのトラックにだけ CC64・重なる窓は合わせる", () => {
    const a = resolveChordPattern(withPedal, ENTRIES, 0).map((n) => ({ ...n, part: "chord" as const, program: 0 }));
    const b = resolveChordPattern(withPedal, ENTRIES, 0).map((n) => ({ ...n, start: n.start + 1, part: "chord" as const, program: 0 }));
    const mel: Note[] = [{ pitch: 72, start: 0, dur: 1, part: "melody" }];
    expect(pedalWindowsForTrack([...a, ...b])).toEqual([{ start: 0, dur: expect.closeTo(4.9, 9) }]);
    const m = new Midi(tracksToMidi(partTracks([...mel, ...a]), 120, "4/4").buffer as ArrayBuffer);
    expect(m.tracks[0]!.controlChanges[64]).toBeUndefined();
    expect(cc64(m, 1)).toEqual([[127, 0], [0, 0.95], [127, 1], [0, 1.95]]);
  });
});
