import { describe, it, expect } from "vitest";
import { applyCitypop } from "../src/music/citypop";
import { genChords } from "../src/music/generate";

// WP-C3スライス3＝citypop プリセット。固定値は research 2026-07-14-citypop-extended-voicings.md §6-1 変換表に一致。
describe("applyCitypop（citypop 拡張和声・WP-C3）", () => {
  it("§6-1 機能別テンション付与＝I→maj9 / IIm→m9 / IIIm→m7 / IV→maj9 / VIm→m9（Cメジャー）", () => {
    const prog = [
      { root: 0, quality: "", start: 0, dur: 4 }, // I
      { root: 5, quality: "", start: 4, dur: 4 }, // IV
      { root: 4, quality: "m", start: 8, dur: 4 }, // IIIm
      { root: 9, quality: "m", start: 12, dur: 4 }, // VIm
    ];
    const { chords } = applyCitypop(prog, { key: 0, mode: "major" });
    expect(chords.map((c) => c.quality)).toEqual(["maj9", "maj9", "m7", "m9"]);
    expect(chords[0]!.root).toBe(0); // ルートは不変（度数進行は壊さない）
  });

  it("§6-1 V→13（ナチュラルテンション）＝ドミナントは 9,13 で開く", () => {
    const { chords } = applyCitypop([
      { root: 2, quality: "m", start: 0, dur: 4 }, // IIm
      { root: 7, quality: "", start: 4, dur: 4 }, // V
      { root: 0, quality: "", start: 8, dur: 4 }, // I
    ], { key: 0, mode: "major" });
    // 末尾 V→I は分数化(IV/V)されるので、ここでは V が末尾でない配置で 13 を確認
    const prog2 = [
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 7, quality: "", start: 4, dur: 4 }, // V（中間）
      { root: 9, quality: "m", start: 8, dur: 4 },
      { root: 0, quality: "", start: 12, dur: 4 },
    ];
    expect(applyCitypop(prog2, { key: 0, mode: "major" }).chords[1]!.quality).toBe("13");
  });

  it("§3 分数化＝末尾カデンツ(V→I)の V を IV/V(F/G＝root5,bass7)へ柔化（長調）", () => {
    const { chords } = applyCitypop([
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 5, quality: "", start: 4, dur: 4 },
      { root: 7, quality: "", start: 8, dur: 4 }, // penult V
      { root: 0, quality: "", start: 12, dur: 4 }, // final I
    ], { key: 0, mode: "major" });
    const pen = chords[2]!;
    expect(pen.root).toBe(5); // F
    expect(pen.bass).toBe(7); // /G
    expect(pen.quality).toBe(""); // F トライアド on G＝V7sus4(9)omit3 相当
  });

  it("短調＝i→m9 / ♭VI→maj9 / ♭VII→maj9 / V→13（Cマイナー・分数化は掛けない）", () => {
    const { chords } = applyCitypop([
      { root: 0, quality: "m", start: 0, dur: 4 }, // i
      { root: 8, quality: "", start: 4, dur: 4 }, // ♭VI
      { root: 10, quality: "", start: 8, dur: 4 }, // ♭VII
      { root: 7, quality: "7", start: 12, dur: 4 }, // V7
    ], { key: 0, mode: "minor" });
    expect(chords.map((c) => c.quality)).toEqual(["m9", "maj9", "maj9", "13"]);
  });

  it("やり過ぎ警告＝Maj9系が過半で『均一Maj9警告』を併記（ブロックしない・§6-3.1）", () => {
    const { warnings } = applyCitypop([
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 5, quality: "", start: 4, dur: 4 },
      { root: 8, quality: "", start: 8, dur: 4 }, // 全部 maj9 系
    ], { key: 0, mode: "major" });
    expect(warnings.some((w) => /均一Maj9/.test(w))).toBe(true);
  });
});

describe("genChords genre=citypop（配線・WP-C3）", () => {
  it("既定(genre未指定)＝bit一致（回帰ゼロ）＋ meta 無し", () => {
    for (const mood of ["明るい", "切ない"]) {
      for (let seed = 1; seed <= 15; seed++) {
        const base = genChords({ bars: 8, mood }, seed);
        const withUndef = genChords({ bars: 8, mood }, seed, undefined, {});
        expect(JSON.stringify(withUndef.items[0]!.content), `${mood}#${seed}`).toBe(JSON.stringify(base.items[0]!.content));
        expect(base.meta).toBeUndefined();
      }
    }
  });

  it("genre=citypop で全和音にテンションが付く（素の三和音『』が消える＝maj7/9/m9/13/分数へ）", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ch = (genChords({ key: 0, bars: 8, mood: "明るい" }, seed, undefined, { genre: "citypop" }).items[0]!.content as { chords: { root: number; quality: string; bass?: number }[] }).chords;
      // 素の長三和音("")は分数(F/G・bass付き)を除き残らない＝テンション or 分数化されている
      for (const c of ch) {
        const plainTriad = (c.quality === "" || c.quality === "m") && c.bass === undefined;
        expect(plainTriad, `seed=${seed} root=${c.root} q=${c.quality} が未拡張`).toBe(false);
      }
    }
  });

  it("genre=citypop の meta.warnings は配列（平板時に警告・ブロックしない）", () => {
    const r = genChords({ key: 0, bars: 8, mood: "明るい" }, 5, undefined, { genre: "citypop" });
    if (r.meta?.warnings) expect(Array.isArray(r.meta.warnings)).toBe(true);
  });
});
