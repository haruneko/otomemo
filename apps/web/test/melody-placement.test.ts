import { describe, it, expect } from "vitest";
import { melodyPlacementShift, compositeNotes } from "../src/music";

// メロ配置の調規則（design「メロ配置の調規則」）。content は C基準なので戻り値＝着地主音pc＝移調半音。
// 不変条件：同旋法は tonic→tonic で一意／短調メロは相対短調・長調メロは長調主音へ／ラベル不変／
// mode 不明は major 既定＝現挙動(pitch+keyPc)と一致（後退ゼロ）。

describe("melodyPlacementShift", () => {
  it("同旋法（長/長・短/短）は tonic→tonic", () => {
    expect(melodyPlacementShift(0, "major", "major")).toBe(0); // C長メロ→C長
    expect(melodyPlacementShift(7, "major", "major")).toBe(7); // →G長
    expect(melodyPlacementShift(9, "minor", "minor")).toBe(9); // Am section, 短メロ→A短(tonic→tonic)
    expect(melodyPlacementShift(2, "minor", "minor")).toBe(2); // Dm→D短
  });

  it("短調メロ→セクション調号の相対短調へ着地", () => {
    expect(melodyPlacementShift(0, "major", "minor")).toBe(9); // Cメジャー section → A短
    expect(melodyPlacementShift(7, "major", "minor")).toBe(4); // Gメジャー section → E短
  });

  it("長調メロ→セクション調号の長調主音へ着地", () => {
    expect(melodyPlacementShift(9, "minor", "major")).toBe(0); // Am section → C長
    expect(melodyPlacementShift(4, "minor", "major")).toBe(7); // Em section → G長
  });

  it("ラベル不変：C major と A minor は同じ着地", () => {
    // 短調メロ：C major(key0) でも Am(key9,minor) でも A短(9)
    expect(melodyPlacementShift(0, "major", "minor")).toBe(melodyPlacementShift(9, "minor", "minor"));
    // 長調メロ：両方とも C長(0)
    expect(melodyPlacementShift(0, "major", "major")).toBe(melodyPlacementShift(9, "minor", "major"));
  });

  it("mode 不明は major 既定＝現挙動(=keyPc)と一致（後退ゼロ）", () => {
    expect(melodyPlacementShift(5, null, null)).toBe(5);
    expect(melodyPlacementShift(3, undefined, undefined)).toBe(3);
    expect(melodyPlacementShift(8, "major", null)).toBe(8);
  });

  it("入力 key は 0..11 へ正規化（負/12超も安全）", () => {
    expect(melodyPlacementShift(12, "major", "major")).toBe(0);
    expect(melodyPlacementShift(-1, "major", "major")).toBe(11);
  });
});

describe("compositeNotes：メロ配置の調規則（end-to-end）", () => {
  const melodyChild = (mode: string | null) => ({
    position: 0,
    node: { neta: { kind: "melody", mode, content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } } },
  });

  it("短調メロを C メジャー section に置くと +9（A短へ）＝衝突回避", () => {
    // section: C major(key0,mode major)。content C基準60。+9=69(A)。従来の +0 は C短で C長和音と衝突していた。
    const notes = compositeNotes([melodyChild("minor")], 0, "major");
    expect(notes[0]!.pitch).toBe(69);
  });

  it("長調メロは従来どおり keyPc 移調（後退ゼロ）", () => {
    const notes = compositeNotes([melodyChild("major")], 7, "major"); // G major へ
    expect(notes[0]!.pitch).toBe(67); // 60+7
  });

  it("mode 不明メロ＋mode 不明 section は従来の keyPc と一致（後退ゼロ）", () => {
    const notes = compositeNotes([melodyChild(null)], 5);
    expect(notes[0]!.pitch).toBe(65); // 60+5
  });

  it("短調メロを Am section に置くと A短（ラベル不変・同旋法 tonic→tonic）", () => {
    const notes = compositeNotes([melodyChild("minor")], 9, "minor"); // Am(key9,minor)
    expect(notes[0]!.pitch).toBe(69); // C major 表記と同じ A(69)
  });
});
