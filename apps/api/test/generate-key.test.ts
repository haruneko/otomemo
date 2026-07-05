import { describe, it, expect } from "vitest";
import { genChords, genMelody, genBass, type Frame } from "../src/music/generate";
import { genNamedProgression } from "../src/music/progressions";
import { scalePcs } from "../src/music/theory";

// C①：frame.key を生成時に効かせる（記号エンジンは常に「その曲の実音」で出す）。
// 不変条件：key=K の出力は key=0 の出力を K 半音 移調したものと「実音として等価」。
// key 既定 0 のとき出力不変（後方互換）は既存テスト側で担保。

type Note = { pitch: number; start: number; dur: number };
type Chord = { root: number; quality: string; start: number; dur: number };

const chordsOf = (r: ReturnType<typeof genChords>): Chord[] =>
  (r.items[0]!.content as { chords: Chord[] }).chords;
const notesOf = (r: ReturnType<typeof genMelody>): Note[] =>
  (r.items[0]!.content as { notes: Note[] }).notes;
const namedChordsOf = (r: ReturnType<typeof genNamedProgression>): Chord[] =>
  (r.items[0]!.content as { chords: Chord[] }).chords;

const pc = (p: number) => ((p % 12) + 12) % 12;
const transpose = (chords: Chord[], k: number): Chord[] =>
  chords.map((c) => ({ ...c, root: pc(c.root + k) }));

// 移調は major mood に限定（mode=major を固定して scalePcs で照合するため）。
const MAJOR_MOODS = ["", "明るい", "ダンス"];
const METERS = ["4/4", "3/4", "6/8"];
const BARS = [2, 4, 7];
const SEEDS = [0, 1, 42];
const KEYS = [1, 3, 5, 7, 11];

function* frames(): Generator<Frame> {
  for (const meter of METERS) for (const mood of MAJOR_MOODS) for (const bars of BARS) yield { meter, mood, bars };
}

describe("C① genChords は key で移調される（実音で返す）", () => {
  it("key=K の root == key=0 の root + K（mod 12）／quality・start・dur は不変", () => {
    for (const f of frames())
      for (const seed of SEEDS)
        for (const K of KEYS) {
          const base = chordsOf(genChords({ ...f, key: 0 }, seed));
          const trans = chordsOf(genChords({ ...f, key: K }, seed));
          const where = `${f.meter}/${f.mood}/${f.bars}#${seed} K=${K}`;
          expect(trans.length, `本数一致: ${where}`).toBe(base.length);
          for (let i = 0; i < base.length; i++) {
            expect(pc(trans[i]!.root), `root+K: ${where} [${i}]`).toBe(pc(base[i]!.root + K));
            expect(trans[i]!.quality, `quality不変: ${where} [${i}]`).toBe(base[i]!.quality);
            expect(trans[i]!.start, `start不変: ${where} [${i}]`).toBe(base[i]!.start);
            expect(trans[i]!.dur, `dur不変: ${where} [${i}]`).toBe(base[i]!.dur);
          }
        }
  });
});

describe("C① genMelody の経過音も調内（key スケールに乗る）", () => {
  it("key=K でのスケール内音数 == key=0 でのスケール内音数（同 seed・移調 chords）", () => {
    for (const f of frames())
      for (const seed of SEEDS)
        for (const K of KEYS) {
          const chords0 = chordsOf(genChords({ ...f, key: 0 }, seed));
          const chordsK = transpose(chords0, K);
          const m0 = notesOf(genMelody({ ...f, key: 0 }, chords0, seed));
          const mK = notesOf(genMelody({ ...f, key: K }, chordsK, seed));
          const where = `${f.meter}/${f.mood}/${f.bars}#${seed} K=${K}`;
          expect(mK.length, `音数一致: ${where}`).toBe(m0.length);
          const sc0 = scalePcs(0, "major");
          const scK = scalePcs(K, "major");
          const in0 = m0.filter((n) => sc0.has(pc(n.pitch))).length;
          const inK = mK.filter((n) => scK.has(pc(n.pitch))).length;
          expect(inK, `スケール内音数の等価: ${where}`).toBe(in0);
        }
  });
});

describe("C① genBass は渡された（移調済）chords に追従する（回帰ガード）", () => {
  it("key=K・移調 chords のベース pc == key=0 のベース pc + K", () => {
    for (const f of frames())
      for (const seed of SEEDS)
        for (const K of KEYS) {
          const chords0 = chordsOf(genChords({ ...f, key: 0 }, seed));
          const chordsK = transpose(chords0, K);
          const b0 = notesOf(genBass({ ...f, key: 0 }, chords0, seed));
          const bK = notesOf(genBass({ ...f, key: K }, chordsK, seed));
          const where = `${f.meter}/${f.mood}/${f.bars}#${seed} K=${K}`;
          expect(bK.length, `音数一致: ${where}`).toBe(b0.length);
          for (let i = 0; i < b0.length; i++) {
            expect(pc(bK[i]!.pitch), `bass pc +K: ${where} [${i}]`).toBe(pc(b0[i]!.pitch + K));
          }
        }
  });
});

describe("C① genNamedProgression も key で移調される", () => {
  it("名前付き進行：key=K の root == key=0 の root + K", () => {
    for (const name of ["カノン", "王道", "小室", "ツーファイブ"])
      for (const K of KEYS) {
        const base = namedChordsOf(genNamedProgression(name, { meter: "4/4", key: 0 }));
        const trans = namedChordsOf(genNamedProgression(name, { meter: "4/4", key: K }));
        if (base.length === 0) continue; // 未知名はスキップ
        const where = `${name} K=${K}`;
        expect(trans.length, `本数一致: ${where}`).toBe(base.length);
        for (let i = 0; i < base.length; i++) {
          expect(pc(trans[i]!.root), `named root+K: ${where} [${i}]`).toBe(pc(base[i]!.root + K));
        }
      }
  });
});
