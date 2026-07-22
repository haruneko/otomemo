// ベースの相対パターン昇格（修理#2・2026-07-22・design「ベースの相対パターン昇格（修理#2）」・
// 正典＝docs/research/2026-07-22-performance-editing-architecture-audit.md H2）。契約：
//  (a) relative 未指定/false＝全経路で従来（絶対 notes）と bit 一致（鉄則）
//  (b) relative:true＋style 型経路＝実音化せず相対 content（mode:relative・BassCell→BassStep 直写像）を出力
//  (c) 等価性の web 側（resolveRelativeBass）は apps/web/test/music.test.ts が担保。ここでは (b) の content が
//      その等価テストの入力リテラルと一致することを固定＝両テストで同一リテラル＝チェーンで等価証明。
//  (d) escape hatch＝skeleton 明示ベース／6-8／style 未指定は絶対のままフォールバック（relativeFallback 理由）
//  (e) fill も相対化（末尾1つ手前小節を fill 型セルへ）／feel は相対 content にも添付。
import { describe, it, expect } from "vitest";
import { genBass, type Frame } from "../src/music/generate";
import { BASS_TYPES } from "../src/music/bassLibrary";

const J = (x: unknown) => JSON.stringify(x);
const C1 = [{ root: 0, quality: "", start: 0, dur: 64 }]; // C 敷き詰め
const SEEDS = [1, 2, 3, 42];
const item0 = (r: ReturnType<typeof genBass>) => r.items[0]!;
const content = (r: ReturnType<typeof genBass>) => item0(r).content as Record<string, unknown>;
type Step = { step: number; degree: string; dur: number; next?: boolean };
const mkDrums = (kick: number[], snare: number[], steps = 16, beatsPerStep = 0.25) => ({
  rhythm: { steps, bars: 1, beatsPerStep, lanes: [{ name: "Kick", midi: 36, hits: kick, vel: 115 }, { name: "Snare", midi: 38, hits: snare, vel: 105 }] },
});

describe("(a) relative 未指定/false＝従来（絶対 notes）と bit 一致（鉄則）", () => {
  const frames: Frame[] = [
    { bars: 2, meter: "4/4" }, { bars: 4, meter: "4/4", mood: "切ない" },
    { bars: 4, meter: "4/4", tempo: 140 }, { bars: 4, meter: "6/8" },
  ];
  it("style 経路：relative:false / undefined は relative キー無しの絶対出力と完全一致", () => {
    for (const f of frames) for (const seed of SEEDS) {
      const base = J(genBass(f, C1, seed, undefined, { style: "RK-8ROOT" }));
      expect(J(genBass(f, C1, seed, undefined, { style: "RK-8ROOT", relative: false })), `false ${f.meter}#${seed}`).toBe(base);
    }
  });
  it("fig/kick 経路：relative:false は従来と一致（style 未指定＝絶対のまま）", () => {
    const d = mkDrums([0, 4, 8, 12], [4, 12]);
    for (const f of frames) for (const seed of SEEDS) {
      expect(J(genBass(f, C1, seed, undefined, { relative: false })), `fig ${f.meter}#${seed}`).toBe(J(genBass(f, C1, seed)));
      expect(J(genBass(f, C1, seed, d, { kickLock: 0.8, relative: false })), `kick ${f.meter}#${seed}`)
        .toBe(J(genBass(f, C1, seed, d, { kickLock: 0.8 })));
    }
  });
});

