// 32小節（8小節フレーズ×4）などの長尺セクションを全生成経路が「barsまで素直に」通すことの担保
// （実機検収 docs/research/2026-07-14-amelo-acceptance-run.md §3-H1「全生成が16小節上限で黙って頭打ち」の是正）。
// 契約：
//  (a) normalizeFrame/barsOf は 1..MAX_BARS(=64) を通す。16 で黙って切らない。
//  (b) MAX_BARS 超過（例 100）は上限へクランプ＋レスポンス meta.warnings に明示（黙って切らない）。
//  (c) 32小節で gen_chords/gen_skeleton(AABAフォーム含む)/gen_melody/gen_bass/gen_drums(フィル) が
//      16小節でなく 32小節ぶんの内容を返す。
import { describe, it, expect } from "vitest";
import {
  normalizeFrame, MAX_BARS,
  genChords, genMelody, genBass, genDrums, genSkeletonCandidates,
  type Frame,
} from "../src/music/generate";

type Note = { pitch: number; start: number; dur: number };
type Chord = { root: number; quality: string; start: number; dur: number };
const F32: Frame = { key: 9, mode: "minor", meter: "4/4", tempo: 120, bars: 32 };
const BPB = 4;
// 32小節ぶんのコード（1小節1和音）＝メロ/ベースへ渡す土台。
const chords32 = (): Chord[] => (genChords(F32, 7).items[0]!.content as { chords: Chord[] }).chords;

describe("長尺セクション（32小節）を素直に通す（16上限の撤廃）", () => {
  it("(a) normalizeFrame は 32/64 を保持し 16 で切らない", () => {
    expect(normalizeFrame({ bars: 32 }).bars).toBe(32);
    expect(normalizeFrame({ bars: 64 }).bars).toBe(64);
    expect(normalizeFrame({ bars: 16 }).bars).toBe(16);
  });

  it("(b) MAX_BARS(64) 超過は上限へクランプし meta.warnings で明示（黙って切らない）", () => {
    expect(MAX_BARS).toBe(64);
    expect(normalizeFrame({ bars: 100 }).bars).toBe(64);
    const r = genChords({ key: 0, mode: "major", meter: "4/4", bars: 100 }, 1);
    const chords = (r.items[0]!.content as { chords: Chord[] }).chords;
    expect(chords.length).toBe(64); // 128 でも 100 でもなく安全弁 64
    expect(r.meta?.warnings?.some((w) => /64/.test(w))).toBe(true);
  });

  it("gen_chords が 32小節（32和音）を返す", () => {
    const chords = chords32();
    expect(chords.length).toBe(32);
    expect(chords[chords.length - 1]!.start).toBeCloseTo(31 * BPB, 3);
  });

  it("gen_skeleton が 32小節の骨格を返す（bars=32・後半にも音がある）", () => {
    const r = genSkeletonCandidates(F32, chords32(), 3);
    const content = r.items[0]!.content as { bars: number; tones: { start: number; pitch: number }[] };
    expect(content.bars).toBe(32);
    // 16小節(=64拍)より後にも骨格音がある＝16で頭打ちしていない
    expect(content.tones.some((t) => t.start >= 16 * BPB)).toBe(true);
  });

  it("gen_skeleton の AABA フォーム回帰が 32小節で機能する（後半に音があり形が崩れない）", () => {
    const r = genSkeletonCandidates(F32, chords32(), 5, { form: "aaba" });
    const content = r.items[0]!.content as { bars: number; tones: { start: number; pitch: number }[] };
    expect(content.bars).toBe(32);
    expect(content.tones.some((t) => t.start >= 16 * BPB)).toBe(true);
    expect(content.tones.length).toBeGreaterThan(0);
  });

  it("gen_melody(useV2) が 32小節ぶん（16小節超えのメロ）を返す", () => {
    const r = genMelody(F32, chords32(), 11, { useV2: true, density: 0.5 });
    const notes = (r.items[0]!.content as { notes: Note[] }).notes;
    expect(notes.length).toBeGreaterThan(0);
    const maxStart = Math.max(...notes.map((n) => n.start));
    expect(maxStart).toBeGreaterThan(16 * BPB); // 16小節(64拍)を越えて鳴る
    expect(maxStart).toBeLessThan(32 * BPB + BPB); // 32小節枠内
  });

  it("gen_bass が 32小節ぶん（16小節超えのベース）を返す", () => {
    const r = genBass(F32, chords32(), 13, null);
    const notes = (r.items[0]!.content as { notes: Note[] }).notes;
    expect(notes.length).toBeGreaterThan(0);
    expect(Math.max(...notes.map((n) => n.start))).toBeGreaterThan(16 * BPB);
  });

  it("gen_drums のフィル敷き（build 含む）が 32小節ぶんをタイルする", () => {
    const r = genDrums(F32, 2, { fill: 0.6 });
    const content = r.items[0]!.content as { rhythm: { bars: number } };
    expect(content.rhythm.bars).toBe(32); // 16でなく32小節へ敷く
  });
});
