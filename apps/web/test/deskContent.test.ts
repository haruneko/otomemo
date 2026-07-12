import { describe, it, expect } from "vitest";
import { deskLoadContent, deskSaveContent, deskLensNotes } from "../src/deskContent";
import { LENS_FOLD, LENS_REAL } from "../src/deskLens";
import type { ChordEntry, Note, SkeletonContent } from "../src/music";

// --- (b) 配置越し編集の往復（2段解除の外側＝unshift）＝bit 往復（handoff §3 D1-b） -------------------
describe("deskLoadContent / deskSaveContent（配置越し往復・shift≠0）", () => {
  it("読込 +shift → 保存 −shift で元に戻る（null 休符は不変）", () => {
    const shift = 5;
    const content: SkeletonContent = {
      bars: 4,
      tones: [{ start: 0, pitch: 60 }, { start: 4, pitch: null }, { start: 6, pitch: 67 }],
      bass: [{ start: 0, pitch: 48 }, { start: 4, pitch: null }],
      phrases: [{ endBeat: 8, cadence: "half" }, { endBeat: 16, cadence: "full" }],
    };
    const view = deskLoadContent(content, shift);
    // 実調ビュー：非 null ピッチだけ +shift、null は不変。
    expect(view.tones).toEqual([{ start: 0, pitch: 65 }, { start: 4, pitch: null }, { start: 6, pitch: 72 }]);
    expect(view.bass).toEqual([{ start: 0, pitch: 53 }, { start: 4, pitch: null }]);
    // 往復＝素材調へ戻る（deepEqual）。
    expect(deskSaveContent(view, shift)).toEqual(content);
  });

  it("bass 無し content も往復で保存キーが増えない", () => {
    const shift = -3;
    const content: SkeletonContent = { bars: 2, tones: [{ start: 0, pitch: 64 }] };
    const view = deskLoadContent(content, shift);
    expect(view.tones).toEqual([{ start: 0, pitch: 61 }]);
    expect("bass" in view).toBe(false);
    const saved = deskSaveContent(view, shift);
    expect(saved).toEqual({ bars: 2, tones: [{ start: 0, pitch: 64 }] });
    expect("bass" in saved).toBe(false);
  });

  it("元の content を破壊しない", () => {
    const content: SkeletonContent = { bars: 1, tones: [{ start: 0, pitch: 60 }] };
    deskLoadContent(content, 7);
    expect(content.tones[0]!.pitch).toBe(60);
  });
});

// --- (a) deskLens 消費の確認＝机の getNotes 合成が正しい（handoff §3 D1-a） -------------------------
describe("deskLensNotes（畳み群＝fold のみ／実音群＝real）", () => {
  const stateReal: SkeletonContent = {
    bars: 2,
    tones: [{ start: 0, pitch: 64 }, { start: 4, pitch: 67 }],
    bass: [{ start: 0, pitch: 48 }],
  };
  const earChordsRel: ChordEntry[] = [{ root: 0, quality: "", start: 0, dur: 8 }];
  // composite 相当＝編成合成（chord 楽器・ドラムを含む）。
  const composite: Note[] = [
    { pitch: 72, start: 0, dur: 1, program: 0, part: "melody" },
    { pitch: 67, start: 0, dur: 2, program: 4, part: "chord" },
    { pitch: 36, start: 0, dur: 0.25, drum: true, part: "drums" },
  ];
  const bars = 2, bpb = 4;
  const out = deskLensNotes({ stateReal, earChordsRel, composite, skelPosition: 0, bars, bpb });
  const fold = out.filter((n) => n.lens === LENS_FOLD);
  const real = out.filter((n) => n.lens === LENS_REAL);

  it("全ての音がレンズ印を持つ（fold か real のどちらか）", () => {
    expect(fold.length + real.length).toBe(out.length);
  });

  it("畳み群：クリック＝bars*bpb 本・コード楽器は混ざらない", () => {
    const clicks = fold.filter((n) => n.drum === true);
    expect(clicks).toHaveLength(bars * bpb);
    expect(fold.some((n) => n.part === "chord")).toBe(false); // コード楽器非混入
    // 2声（melody/bass）＝クリック以外は skelEar のみ
    const voices = fold.filter((n) => !n.drum);
    expect(voices.length).toBeGreaterThan(0);
    expect(new Set(voices.map((n) => n.part))).toEqual(new Set(["melody", "bass"]));
  });

  it("実音群：composite＋骨格線（skelEarReal）＝composite の chord/drum を含む", () => {
    const skelReCount = fold.length - bars * bpb; // fold ＝ skelEarReal ＋ click
    expect(real.length).toBe(composite.length + skelReCount);
    expect(real.some((n) => n.part === "chord")).toBe(true); // composite の和声が入る
    expect(real.some((n) => n.drum === true)).toBe(true); // composite のドラムが入る
    // 骨格線（program 48=String / 42=Cello）も real に混ざる
    expect(real.some((n) => n.program === 48 || n.program === 42)).toBe(true);
  });

  it("skelPosition オフセットが効く（骨格ブロック相対→セクション座標）", () => {
    const shifted = deskLensNotes({ stateReal, earChordsRel, composite, skelPosition: 8, bars, bpb });
    const foldVoices = shifted.filter((n) => n.lens === LENS_FOLD && !n.drum);
    // 全ての骨格線 start が +8 されている（最小 start が 8 以上）。
    expect(Math.min(...foldVoices.map((n) => n.start))).toBeGreaterThanOrEqual(8);
  });
});
