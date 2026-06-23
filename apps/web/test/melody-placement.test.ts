import { describe, it, expect } from "vitest";
import { melodyPlacementShift, compositeNotes } from "../src/music";

// メロ配置の調規則（design「メロ配置の調規則」）。メロ content は実音(WYSIWYG)で主音=melodyKey。
// 移調量 = 着地主音 − メロのkey（最寄りオクターブ -5..6 で音域維持）。短調メロ→section調号の相対短調、
// 長調メロ→長調主音へ。mode/key 未指定は従来の keyPc 相当に縮退（後退ゼロ）。

describe("melodyPlacementShift（key 込み・最寄りオクターブ）", () => {
  it("★F#m メロ(key=6)を Cmaj/Am へ → +3（F#→A）", () => {
    expect(melodyPlacementShift(0, "major", "minor", 6)).toBe(3); // C major section
    expect(melodyPlacementShift(9, "minor", "minor", 6)).toBe(3); // Am section（ラベル不変）
  });

  it("同調メロ（メロ key = section 着地）は 0", () => {
    expect(melodyPlacementShift(0, "major", "major", 0)).toBe(0); // C長メロ→Cmaj
    expect(melodyPlacementShift(9, "minor", "minor", 9)).toBe(0); // A短メロ→Am
    expect(melodyPlacementShift(7, "major", "major", 7)).toBe(0); // G長メロ→Gmaj
  });

  it("長調メロ→section調号の長調主音／短調メロ→相対短調（key=0基準）", () => {
    // 長調メロ key=0 を Am(key9,minor)へ：着地=C(0)、shift=0
    expect(melodyPlacementShift(9, "minor", "major", 0)).toBe(0);
    // 短調メロ key=0 を Gmaj へ：着地=Em(4)、shift = 最寄り(4)
    expect(melodyPlacementShift(7, "major", "minor", 0)).toBe(4);
  });

  it("最寄りオクターブ：-5..6 に収まる（上下どちらか近い方）", () => {
    for (let sk = 0; sk < 12; sk++)
      for (const sm of ["major", "minor"])
        for (const mm of ["major", "minor"])
          for (let mk = 0; mk < 12; mk++) {
            const s = melodyPlacementShift(sk, sm, mm, mk);
            expect(s).toBeGreaterThanOrEqual(-5);
            expect(s).toBeLessThanOrEqual(6);
          }
  });

  it("mode/key 未指定は keyPc 相当に縮退（同調・後退ゼロ）", () => {
    expect(melodyPlacementShift(0, null, null)).toBe(0);
    expect(melodyPlacementShift(5, "major", "major", 5)).toBe(0);
  });
});

describe("compositeNotes：F#m 手描きメロ→Cmaj section（実音 end-to-end）", () => {
  const fsharpMelody = (mode: string, key: number) => ({
    position: 0,
    node: { neta: { kind: "melody", mode, key, content: { notes: [{ pitch: 66, start: 0, dur: 1 }] } } },
  });

  it("★F#(66) が A(69) になる（E♭=75 ではない）", () => {
    const notes = compositeNotes([fsharpMelody("minor", 6)], 0, "major"); // Cmaj section
    expect(notes[0]!.pitch).toBe(69); // A4
  });

  it("Am section でも A(69)（ラベル不変）", () => {
    const notes = compositeNotes([fsharpMelody("minor", 6)], 9, "minor");
    expect(notes[0]!.pitch).toBe(69);
  });

  it("F#m メロを F#m section に置けば動かない（同調）", () => {
    const notes = compositeNotes([fsharpMelody("minor", 6)], 6, "minor");
    expect(notes[0]!.pitch).toBe(66); // F# のまま
  });
});
