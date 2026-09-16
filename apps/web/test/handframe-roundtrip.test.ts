// ピアノ伴奏（phrase_maker 試作 #1）取り込み S4＝和音パターンの形への写しと、web の明示の音の経路（往復一致）。
// 正典＝docs/drafts/2026-09-16-handframe-evolution-design.md §4-2・§5 S4／docs/design.md「和音パターンの明示の音（notes?）」。
// 往復一致は「形を運べた証明」＝診断であって進捗ではない（進捗は耳）。
import { describe, expect, it } from "vitest";
import { generateHandFrameBand, handFrameToChordPattern, normRoot, type BandChord } from "@cm/music-core";
import { resolveChordPattern, type ChordEntry, type ChordPatternContent } from "../src/music";

const ch = (root: string, quality: string, beats: number): BandChord => ({ root, quality, beats });
// 試作 #1 の進行＝Fmaj7｜G｜Em7｜Am7→G を4回（16小節・2拍替わり）
const HALF: BandChord[] = Array.from({ length: 4 }, () => [ch("F", "maj7", 4), ch("G", "", 4), ch("E", "m7", 4), ch("A", "m7", 2), ch("G", "", 2)]).flat();
const BAR: BandChord[] = Array.from({ length: 4 }, () => [ch("F", "maj7", 4), ch("G", "", 4), ch("E", "m7", 4), ch("A", "m7", 4)]).flat();
const JAZZ: BandChord[] = [ch("D", "m7", 4), ch("G", "7", 4), ch("C", "maj7", 8), ch("F#", "m7b5", 2), ch("B", "7", 2), ch("E", "m", 4)];

const toEntries = (prog: readonly BandChord[], shift = 0): ChordEntry[] => {
  let t = 0;
  return prog.map((c) => { const e = { root: (normRoot(c.root) + shift) % 12, quality: c.quality, start: t, dur: c.beats }; t += c.beats; return e; });
};
type N = { pitch: number; start: number; dur: number; vel: number };
const sortN = (xs: readonly N[]) => [...xs].sort((a, b) => a.start - b.start || a.pitch - b.pitch || a.dur - b.dur);
const pick = (xs: readonly { pitch: number; start: number; dur: number; vel?: number }[]): N[] =>
  sortN(xs.map((n) => ({ pitch: n.pitch, start: n.start, dur: n.dur, vel: n.vel ?? -1 })));
const rendered = (content: unknown, entries: ChordEntry[], key: number) =>
  pick(resolveChordPattern(content as ChordPatternContent, entries, key, 96, 0));

describe("往復一致：生成器の絶対音＝写し→web の実音化（同じ進行・同じ調）", () => {
  const cases: [string, BandChord[], number, object][] = [
    ["試作 #1（2拍替わり・揺れ off）", HALF, 0, { humanize: false }],
    ["試作 #1（揺れ on＝強さのばらつき込み）", HALF, 0, {}],
    ["1小節替わり", BAR, 0, { humanize: false }],
    ["8分裏の単音なし・段4・ペダルなし", HALF, 0, { offbeatSingles: false, level: 4, sustainPedal: false }],
    ["ジャズ進行・調 G・種違い", JAZZ, 7, { seed: 99 }],
  ];
  for (const [name, prog, key, extra] of cases) {
    it(name, () => {
      const opts = { tempo: 96, seed: 1234, ...extra };
      const gen = generateHandFrameBand(prog, opts);
      const { content, feel } = handFrameToChordPattern(prog, { ...opts, key });
      expect(feel).toEqual(gen.feel);
      const got = rendered(content, toEntries(prog), key);
      const want = pick(gen.content.notes);
      expect(got.length).toBe(want.length);
      // 音高・強さは完全一致、時刻と長さは浮動小数の誤差 1e-9 拍まで
      got.forEach((g, i) => {
        const w = want[i]!;
        expect([g.pitch, g.vel]).toEqual([w.pitch, w.vel]);
        expect(Math.abs(g.start - w.start)).toBeLessThan(1e-9);
        expect(Math.abs(g.dur - w.dur)).toBeLessThan(1e-9);
      });
      // ペダル（CC64）も写しで保たれる（拍→秒で生成器の窓と一致）
      expect(content.pedal).toEqual(gen.content.pedal);
      if (gen.content.pedal) {
        const sec = content.pedal!.map((p) => [(p.start * 60) / 96, ((p.start + p.dur) * 60) / 96]);
        sec.forEach(([dn, up], i) => { expect(dn).toBeCloseTo(gen.pedals[i]![0], 9); expect(up).toBeCloseTo(gen.pedals[i]![1], 9); });
      }
    });
  }
  it("写した content は JSON の保存を往復しても同じ音（未知フィールド・pedal・gen が落ちない）", () => {
    const { content } = handFrameToChordPattern(HALF, { tempo: 96, seed: 1234 });
    const saved = JSON.parse(JSON.stringify(content));
    expect(saved).toEqual(content);
    expect(rendered(saved, toEntries(HALF), 0)).toEqual(rendered(content, toEntries(HALF), 0));
  });
});

