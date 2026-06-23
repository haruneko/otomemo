import { describe, it, expect } from "vitest";
import { meterInfo, beatStrengthAt } from "../src/music/meter";

describe("meter.ts 拍子→拍構造（契約・design #12-M）", () => {
  it("4/4：4拍・simple・強拍[0,2]・中位アクセントは3拍目", () => {
    const m = meterInfo("4/4");
    expect(m.beatsPerBar).toBe(4);
    expect(m.grouping).toBe("simple");
    expect(m.slots.map((s) => s.strength)).toEqual([1.0, 0.25, 0.5, 0.25]);
    expect(m.strongPositions).toEqual([0, 2]);
  });

  it("6/8：複合2拍子・beatsPerBar=3・強拍[0,1.5]・beatStrength=[1,.25,.25,.5,.25,.25]", () => {
    const m = meterInfo("6/8");
    expect(m.beatsPerBar).toBe(3);
    expect(m.grouping).toBe("compound");
    expect(m.slots.map((s) => s.pos)).toEqual([0, 0.5, 1.0, 1.5, 2.0, 2.5]);
    expect(m.slots.map((s) => s.strength)).toEqual([1.0, 0.25, 0.25, 0.5, 0.25, 0.25]);
    expect(m.strongPositions).toEqual([0, 1.5]);
  });

  it("3/4：3拍・simple・強拍は頭のみ[0]", () => {
    const m = meterInfo("3/4");
    expect(m.beatsPerBar).toBe(3);
    expect(m.grouping).toBe("simple");
    expect(m.strongPositions).toEqual([0]);
  });

  it("未知/不正は 4/4 既定", () => {
    expect(meterInfo(undefined).meter).toBe("4/4");
    expect(meterInfo("foo").beatsPerBar).toBe(4);
  });

  it("beatStrengthAt：グリッド位置は重み・外は最小", () => {
    const m = meterInfo("6/8");
    expect(beatStrengthAt(m, 0)).toBe(1.0);
    expect(beatStrengthAt(m, 1.5)).toBe(0.5);
    expect(beatStrengthAt(m, 0.25)).toBe(0.1); // グリッド外
  });
});
