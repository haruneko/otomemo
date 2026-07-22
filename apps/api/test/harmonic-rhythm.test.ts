import { describe, it, expect } from "vitest";
import { applyHarmonicRhythm, type HRChord, type HRCtx } from "../src/music/harmonicRhythm";
import { genChords } from "../src/music/generate";

// ⑨和声リズム制御（design #30・後処理スプリット/マージ）。固定挙動は #30 の受け入れ節に一致。
const ctx = (over: Partial<HRCtx> = {}): HRCtx => ({ key: 0, mode: "major", bpb: 4, bars: 4, colorful: false, ...over });
const sumDur = (cs: { dur: number }[]) => Math.round(cs.reduce((a, c) => a + c.dur, 0) * 1000) / 1000;

describe("applyHarmonicRhythm（純関数・#30）", () => {
  // Cメジャー・4/4・4小節の素の進行 [I, VIm, V, I]（penult=素の V＝deg7・bass 無し）
  const plainCadence: HRChord[] = [
    { root: 0, quality: "", start: 0, dur: 4 },   // I
    { root: 9, quality: "m", start: 4, dur: 4 },  // VIm
    { root: 7, quality: "", start: 8, dur: 4 },   // V (penult＝素の V)
    { root: 0, quality: "", start: 12, dur: 4 },  // I (last)
  ];

  it("空 spec は identity（参照返し・warnings 無し）", () => {
    const r = applyHarmonicRhythm(plainCadence, {}, ctx());
    expect(r.chords).toBe(plainCadence); // 同一参照
    expect(r.warnings).toEqual([]);
    const r2 = applyHarmonicRhythm(plainCadence, { pattern: [] }, ctx());
    expect(r2.chords).toBe(plainCadence);
  });

  it("cadenceAccel① 素の V を [IV, V] 半小節 SPLIT（second が V の色を継承）", () => {
    const r = applyHarmonicRhythm(plainCadence, { preset: "cadenceAccel" }, ctx());
    // [I, VIm, IV(2), V(2), I]
    expect(r.chords.length).toBe(5);
    const first = r.chords[2]!, second = r.chords[3]!, last = r.chords[4]!;
    expect(first.root).toBe(5);         // IV
    expect(first.quality).toBe("");
    expect(first.dur).toBe(2);          // 半小節
    expect(second.root).toBe(7);        // 元 V（deg7 保持）
    expect(second.start).toBe(8 + 2);   // penultStart + bpb/2
    expect(second.dur).toBe(2);
    expect(last.root).toBe(0);          // 終止 I は不変
    expect(sumDur(r.chords)).toBe(16);
    expect(r.warnings).toEqual([]);
  });

  it("cadenceAccel① colorful は first=IIm7", () => {
    const r = applyHarmonicRhythm(plainCadence, { preset: "cadenceAccel" }, ctx({ colorful: true }));
    expect(r.chords[2]!.root).toBe(2);      // IIm7
    expect(r.chords[2]!.quality).toBe("m7");
    expect(r.chords[3]!.root).toBe(7);      // second=元 V
  });

  it("cadenceAccel③ penult≠素の V（plagal=IV）は不分割で入力と一致", () => {
    // [I, IIm, IV, I]（penult=IV＝deg5・変終止）
    const plagal: HRChord[] = [
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 2, quality: "m", start: 4, dur: 4 },
      { root: 5, quality: "", start: 8, dur: 4 },  // IV penult
      { root: 0, quality: "", start: 12, dur: 4 },
    ];
    const r = applyHarmonicRhythm(plagal, { preset: "cadenceAccel" }, ctx());
    expect(JSON.stringify(r.chords)).toBe(JSON.stringify(plagal));
    expect(r.warnings).toEqual([]);
  });

  it("cadenceAccel② penult が分数ドミナント(IV/V)は skip＋warn（citypop voicing 保全）", () => {
    // penult = F/G = {root:5, bass:7}（citypop 分数化済み）
    const frac: HRChord[] = [
      { root: 0, quality: "maj9", start: 0, dur: 4 },
      { root: 9, quality: "m9", start: 4, dur: 4 },
      { root: 5, quality: "", start: 8, dur: 4, bass: 7 }, // IV/V
      { root: 0, quality: "maj9", start: 12, dur: 4 },
    ];
    const r = applyHarmonicRhythm(frac, { preset: "cadenceAccel" }, ctx());
    expect(r.chords.length).toBe(4);            // 不分割
    expect(r.chords[2]!.bass).toBe(7);          // 分数のまま
    expect(r.warnings.some((w) => /分数ドミナント/.test(w))).toBe(true);
    expect(sumDur(r.chords)).toBe(16);
  });

  it("cadenceAccel③ 最終が非トニック（transition 相当）は不発火", () => {
    // last = 非トニック準備和音（deg≠0）
    const nonTonicEnd: HRChord[] = [
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 9, quality: "m", start: 4, dur: 4 },
      { root: 7, quality: "", start: 8, dur: 4 },   // 素の V だが…
      { root: 2, quality: "7", start: 12, dur: 4 }, // last=D7(非トニック)
    ];
    const r = applyHarmonicRhythm(nonTonicEnd, { preset: "cadenceAccel" }, ctx());
    expect(JSON.stringify(r.chords)).toBe(JSON.stringify(nonTonicEnd)); // 不発火
  });

  it("drive 適格 0..bars-3 を SPLIT・penult/last 保護・collapse 後 Σdur/格子", () => {
    const prog: HRChord[] = [
      { root: 0, quality: "", start: 0, dur: 4 },   // I
      { root: 5, quality: "", start: 4, dur: 4 },   // IV
      { root: 7, quality: "", start: 8, dur: 4 },   // V (penult=保護)
      { root: 0, quality: "", start: 12, dur: 4 },  // I (last=保護)
    ];
    const r = applyHarmonicRhythm(prog, { preset: "drive" }, ctx());
    expect(sumDur(r.chords)).toBe(16);
    // 全 start/dur が半小節(2)or整数拍の倍数
    for (const c of r.chords) { expect(c.start % 2).toBe(0); expect(c.dur % 2).toBe(0); }
    // 連続で単調増・隙間なし
    for (let i = 1; i < r.chords.length; i++) expect(r.chords[i]!.start).toBe(r.chords[i - 1]!.start + r.chords[i - 1]!.dur);
    // penult/last は SPLIT 起点にならない＝最後の2和音は V→I の順（root 7 の後に root 0 の last）
    expect(r.chords[r.chords.length - 1]!.root).toBe(0);
  });

  it("sustain bars=4 は (0,1) のみ MERGE（dur=2*bpb）・カデンツ対保護", () => {
    const prog: HRChord[] = [
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 9, quality: "m", start: 4, dur: 4 },
      { root: 7, quality: "", start: 8, dur: 4 },
      { root: 0, quality: "", start: 12, dur: 4 },
    ];
    const r = applyHarmonicRhythm(prog, { preset: "sustain" }, ctx({ bars: 4 }));
    // [I(8), V(4), I(4)]（(2,3)=penult/last は skip）
    expect(r.chords.length).toBe(3);
    expect(r.chords[0]!.dur).toBe(8);
    expect(r.chords[0]!.root).toBe(0);
    expect(sumDur(r.chords)).toBe(16);
  });

  it("sustain bars<=3 は no-op（identity）", () => {
    const prog3: HRChord[] = [
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 7, quality: "", start: 4, dur: 4 },
      { root: 0, quality: "", start: 8, dur: 4 },
    ];
    const r = applyHarmonicRhythm(prog3, { preset: "sustain" }, ctx({ bars: 3 }));
    expect(JSON.stringify(r.chords)).toBe(JSON.stringify(prog3));
    expect(sumDur(r.chords)).toBe(12);
  });

  it("sustain bars=5 は (0,1) MERGE・(2,3)=penult skip", () => {
    const prog5: HRChord[] = [
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 9, quality: "m", start: 4, dur: 4 },
      { root: 5, quality: "", start: 8, dur: 4 },
      { root: 7, quality: "", start: 12, dur: 4 }, // penult
      { root: 0, quality: "", start: 16, dur: 4 }, // last
    ];
    const r = applyHarmonicRhythm(prog5, { preset: "sustain" }, ctx({ bars: 5 }));
    expect(r.chords[0]!.dur).toBe(8);   // (0,1) MERGE
    expect(r.chords.length).toBe(4);    // I(8),IV(4),V(4),I(4)
    expect(sumDur(r.chords)).toBe(20);
  });

  it("collapse 隣接同一（root+quality+bass）を畳む", () => {
    // drive で先取り併合が起きる進行：bar0 の second==bar1 の chord
    const prog: HRChord[] = [
      { root: 0, quality: "", start: 0, dur: 4 },  // I
      { root: 5, quality: "", start: 4, dur: 4 },  // IV（bar0 の先取り先）
      { root: 7, quality: "", start: 8, dur: 4 },  // V (penult)
      { root: 0, quality: "", start: 12, dur: 4 }, // I (last)
    ];
    const r = applyHarmonicRhythm(prog, { preset: "drive" }, ctx());
    // 隣接同一 root が畳まれて重複打鍵が残らない
    for (let i = 1; i < r.chords.length; i++) {
      const a = r.chords[i - 1]!, b = r.chords[i]!;
      expect(a.root === b.root && a.quality === b.quality && a.bass === b.bass).toBe(false);
    }
    expect(sumDur(r.chords)).toBe(16);
  });

  it("pattern 合計≠bpb は無視＋warn（identity）", () => {
    const r = applyHarmonicRhythm(plainCadence, { pattern: [1, 1] }, ctx()); // 合計2≠4
    expect(JSON.stringify(r.chords)).toBe(JSON.stringify(plainCadence));
    expect(r.warnings.some((w) => /不一致/.test(w))).toBe(true);
  });

  it("pattern [2,2]（半小節二分）＝各小節2枠・Σdur/格子維持", () => {
    const r = applyHarmonicRhythm(plainCadence, { pattern: [2, 2] }, ctx());
    expect(sumDur(r.chords)).toBe(16);
    for (const c of r.chords) { expect(c.start % 2).toBe(0); expect(c.dur % 2).toBe(0); }
  });

  it("pattern サブ拍は丸め＋warn（3/4 の 1.5 等）", () => {
    // 3/4 bpb=3・pattern [1.5,1.5]（半小節境界＝1.5＝許容）… サブ拍を混ぜたケースで丸め warn を確認
    const prog34: HRChord[] = [
      { root: 0, quality: "", start: 0, dur: 3 },
      { root: 7, quality: "", start: 3, dur: 3 },
    ];
    const r = applyHarmonicRhythm(prog34, { pattern: [0.7, 1.3, 1] }, ctx({ bpb: 3, bars: 2 }));
    // 0.7→丸め発生＝warn
    expect(r.warnings.some((w) => /サブ拍|丸め/.test(w))).toBe(true);
    expect(sumDur(r.chords)).toBe(6);
  });
});