describe("(b) relative:true＋style＝相対 content（BassCell→BassStep 直写像）", () => {
  it("RK-8ROOT（1小節）＝R 8個・step 0,2,..14・dur1・全て degree R", () => {
    const c = content(genBass({ bars: 1, meter: "4/4" }, C1, 1, undefined, { style: "RK-8ROOT", relative: true }));
    expect(c.mode).toBe("relative");
    expect(c.steps).toBe(16);
    // ★ このリテラルは apps/web/test/music.test.ts の等価テスト入力と同一（両テストで固定＝等価チェーン）。
    expect(c.pattern).toEqual([
      { step: 0, degree: "R", dur: 1 }, { step: 2, degree: "R", dur: 1 }, { step: 4, degree: "R", dur: 1 }, { step: 6, degree: "R", dur: 1 },
      { step: 8, degree: "R", dur: 1 }, { step: 10, degree: "R", dur: 1 }, { step: 12, degree: "R", dur: 1 }, { step: 14, degree: "R", dur: 1 },
    ]);
    expect(item0(genBass({ bars: 1, meter: "4/4" }, C1, 1, undefined, { style: "RK-8ROOT", relative: true })).kind).toBe("bass");
  });
  it("CP-OCT8（1小節）＝R↔8 交互（step0=R,step2=8,...）", () => {
    const c = content(genBass({ bars: 1, meter: "4/4" }, C1, 7, undefined, { style: "CP-OCT8", relative: true }));
    expect(c.pattern).toEqual([
      { step: 0, degree: "R", dur: 1 }, { step: 2, degree: "8", dur: 1 }, { step: 4, degree: "R", dur: 1 }, { step: 6, degree: "8", dur: 1 },
      { step: 8, degree: "R", dur: 1 }, { step: 10, degree: "8", dur: 1 }, { step: 12, degree: "R", dur: 1 }, { step: 14, degree: "8", dur: 1 },
    ]);
  });
  it("CP-CHROMA＝クロマチック度数（b7/6/b6）＋末尾 next（R>）が BassStep に保存される", () => {
    const c = content(genBass({ bars: 1, meter: "4/4" }, C1, 3, undefined, { style: "CP-CHROMA", relative: true }));
    const p = c.pattern as Step[];
    expect(p.map((s) => s.degree)).toEqual(["R", "8", "R", "8", "b7", "6", "b6", "5", "R"]);
    expect(p[p.length - 1]).toEqual({ step: 15, degree: "R", dur: 1, next: true }); // R> = next
  });
  it("BL-OCTLIFT＝tie が dur に畳まれる（R が dur8 の白玉・末尾 R> = next）", () => {
    const c = content(genBass({ bars: 1, meter: "4/4" }, C1, 5, undefined, { style: "BL-OCTLIFT", relative: true }));
    expect(c.pattern).toEqual([
      { step: 0, degree: "R", dur: 8 }, { step: 8, degree: "R", dur: 3 }, { step: 11, degree: "8", dur: 3 },
      { step: 14, degree: "5", dur: 1 }, { step: 15, degree: "R", dur: 1, next: true },
    ]);
  });
  it("複数小節＝各小節に型を敷く（steps=bars*16・全型で pattern 非空・relativeFallback 無し）", () => {
    for (const t of BASS_TYPES) {
      const r = genBass({ bars: 2, meter: "4/4" }, C1, 4, undefined, { style: t.id, relative: true });
      const c = content(r);
      expect(c.mode, t.id).toBe("relative");
      expect(c.steps, t.id).toBe(32);
      expect((c.pattern as Step[]).length, t.id).toBeGreaterThan(0);
      expect((r as { relativeFallback?: string }).relativeFallback, t.id).toBeUndefined();
      // 全 step が正しい小節範囲・degree/dur 正当。
      for (const s of c.pattern as Step[]) { expect(s.step).toBeGreaterThanOrEqual(0); expect(s.step).toBeLessThan(32); expect(s.dur).toBeGreaterThanOrEqual(1); }
    }
  });
});

describe("(f) 相対 content に patternId: styleType.id を刻む（修理#3・S1・design 決定②）", () => {
  it("relative:true の相対 content に patternId＝style 型 id が載る", () => {
    const c = content(genBass({ bars: 1, meter: "4/4" }, C1, 1, undefined, { style: "RK-8ROOT", relative: true }));
    expect(c.mode).toBe("relative");
    expect(c.patternId).toBe("RK-8ROOT");
  });
  it("全 style 型で patternId＝指定 id と一致（複数小節でも base 型 id）", () => {
    for (const t of BASS_TYPES) {
      const c = content(genBass({ bars: 2, meter: "4/4" }, C1, 4, undefined, { style: t.id, relative: true }));
      expect(c.patternId, t.id).toBe(t.id);
    }
  });
  it("fill 併用でも patternId＝base 型 id を維持（ドラム applyDrumFill と同流儀）", () => {
    const c = content(genBass({ bars: 4, meter: "4/4" }, C1, 5, undefined, { style: "RK-8ROOT", fill: "FL-WALKUP", relative: true }));
    expect(c.patternId).toBe("RK-8ROOT"); // fill 型 id ではなく base 型 id
    expect(c.mode).toBe("relative");
  });
  it("feel 併用でも patternId が載る（feel と共存）", () => {
    const c = content(genBass({ bars: 2, meter: "4/4" }, C1, 1, undefined, { style: "RK-8ROOT", relative: true, swing: 0.5 }));
    expect(c.patternId).toBe("RK-8ROOT");
    expect(c.feel).toBeTruthy();
  });
  it("relative 未指定＝絶対経路には patternId が生えない（フォールバックも含め bit 一致・鉄則）", () => {
    // style 経路・絶対（relative 未指定）＝patternId 無し
    expect(content(genBass({ bars: 1, meter: "4/4" }, C1, 1, undefined, { style: "RK-8ROOT" })).patternId).toBeUndefined();
    // フォールバック（no-style-pattern）＝patternId 無し
    expect(content(genBass({ bars: 2, meter: "4/4" }, C1, 1, undefined, { relative: true })).patternId).toBeUndefined();
    // compound-meter フォールバック＝patternId 無し
    expect(content(genBass({ bars: 4, meter: "6/8" }, C1, 2, undefined, { style: "RK-8ROOT", relative: true })).patternId).toBeUndefined();
  });
});

