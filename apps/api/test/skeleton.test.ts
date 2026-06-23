import { describe, it, expect } from "vitest";
import { planSkeleton } from "../src/music/skeleton";

describe("フレーズ骨格プランナ skeleton.ts（契約・design #12-M）", () => {
  it("4小節4/4：前楽節(属音=問い)＋後楽節(主音=答え)・両句末息継ぎ・最後にlast", () => {
    const ph = planSkeleton(4, "4/4");
    expect(ph.length).toBe(2);
    expect(ph.map((p) => p.role)).toEqual(["antecedent", "consequent"]);
    expect(ph.map((p) => p.cadenceDegree)).toEqual([5, 1]);
    expect(ph.every((p) => p.breath)).toBe(true);
    expect(ph[0]!.startBeat).toBe(0);
    expect(ph[1]!.startBeat).toBe(8); // 2小節×4拍
    expect(ph[1]!.isLast).toBe(true);
  });

  it("8小節：2 period＝[前,後,前,後]・カデンツ[5,1,5,1]・最終主音", () => {
    const ph = planSkeleton(8, "4/4");
    expect(ph.map((p) => p.role)).toEqual(["antecedent", "consequent", "antecedent", "consequent"]);
    expect(ph.map((p) => p.cadenceDegree)).toEqual([5, 1, 5, 1]);
    expect(ph[3]!.isLast).toBe(true);
  });

  it("2小節：単一句・主音終止・last", () => {
    const ph = planSkeleton(2, "4/4");
    expect(ph.length).toBe(1);
    expect(ph[0]!.cadenceDegree).toBe(1);
    expect(ph[0]!.isLast).toBe(true);
  });

  it("6/8：句長は beatsPerBar=3 基準（2小節句=6拍）", () => {
    const ph = planSkeleton(4, "6/8");
    expect(ph[0]!.beats).toBe(6); // 2小節×3拍
    expect(ph[1]!.startBeat).toBe(6);
  });

  it("端数(6小節)でも最終句は主音で閉じる", () => {
    const ph = planSkeleton(6, "4/4");
    expect(ph[ph.length - 1]!.cadenceDegree).toBe(1);
    expect(ph[ph.length - 1]!.isLast).toBe(true);
  });
});
