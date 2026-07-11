import { describe, it, expect } from "vitest";
import {
  notesForContent,
  compositeNotes,
  skeletonPreviewNotes,
  isSkeleton,
  type SkeletonContent,
  type CompositeChild,
} from "../src/music";

// 骨格ネタ（design #20）：単体プレビュー＝支配区間の白玉／合成＝無音。

describe("skeleton preview (単体・白玉)", () => {
  const content: SkeletonContent = {
    bars: 2,
    tones: [{ start: 0, pitch: 60 }, { start: 4, pitch: 67 }],
  };
  it("isSkeleton guard", () => {
    expect(isSkeleton(content)).toBe(true);
    expect(isSkeleton({ notes: [] })).toBe(false);
  });
  it("各tone は次のブレークポイント/曲末まで白玉として鳴る", () => {
    expect(skeletonPreviewNotes(content)).toEqual([
      { pitch: 60, start: 0, dur: 4 },
      { pitch: 67, start: 4, dur: 4 }, // 4→8 (bars*4)
    ]);
  });
  it("pitch:null（骨格休符）は無音＝出力に含まれない", () => {
    const c: SkeletonContent = { bars: 1, tones: [{ start: 0, pitch: null }, { start: 2, pitch: 62 }] };
    expect(skeletonPreviewNotes(c)).toEqual([{ pitch: 62, start: 2, dur: 2 }]);
  });
  it("支配は句境界(phrases)をまたがない", () => {
    const c: SkeletonContent = { bars: 2, tones: [{ start: 0, pitch: 60 }, { start: 5, pitch: 64 }], phrases: [{ endBeat: 4 }] };
    expect(skeletonPreviewNotes(c)).toEqual([
      { pitch: 60, start: 0, dur: 4 }, // 句末4で切れる（gap [4,5) は無音）
      { pitch: 64, start: 5, dur: 3 },
    ]);
  });
  it("notesForContent(kind=skeleton) はプレビューへ委譲", () => {
    expect(notesForContent("skeleton", content)).toEqual(skeletonPreviewNotes(content));
  });
});

describe("skeleton in composite (合成・無音)", () => {
  it("compositeNotes は骨格を鳴らさない（chord_progression と同様に無音）", () => {
    const skeletonChild: CompositeChild = {
      position: 0,
      node: { neta: { kind: "skeleton", content: { bars: 2, tones: [{ start: 0, pitch: 60 }] } as SkeletonContent } },
    };
    const melodyChild: CompositeChild = {
      position: 0,
      node: { neta: { kind: "melody", content: { notes: [{ pitch: 72, start: 0, dur: 1 }] } } },
    };
    const withSkel = compositeNotes([skeletonChild, melodyChild], 0);
    const melOnly = compositeNotes([melodyChild], 0);
    // 骨格は音を足さない＝メロだけの合成と一致
    expect(withSkel).toEqual(melOnly);
    expect(withSkel.some((n) => n.pitch === 60)).toBe(false);
  });
});
