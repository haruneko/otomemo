import { describe, it, expect } from "vitest";
import { genMotifMelodyV2, loadMotifModel16, scalePitchList } from "../src/music/melodyCells";
import { RHYTHM_PART_PRESETS, RHYTHM_PART_LIST, partPatternOnsets } from "../src/music/rhythmParts";
import { genMelody } from "../src/music/generate";
import { scalePcs, chordPcs } from "../src/music/theory";
import type { SkeletonContent } from "../src/music/skeletonNeta";

// リズムパーツ層 L1（design #20 S4-1・Task#7）：セクション割当ローテ。パーツ＝1小節の16分オンセットパターンを
// 出力小節に rotate で敷く。音価はパターンの疎密が決める（疎=白玉/長音）。骨格はそのまま表面リズムだけ差し替え。
const motif16 = loadMotifModel16();
const ROOTS = [0, 9, 5, 7, 0, 9, 5, 7];
const QUALS = ["maj7", "min7", "maj7", "7", "maj7", "min7", "maj7", "7"];
const sp = scalePitchList(scalePcs(0, "major"), 55, 84);
const pcsPerBar = ROOTS.map((r, i) => chordPcs(r, QUALS[i]!));
const scaleSet = new Set(sp.map((p) => ((p % 12) + 12) % 12));

const gen = (bars: number, seed: number, extra: Record<string, unknown> = {}, beatsPerBar = 4) =>
  genMotifMelodyV2(pcsPerBar.slice(0, bars), ROOTS.slice(0, bars), QUALS.slice(0, bars), sp, motif16, { seed, tonicPc: 0, minor: false, beatsPerBar, ...extra });

const onsetsInBar = (notes: { start: number }[], bar: number, barLen: number): number[] =>
  notes.filter((n) => n.start >= bar * barLen - 1e-9 && n.start < (bar + 1) * barLen - 1e-9).map((n) => Math.round((n.start - bar * barLen) * 1000) / 1000).sort((a, b) => a - b);