describe("genChords × harmonicRhythm 配線（#30・bit一致の番人）", () => {
  it("既定＝undefined／{}／{harmonicRhythm:undefined}／{harmonicRhythm:{}}／{pattern:[]} が現行と JSON 完全一致＋meta 不変", () => {
    for (const mood of ["明るい", "切ない"]) {
      for (const bars of [2, 3, 4, 8]) {
        for (const meter of ["4/4", "3/4"]) {
          for (let seed = 1; seed <= 15; seed++) {
            const frame = { key: 0, bars, mood, meter };
            const base = genChords(frame, seed);
            const variants = [
              genChords(frame, seed, undefined, {}),
              genChords(frame, seed, undefined, { harmonicRhythm: undefined }),
              genChords(frame, seed, undefined, { harmonicRhythm: {} }),
              genChords(frame, seed, undefined, { harmonicRhythm: { pattern: [] } }),
            ];
            for (const v of variants) {
              expect(JSON.stringify(v.items[0]!.content), `${mood}/${bars}/${meter}#${seed}`).toBe(JSON.stringify(base.items[0]!.content));
              expect(v.meta).toEqual(base.meta);
            }
          }
        }
      }
    }
  });

  it("cadenceAccel② citypop 併用＝分数V保全・skip warn・素の三和音注入なし", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const frame = { key: 0, bars: 8, mood: "明るい" };
      const cityOnly = genChords(frame, seed, undefined, { genre: "citypop" });
      const cityAccel = genChords(frame, seed, undefined, { genre: "citypop", harmonicRhythm: { preset: "cadenceAccel" } });
      const a = (cityOnly.items[0]!.content as { chords: HRChord[] }).chords;
      const b = (cityAccel.items[0]!.content as { chords: HRChord[] }).chords;
      // Σdur 一致（枠数も citypop 単独と同じ＝不分割）
      expect(sumDur(b)).toBe(sumDur(a));
      // penult に素の三和音（quality=""・bass 無し）を注入していない＝citypop の voicing 保全
      const pen = b[b.length - 2]!;
      const injectedBareTriad = pen.quality === "" && pen.bass === undefined && b.length !== a.length;
      expect(injectedBareTriad).toBe(false);
    }
  });

  it("cadenceAccel③ transition 併用＝不発火（transition 単独と content 一致）", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const frame = { key: 0, bars: 8, mood: "明るい" };
      const tr = { prep: "secondary_dominant" as const, toKey: 7 };
      const trOnly = genChords(frame, seed, undefined, { transition: tr });
      const trAccel = genChords(frame, seed, undefined, { transition: tr, harmonicRhythm: { preset: "cadenceAccel" } });
      expect(JSON.stringify(trAccel.items[0]!.content)).toBe(JSON.stringify(trOnly.items[0]!.content));
    }
  });

  it("cadenceAccel/drive/sustain いずれも Σdur===bars*bpb を保つ（配線経由・不変条件）", () => {
    for (const preset of ["cadenceAccel", "drive", "sustain"] as const) {
      for (const bars of [4, 8]) {
        for (let seed = 1; seed <= 10; seed++) {
          const r = genChords({ key: 0, bars, mood: "明るい" }, seed, undefined, { harmonicRhythm: { preset } });
          const chords = (r.items[0]!.content as { chords: HRChord[] }).chords;
          expect(sumDur(chords), `${preset}/${bars}#${seed}`).toBe(bars * 4);
          // start 単調増・隙間/重複ゼロ
          for (let i = 1; i < chords.length; i++) {
            expect(chords[i]!.start).toBeGreaterThan(chords[i - 1]!.start);
            expect(chords[i]!.start).toBeCloseTo(chords[i - 1]!.start + chords[i - 1]!.dur, 6);
          }
        }
      }
    }
  });
});
