import { describe, it, expect } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";

describe("core.similarMelodies（S4c・メロ連想retrieval）", () => {
  it("library の近いメロを多層類似で上位に返す（project は混ぜない）", () => {
    const c = new Core(openDb(":memory:"));
    // library に2曲：似てる(同輪郭/リズム)・遠い(逆輪郭)
    c.createNeta({
      kind: "melody", title: "近い", scope: "library",
      content: { notes: [{ pitch: 60, start: 0, dur: 0.5 }, { pitch: 64, start: 0.5, dur: 0.5 }, { pitch: 67, start: 1, dur: 0.5 }] },
    });
    c.createNeta({
      kind: "melody", title: "遠い", scope: "library",
      content: { notes: [{ pitch: 72, start: 0, dur: 2 }, { pitch: 65, start: 2, dur: 2 }, { pitch: 60, start: 4, dur: 2 }] },
    });
    // project にも1曲（連想元に混ぜない＝既定 library）
    c.createNeta({ kind: "melody", title: "作業中", scope: "project", content: { notes: [{ pitch: 60, start: 0, dur: 0.5 }, { pitch: 64, start: 0.5, dur: 0.5 }, { pitch: 67, start: 1, dur: 0.5 }] } });

    const target = [{ pitch: 62, start: 0, dur: 0.5 }, { pitch: 66, start: 0.5, dur: 0.5 }, { pitch: 69, start: 1, dur: 0.5 }]; // 「近い」を+2移調
    const res = c.similarMelodies(target, "library", 5);
    expect(res.length).toBe(2); // library の2曲のみ（project は除外）
    expect(res[0]!.label).toBe("近い"); // 移調不変＋同リズム/輪郭で最上位
    expect(res[0]!.similarity).toBeGreaterThan(res[1]!.similarity);
  });
});