describe("調・進行を変えても付いてくる（和音パターンの形に写す利点）", () => {
  const { content } = handFrameToChordPattern(HALF, { tempo: 96, seed: 1234, humanize: false });
  const base = rendered(content, toEntries(HALF), 0);
  it("調を変える（コードと調を一緒に移す）＝全ての音が同じ半音だけ動く・時刻と強さはそのまま", () => {
    for (let k = 1; k < 12; k++) {
      const moved = rendered(content, toEntries(HALF, k), k);
      expect(moved.map((n) => ({ ...n, pitch: n.pitch - k }))).toEqual(base);
    }
  });
  it("進行を変える＝音数・時刻は保ち、各音が新しいコードの同じ度数に乗る（同じ高さの帯）", () => {
    // 同じ区切りで別の進行：Fmaj7→Dm7／G→Bb／Em7→Cmaj7／Am7→F／G→C
    const OTHER: BandChord[] = Array.from({ length: 4 }, () => [ch("D", "m7", 4), ch("A#", "", 4), ch("C", "maj7", 4), ch("F", "", 2), ch("C", "", 2)]).flat();
    const other = rendered(content, toEntries(OTHER), 0);
    expect(other.length).toBe(base.length);
    other.forEach((n, i) => expect(Math.abs(n.pitch - base[i]!.pitch)).toBeLessThanOrEqual(11));
    const starts = (xs: N[]) => xs.map((n) => [n.start, n.dur, n.vel]).sort();
    expect(starts(other)).toEqual(starts(base));
    // 和音の音になっているか：Dm7 の区間（0〜4拍）の音は全て D F A C
    const dm7 = new Set([2, 5, 9, 0]);
    const inDm7 = other.filter((n) => n.start < 4 - 1e-9);
    expect(inDm7.length).toBeGreaterThan(0);
    // 生成器が置いた色音（9度など）は度数で運ぶので、Fmaj7 の区間で和音の音だった音だけ確かめる
    const fmaj7 = new Set([5, 9, 0, 4]);
    base.forEach((b, i) => { if (b.start < 4 - 1e-9 && fmaj7.has(b.pitch % 12)) expect(dm7.has(other[i]!.pitch % 12)).toBe(true); });
  });
  it("followChords：生成後にコードの替わり目を増やすと、跨いだ音は境界で切れて新しいコードで解き直される", () => {
    // 1小節目の Fmaj7 を 2拍＋2拍（Fmaj7→Dm7）に割る
    const SPLIT = toEntries(HALF);
    SPLIT.splice(0, 1, { root: 5, quality: "maj7", start: 0, dur: 2 }, { root: 2, quality: "m7", start: 2, dur: 2 });
    const out = rendered(content, SPLIT, 0);
    const crossing = base.filter((n) => n.start < 2 - 1e-9 && n.start + n.dur > 2 + 1e-9);
    expect(crossing.length).toBeGreaterThan(0);
    for (const n of out) if (n.start < 2 - 1e-9) expect(n.start + n.dur).toBeLessThanOrEqual(2 + 1e-9);
    expect(out.length).toBe(base.length + crossing.length);
  });
});

describe("明示の音の経路の条件（web）", () => {
  const chords: ChordEntry[] = [{ root: 5, quality: "maj7", start: 0, dur: 4 }];
  const baseContent = { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 }, steps: 16, lh: { mode: "root" } };
  it("明示の音のある打点は voiceToTop を通らない・無い打点は従来どおり", () => {
    const c = { ...baseContent, hits: [{ step: 0, dur: 4, notes: [{ deg: "R", oct: 0, vel: 90 }, { deg: "3", oct: 0 }, { deg: "5", oct: 0 }, { deg: "R", oct: 1 }] }, { step: 8, dur: 4 }] };
    const out = resolveChordPattern(c as unknown as ChordPatternContent, chords, 0);
    const at0 = out.filter((n) => n.start === 0 && n.pitch > 48).map((n) => [n.pitch, n.vel]);
    expect(at0).toEqual([[53, 90], [57, undefined], [60, undefined], [65, undefined]]); // F A C F（右手からルートを抜かない）
    const at2 = resolveChordPattern({ ...baseContent, hits: [{ step: 8, dur: 4 }] } as unknown as ChordPatternContent, chords, 0);
    expect(out.filter((n) => n.start === 2)).toEqual(at2.filter((n) => n.start === 2));
  });
  it("lh.hits[].oct があるときは左手帯・色音の持ち上げを掛けない（指定の高さのまま）", () => {
    const c = { ...baseContent, hits: [], lh: { mode: "custom", hits: [{ step: 0, dur: 16, deg: "3", oct: 0, vel: 70 }, { step: 0, dur: 16, deg: "7", oct: 0, vel: 70 }, { step: 0, dur: 16, deg: "3" }] } };
    const out = resolveChordPattern(c as unknown as ChordPatternContent, chords, 0);
    expect(out.map((n) => n.pitch)).toEqual([57, 64, 57]); // 3＝A3・7＝E4（指定）／oct なしの 3＝従来の左手（A2→持ち上げ A3）
  });
});