describe("(d) escape hatch＝絶対のままフォールバック＋理由添付", () => {
  it("style 未指定（fig/kick 経路）＝絶対 notes＋relativeFallback:no-style-pattern", () => {
    const r = genBass({ bars: 2, meter: "4/4" }, C1, 1, undefined, { relative: true });
    expect((content(r).notes as unknown[]).length).toBeGreaterThan(0); // 絶対 notes のまま
    expect(content(r).mode).toBeUndefined();
    expect((r as { relativeFallback?: string }).relativeFallback).toBe("no-style-pattern");
    // かつ従来の絶対出力（relative 無し）と items[0].content は一致。
    expect(J(content(r).notes)).toBe(J((content(genBass({ bars: 2, meter: "4/4" }, C1, 1)).notes)));
  });
  it("6/8＝絶対のまま＋relativeFallback:compound-meter", () => {
    const r = genBass({ bars: 4, meter: "6/8" }, C1, 2, undefined, { style: "RK-8ROOT", relative: true });
    expect(content(r).mode).toBeUndefined();
    expect((r as { relativeFallback?: string }).relativeFallback).toBe("compound-meter");
  });
  it("skeleton 明示ベース＝絶対のまま維持（escape hatch）＋relativeFallback:skeleton-explicit-bass", () => {
    const skeleton = { bars: 2, tones: [{ start: 0, pitch: 60 }], bass: [{ start: 0, pitch: 40 }] } as never;
    const r = genBass({ bars: 2, meter: "4/4" }, C1, 1, undefined, { style: "RK-8ROOT", relative: true, skeleton });
    expect(content(r).mode).toBeUndefined();
    expect((content(r).notes as unknown[]).length).toBeGreaterThan(0);
    expect((r as { relativeFallback?: string }).relativeFallback).toBe("skeleton-explicit-bass");
  });
});

describe("(e) fill 相対化＋feel 添付", () => {
  it("style+fill＝末尾1つ手前の小節が fill 型セルへ差替え（他小節は型のまま）", () => {
    const c = content(genBass({ bars: 4, meter: "4/4" }, C1, 5, undefined, { style: "RK-8ROOT", fill: "FL-WALKUP", relative: true }));
    const p = c.pattern as Step[];
    // fillBar = bars-2 = 2 → step 32..47。FL-WALKUP="R . . . | . . . . | 5 . 6 . | b7 . #7 R>"→ step32=R,40=5,42=6,44=b7,46=#7,47=R>
    const inFill = p.filter((s) => s.step >= 32 && s.step < 48);
    expect(inFill.map((s) => `${s.step}:${s.degree}${s.next ? ">" : ""}`)).toEqual(["32:R", "40:5", "42:6", "44:b7", "46:#7", "47:R>"]);
    // bar0（step0..15）は RK-8ROOT のまま（R 連打）。
    expect(p.filter((s) => s.step < 16).every((s) => s.degree === "R")).toBe(true);
  });
  it("relative+swing＝feel が相対 content にも載る", () => {
    const c = content(genBass({ bars: 2, meter: "4/4" }, C1, 1, undefined, { style: "RK-8ROOT", relative: true, swing: 0.5 }));
    expect(c.mode).toBe("relative");
    expect(c.feel).toBeTruthy();
    // swing/humanize 未指定なら feel キー無し。
    expect(content(genBass({ bars: 2, meter: "4/4" }, C1, 1, undefined, { style: "RK-8ROOT", relative: true })).feel).toBeUndefined();
  });
});