describe("S4-1 プリセット定義", () => {
  it("全プリセットは16文字の x/. パターン・id 重複なし・長音(疎)を含む", () => {
    const ids = new Set<string>();
    for (const p of RHYTHM_PART_LIST) {
      expect(p.pattern.length).toBe(16);
      expect(/^[x.]{16}$/.test(p.pattern)).toBe(true);
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
    }
    expect(RHYTHM_PART_LIST.length).toBeGreaterThanOrEqual(8);
    expect(RHYTHM_PART_PRESETS.whole).toBe("x..............."); // 白玉（onset1つ＝疎＝長音の担保）
    // 疎パーツ（onset数少）と密パーツ（多）が両方存在＝音価コントラストの素材
    const onsCounts = RHYTHM_PART_LIST.map((p) => (p.pattern.match(/x/g) ?? []).length);
    expect(Math.min(...onsCounts)).toBe(1);
    expect(Math.max(...onsCounts)).toBeGreaterThanOrEqual(8);
  });
  it("partPatternOnsets：4/4=16枠・3/4=先頭12枠切り出し・6/4=3+3", () => {
    expect(partPatternOnsets("x.x.x.x.x.x.x.x.", 4)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    // eighths を 3/4 で＝先頭3拍(12枠)のみ＝[0,0.5,1,1.5,2,2.5]
    expect(partPatternOnsets("x.x.x.x.x.x.x.x.", 3)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    // 6/4=先頭12枠を +0/+3拍へ2度＝[0..2.5, 3..5.5]
    expect(partPatternOnsets("x.x.x.x.x.x.x.x.", 6)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
    // 白玉 3/4＝拍0のみ
    expect(partPatternOnsets("x...............", 3)).toEqual([0]);
  });
});

describe("S4-1 L1 ローテの小節割当＋onset一致（パターン通り）", () => {
  it("rotate=[whole, eighths] を8小節に敷く＝偶数小節=白玉(拍0のみ)・奇数小節=8分刻み", () => {
    const notes = gen(8, 7, { rhythmParts: { rotate: ["whole", "eighths"] } });
    expect(notes.length).toBeGreaterThan(0);
    for (let bar = 0; bar < 8; bar++) {
      const expected = partPatternOnsets(RHYTHM_PART_PRESETS[bar % 2 === 0 ? "whole" : "eighths"]!, 4);
      expect(onsetsInBar(notes, bar, 4)).toEqual(expected);
    }
    // 全音 scale 内（ピッチ機構は従来通り乗る）
    for (const n of notes) expect(scaleSet.has(((n.pitch % 12) + 12) % 12)).toBe(true);
  });
  it("rotate 長さ3（quarters/whole/backbeat）＝bar i は rotate[i%3]（絶対barローテ・全要素が出る）", () => {
    const rot = ["quarters", "whole", "backbeat"];
    const notes = gen(6, 3, { rhythmParts: { rotate: rot } });
    for (let bar = 0; bar < 6; bar++) {
      const expected = partPatternOnsets(RHYTHM_PART_PRESETS[rot[bar % 3]!]!, 4);
      expect(onsetsInBar(notes, bar, 4)).toEqual(expected);
    }
    // bar2/bar5 = backbeat（rotate[2]）＝拍1,3(=beat1,3)に onset＝rotate 末尾要素も敷かれている
    expect(onsetsInBar(notes, 2, 4)).toEqual([1, 3]);
  });
});

describe("S4-1 音価＝疎パーツで長dur（agogic 対比の実証）", () => {
  it("whole パーツ＝dur が小節長(4拍)級／eighths パーツ＝dur が短い(≈0.5拍)", () => {
    const whole = gen(8, 11, { rhythmParts: { rotate: ["whole"] } });
    // 各 whole 小節の音は次onset(=次小節拍0)まで＝dur≈4拍（最終音はセクション末まで）
    for (const n of whole) expect(n.dur).toBeGreaterThanOrEqual(3.5);
    const eighths = gen(8, 11, { rhythmParts: { rotate: ["eighths"] } });
    // 8分刻み＝隣接onset間隔0.5＝dur≈0.5（最終音のみ長い）
    const nonLast = eighths.slice(0, -1);
    expect(Math.max(...nonLast.map((n) => n.dur))).toBeLessThanOrEqual(0.55);
    // 疎パーツの平均dur ≫ 密パーツの平均dur
    const avg = (a: { dur: number }[]) => a.reduce((s, n) => s + n.dur, 0) / a.length;
    expect(avg(whole)).toBeGreaterThan(avg(eighths) * 4);
  });
});

describe("S4-1 3/4 での12枠切り出し", () => {
  it("barLen=3＝onset は先頭3拍内・パターンは12枠切り出し", () => {
    const notes = gen(6, 5, { rhythmParts: { rotate: ["eighths", "whole"] } }, 3);
    for (let bar = 0; bar < 6; bar++) {
      const expected = partPatternOnsets(RHYTHM_PART_PRESETS[bar % 2 === 0 ? "eighths" : "whole"]!, 3);
      expect(onsetsInBar(notes, bar, 3)).toEqual(expected);
      for (const t of onsetsInBar(notes, bar, 3)) expect(t).toBeLessThan(3);
    }
  });
});

describe("S4-1 骨格注入との併用", () => {
  it("skel 注入＋rhythmParts＝onset はパーツ通り・骨格はピッチ機構に乗る", () => {
    // 骨格（構造線）＝1拍粒度の絶対MIDI（tones ブレークポイント）
    const skeleton: SkeletonContent = { bars: 8, tones: [{ start: 0, pitch: 60 }, { start: 8, pitch: 64 }, { start: 16, pitch: 67 }, { start: 24, pitch: 60 }] };
    // skel を V2 の 1拍粒度配列へ（ここでは簡易に skeletonToV2Skel 相当を genMelody 経由で使うため generate 側で検証）。
    // 単体は skel を直接注入して onset のパーツ一致だけ確認する。
    const skelArr = Array.from({ length: 32 }, (_, b) => (b < 8 ? 60 : b < 16 ? 64 : b < 24 ? 67 : 60));
    void skeleton;
    const notes = gen(8, 9, { skel: skelArr, rhythmParts: { rotate: ["driveHold", "half2"] } });
    for (let bar = 0; bar < 8; bar++) {
      const expected = partPatternOnsets(RHYTHM_PART_PRESETS[bar % 2 === 0 ? "driveHold" : "half2"]!, 4);
      expect(onsetsInBar(notes, bar, 4)).toEqual(expected);
    }
  });
});

describe("S4-1 決定性", () => {
  it("同 seed＋同 rhythmParts＝完全一致", () => {
    const a = gen(8, 42, { rhythmParts: { rotate: ["syncope", "offhead", "whole"] } });
    const b = gen(8, 42, { rhythmParts: { rotate: ["syncope", "offhead", "whole"] } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("S4-1 bit一致（未指定/不正/compound は従来と厳密一致）", () => {
  const base = gen(8, 21);
  it("rhythmParts 未指定＝従来と bit 一致", () => {
    expect(JSON.stringify(gen(8, 21, { rhythmParts: undefined }))).toBe(JSON.stringify(base));
  });
  it("rotate 空配列＝bit 一致", () => {
    expect(JSON.stringify(gen(8, 21, { rhythmParts: { rotate: [] } }))).toBe(JSON.stringify(base));
  });
  it("未知 partId のみ＝適用されず bit 一致", () => {
    expect(JSON.stringify(gen(8, 21, { rhythmParts: { rotate: ["nope", "bogus"] } }))).toBe(JSON.stringify(base));
  });
  it("compound(6/8系)＝パーツ無視で bit 一致", () => {
    const c0 = gen(8, 21, { compound: true });
    const c1 = gen(8, 21, { compound: true, rhythmParts: { rotate: ["whole", "eighths"] } });
    expect(JSON.stringify(c1)).toBe(JSON.stringify(c0));
  });
});

describe("S4-1 generate.ts 経路（gen_melody 透過）", () => {
  const frame = { key: 0, meter: "4/4", bars: 8, mode: "major" as const };
  const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i, dur: 1 }));
  it("genMelody に rhythmParts を渡すと onset がパーツ通りになる", () => {
    const res = genMelody(frame, chords, 7, { useV2: true, rhythmParts: { rotate: ["whole", "eighths"] } });
    const notes = (res.items[0]!.content as { notes: { start: number; dur: number }[] }).notes;
    for (let bar = 0; bar < 8; bar++) {
      const expected = partPatternOnsets(RHYTHM_PART_PRESETS[bar % 2 === 0 ? "whole" : "eighths"]!, 4);
      expect(onsetsInBar(notes, bar, 4)).toEqual(expected);
    }
  });
  it("genMelody で rhythmParts 未指定＝従来と bit 一致", () => {
    const a = genMelody(frame, chords, 7, { useV2: true });
    const b = genMelody(frame, chords, 7, { useV2: true, rhythmParts: { rotate: [] } });
    expect(JSON.stringify(a.items[0]!.content)).toBe(JSON.stringify(b.items[0]!.content));
  });
});
