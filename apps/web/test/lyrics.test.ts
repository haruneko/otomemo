import { describe, it, expect } from "vitest";
import { splitMora, moraLines } from "../src/lyrics";

describe("lyrics mora", () => {
  it("splits moras (small kana combine; ー/っ/ん are 1 each)", () => {
    expect(splitMora("はしる")).toEqual(["は", "し", "る"]);
    expect(splitMora("きゃー")).toEqual(["きゃ", "ー"]);
    expect(splitMora("がっこう")).toEqual(["が", "っ", "こ", "う"]);
  });

  it("counts moras per line", () => {
    expect(moraLines("よる\nかける")).toEqual([
      { line: "よる", count: 2 },
      { line: "かける", count: 3 },
    ]);
  });
});
