import { describe, it, expect } from "vitest";
import { stageLensSets, stageLabels, stageAllNotes } from "../src/deskStages";
import { deskLensNotes, type DeskLensArgs } from "../src/deskContent";
import { LENS_FOLD, LENS_REAL } from "../src/deskLens";
import { chordsToNotes, type ChordEntry, type Note, type SkeletonContent } from "../src/music";

// 机の現 state（実調）と earChordsRel（ブロック相対）＝deskContent.test と同型。
const stateReal: SkeletonContent = {
  bars: 2,
  tones: [{ start: 0, pitch: 64 }, { start: 4, pitch: 67 }],
  bass: [{ start: 0, pitch: 48 }],
};
const earChordsRel: ChordEntry[] = [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }];
// composite 相当＝編成合成（chord 楽器・ドラムを含む・窓内 start）。
const composite: Note[] = [
  { pitch: 72, start: 0, dur: 1, program: 0, part: "melody" },
  { pitch: 67, start: 0, dur: 2, program: 4, part: "chord" },
  { pitch: 36, start: 0, dur: 0.25, drum: true, part: "drums" },
  { pitch: 38, start: 4, dur: 0.25, drum: true, part: "drums" },
];
const bars = 2, bpb = 4;
const baseArgs: DeskLensArgs = { stateReal, earChordsRel, composite, skelPosition: 0, bars, bpb };
const args = { ...baseArgs, effChords: earChordsRel };

describe("stageLabels（レンズ2択のラベルが focusStage で読み替わる）", () => {
  it("①beat=［パターン単体｜ベッド］・②chord=［和声だけ｜編成］・③④=［畳み｜実音］", () => {
    expect(stageLabels("beat")).toEqual(["パターン単体", "ベッド"]);
    expect(stageLabels("chord")).toEqual(["和声だけ", "編成"]);
    expect(stageLabels("skeleton")).toEqual(["畳み", "実音"]);
    expect(stageLabels("surface")).toEqual(["畳み", "実音"]);
  });
});

describe("③④ bit一致：skeleton/surface の [...a,...b] は現行 deskLensNotes と音符列 deepEqual（LENS印含む）", () => {
  it("skeleton：a=fold群(LENS_FOLD)・b=real群(LENS_REAL)・合算が deskLensNotes と一致", () => {
    const s = stageLensSets("skeleton", args);
    expect(s.labels).toEqual(["畳み", "実音"]);
    for (const n of s.a) expect(n.lens).toBe(LENS_FOLD);
    for (const n of s.b) expect(n.lens).toBe(LENS_REAL);
    expect([...s.a, ...s.b]).toEqual(deskLensNotes(baseArgs)); // ★D1〜D4 の音が一切変わらない証拠
  });
  it("surface：skeleton と同一（③④は同じ reduce）", () => {
    expect(stageLensSets("surface", args)).toEqual(stageLensSets("skeleton", args));
  });
  it("previewMelody（D4試着）経路も bit一致＝合算が deskLensNotes と一致", () => {
    const previewMelody: Note[] = [{ pitch: 76, start: 0, dur: 1, part: "melody" }];
    const a2 = { ...args, previewMelody };
    const s = stageLensSets("skeleton", a2);
    expect([...s.a, ...s.b]).toEqual(deskLensNotes({ ...baseArgs, previewMelody }));
  });
  it("stageAllNotes(skeleton) は deskLensNotes と完全一致", () => {
    expect(stageAllNotes("skeleton", args)).toEqual(deskLensNotes(baseArgs));
  });
});

describe("①beat：パターン単体＝ドラムのみ／ベッド＝フル", () => {
  const s = stageLensSets("beat", args);
  it("labels=［パターン単体｜ベッド］", () => {
    expect(s.labels).toEqual(["パターン単体", "ベッド"]);
  });
  it("a（パターン単体）＝全て drum・全て LENS_FOLD", () => {
    expect(s.a.length).toBeGreaterThan(0);
    for (const n of s.a) {
      expect(n.drum).toBe(true);
      expect(n.lens).toBe(LENS_FOLD);
    }
  });
  it("b（ベッド）＝フル(real)＝コード楽器/ドラム＋骨格線を含み全て LENS_REAL", () => {
    for (const n of s.b) expect(n.lens).toBe(LENS_REAL);
    expect(s.b.some((n) => n.part === "chord")).toBe(true);
    expect(s.b.some((n) => n.drum === true)).toBe(true);
    expect(s.b.some((n) => n.program === 48 || n.program === 42)).toBe(true); // 骨格線（skelEar）
  });
});

describe("②chord：和声だけ＝素の三和音（chordsToNotes）／編成＝フル", () => {
  const s = stageLensSets("chord", args);
  it("labels=［和声だけ｜編成］", () => {
    expect(s.labels).toEqual(["和声だけ", "編成"]);
  });
  it("a（和声だけ）＝effChords 由来のコードトーン（part:'chord'・LENS_FOLD）・コード数×構成音", () => {
    const expected = chordsToNotes(earChordsRel); // 2 三和音＝3+3=6音
    expect(s.a).toHaveLength(expected.length);
    for (const n of s.a) {
      expect(n.part).toBe("chord");
      expect(n.lens).toBe(LENS_FOLD);
    }
    // 音高/start/dur は chordsToNotes をそのまま（三和音の縦の相手）。
    expect(s.a.map((n) => [n.pitch, n.start, n.dur])).toEqual(expected.map((n) => [n.pitch, n.start, n.dur]));
  });
  it("分数コードは bass も足す（chordsToNotes の分数展開を素直に流用）", () => {
    const slash: ChordEntry[] = [{ root: 0, quality: "", start: 0, dur: 4, bass: 4 }]; // C/E
    const s2 = stageLensSets("chord", { ...args, effChords: slash });
    expect(s2.a).toHaveLength(chordsToNotes(slash).length); // 三和音3＋オンベース1=4
  });
  it("b（編成）＝フル(real)＝コード楽器/ドラムを含み全て LENS_REAL", () => {
    for (const n of s.b) expect(n.lens).toBe(LENS_REAL);
    expect(s.b.some((n) => n.part === "chord")).toBe(true);
  });
});
