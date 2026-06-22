import { describe, it, expect } from "vitest";
// 連想エンジン：説明・命名（機能解析＋名前あてを束ねた「事実」。なぜはClaude）。
import { explainProgression } from "../src/music";

const CANON = [
  { root: 0, quality: "" }, { root: 7, quality: "" }, { root: 9, quality: "m" }, { root: 4, quality: "m" },
  { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 5, quality: "" }, { root: 7, quality: "" },
];

describe("explainProgression", () => {
  it("カノンを束ねて返す（名前＝カノン・度数/機能/終止つき）", () => {
    const e = explainProgression(CANON, { key: 0, mode: "major" });
    expect(e.name).toBe("カノン");
    expect(e.degrees[0].roman).toBe("I");
    expect(e.degrees[0].function).toBe("T");
    expect(e.cadence.type).not.toBe(undefined);
    expect(e.key).toBe(0);
  });
  it("定番に当たらない進行は name=null（誤命名しない）", () => {
    const weird = [{ root: 1, quality: "dim" }, { root: 6, quality: "aug" }, { root: 11, quality: "sus4" }];
    expect(explainProgression(weird, { key: 0 }).name).toBeNull();
  });
});
