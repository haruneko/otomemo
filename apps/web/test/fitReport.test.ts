import { describe, it, expect } from "vitest";
import { fitReportText } from "../src/fitReport";

describe("fitReportText (噛み合い診断・監査GN-07)", () => {
  it("issue.msg を出す＝『[object Object]』にならない", () => {
    const s = fitReportText({
      score: 0.4,
      inChordRate: 0.46,
      issues: [{ pos: -1, pitch: -1, type: "scale", msg: "スケール外の音が多い(30%)" } as FitIssueLike],
    });
    expect(s).toContain("スケール外の音が多い(30%)");
    expect(s).not.toContain("[object Object]");
  });

  it("score/率で verdict を切替", () => {
    expect(fitReportText({ score: 0.8, inChordRate: 1 })).toContain("よく噛み合ってる");
    expect(fitReportText({ score: 0.6, inChordRate: 0.64 })).toContain("まあまあ");
    expect(fitReportText({ score: 0.2, inChordRate: 0.46 })).toContain("ズレ気味");
  });

  it("issues 無しなら末尾ヒントは付かない", () => {
    const s = fitReportText({ score: 0.8, inChordRate: 0.9, issues: [] });
    expect(s).toBe("噛み合い：よく噛み合ってる（コードトーン率 90%）");
  });
});

type FitIssueLike = { pos: number; pitch: number; type: string; msg: string };
