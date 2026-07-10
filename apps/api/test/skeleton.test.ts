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

  // P0-b：対称⇔非対称フレーズ選択（ユーザー明言"ないとダメ"）。既定=対称（後方互換）。
  it("既定は対称（従来どおり2小節句）＝後退ゼロ", () => {
    expect(planSkeleton(8, "4/4").map((p) => p.beats)).toEqual([8, 8, 8, 8]); // 2小節×4拍 ×4
  });
  it("非対称：8小節→3+3+2（square脱却・各句は小節×4拍）", () => {
    const ph = planSkeleton(8, "4/4", { phrasing: "asymmetric" });
    expect(ph.map((p) => p.beats / 4)).toEqual([3, 3, 2]); // 小節数で 3+3+2
    expect(ph[ph.length - 1]!.cadenceDegree).toBe(1); // 最終は主音で閉じる（不変）
    expect(ph[ph.length - 1]!.isLast).toBe(true);
    expect(ph[0]!.startBeat).toBe(0);
    expect(ph[1]!.startBeat).toBe(12); // 3小節×4拍
  });
  it("非対称：5→3+2 / 6→3+3 / 7→3+4（1小節の弱い端句は前へ吸収）", () => {
    expect(planSkeleton(5, "4/4", { phrasing: "asymmetric" }).map((p) => p.beats / 4)).toEqual([3, 2]);
    expect(planSkeleton(6, "4/4", { phrasing: "asymmetric" }).map((p) => p.beats / 4)).toEqual([3, 3]);
    expect(planSkeleton(7, "4/4", { phrasing: "asymmetric" }).map((p) => p.beats / 4)).toEqual([3, 4]);
  });
  it("非対称でも全小節を消費する（合計＝bars）", () => {
    for (const b of [3, 4, 5, 6, 7, 8, 9, 12]) {
      const sum = planSkeleton(b, "4/4", { phrasing: "asymmetric" }).reduce((s, p) => s + p.beats / 4, 0);
      expect(sum, `bars=${b}`).toBe(b);
    }
  });

  // 対策2-A（2026-07-11・句パターン辞書＝終止位置の単峰解消）
  it("period：8小節→[4,4]（4小節句・終止が半分＝長い塊）・最終主音", () => {
    const ph = planSkeleton(8, "4/4", { phrasing: "period" });
    expect(ph.map((p) => p.beats / 4)).toEqual([4, 4]); // 4小節句が2つ
    expect(ph.length).toBe(2); // 終止は2箇所（symmetric は4箇所）
    expect(ph[ph.length - 1]!.cadenceDegree).toBe(1);
    expect(ph[ph.length - 1]!.isLast).toBe(true);
  });
  it("sentence：8小節→[2,2,4]（短短長＝畳み掛け→長い解放）・最終句が最長・主音", () => {
    const ph = planSkeleton(8, "4/4", { phrasing: "sentence" });
    expect(ph.map((p) => p.beats / 4)).toEqual([2, 2, 4]);
    expect(ph[2]!.beats / 4).toBe(4); // 最終句が4小節＝最長の解放
    expect(ph[2]!.cadenceDegree).toBe(1);
    expect(ph[2]!.isLast).toBe(true);
  });
  it("period/sentence でも全小節を消費する（合計＝bars・端数吸収）", () => {
    for (const mode of ["period", "sentence"] as const) {
      for (const b of [2, 4, 5, 6, 7, 8, 9, 12, 16]) {
        const sum = planSkeleton(b, "4/4", { phrasing: mode }).reduce((s, p) => s + p.beats / 4, 0);
        expect(sum, `${mode} bars=${b}`).toBe(b);
      }
    }
  });
});
