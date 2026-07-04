import { describe, it, expect } from "vitest";
import { rankRecommendations } from "../src/music/recommend";

// #20 ピッカーおすすめ＝拍子一致→調が近い順→ばらけ→上位K。純関数として契約をテスト。
describe("rankRecommendations（おすすめランキング）", () => {
  const mk = (id: string, meter: string | null, key: number | null = null) => ({ id, meter, key });

  it("拍子不一致は除外／未指定(null)は中立で残す", () => {
    const items = [mk("a", "4/4"), mk("b", "3/4"), mk("c", "6/8"), mk("d", null)];
    const out = rankRecommendations(items, { meter: "4/4", top: 10 }).map((x) => x.id);
    expect(out).toContain("a"); // 4/4 一致
    expect(out).toContain("d"); // meter null＝中立で残る
    expect(out).not.toContain("b"); // 3/4 は bpb=3≠4
    expect(out).not.toContain("c"); // 6/8 は bpb=3≠4
    // 6/8 と 3/4 は同 bpb(3)＝拍子一致扱い（四分基準）
    expect(rankRecommendations([mk("c", "6/8")], { meter: "3/4", top: 10 }).map((x) => x.id)).toEqual(["c"]);
  });

  it("調が近い順（五度圏距離）＝keyありは近い方が先／keyless は中立(3)", () => {
    // key=0(C) を frame に。G(7)=五度圏で隣(距離1)、F#(6)=距離6(最遠)、keyless=3。
    const items = [mk("far", "4/4", 6), mk("near", "4/4", 7), mk("none", "4/4", null)];
    const out = rankRecommendations(items, { meter: "4/4", key: 0, top: 10 }).map((x) => x.id);
    expect(out[0]).toBe("near"); // 距離1が先頭
    expect(out.indexOf("none")).toBeLessThan(out.indexOf("far")); // keyless(3) < far(6)
  });

  it("上位 top 件に丸める（既定6）", () => {
    const items = Array.from({ length: 20 }, (_, i) => mk(`m${i}`, "4/4"));
    expect(rankRecommendations(items, { meter: "4/4" }).length).toBe(6);
    expect(rankRecommendations(items, { meter: "4/4", top: 3 }).length).toBe(3);
  });

  it("決定的（同入力→同出力）＝ばらけは id ハッシュで安定", () => {
    const items = Array.from({ length: 30 }, (_, i) => mk(`x${i}`, "4/4"));
    const a = rankRecommendations(items, { meter: "4/4", top: 6 }).map((x) => x.id);
    const b = rankRecommendations(items, { meter: "4/4", top: 6 }).map((x) => x.id);
    expect(a).toEqual(b);
  });
});
