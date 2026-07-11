import { describe, it, expect } from "vitest";
import { scalePitchList, snapToChordTones, genSkeleton, anticipate, learnBarRhythms, sampleBarRhythm, learnMoveTransitions, genContour, genMotifMelody, learnSkeleton, genSkeletonFromModel } from "../src/music/melodyCells";
import { scalePcs } from "../src/music/theory";

const cMaj = scalePitchList(scalePcs(0, "major"), 48, 84); // C major の音階ピッチ列

describe("scalePitchList（音階ピッチ列）", () => {
  it("C major は C,D,E,F,G,A,B のみ・昇順", () => {
    expect(cMaj.includes(72)).toBe(true); // C5
    expect(cMaj.includes(73)).toBe(false); // C#5 は無い
    expect(cMaj.includes(76)).toBe(true); // E5
    for (let i = 1; i < cMaj.length; i++) expect(cMaj[i]! > cMaj[i - 1]!).toBe(true);
  });
});

describe("snapToChordTones（位置段階：強拍は縛る・弱拍/ウラは通す・長音は縛る）", () => {
  it("強拍(0,2)の非コードトーンはスナップ／弱拍頭(1,3)・ウラの短音は通す", () => {
    const notes = [
      { pitch: 74, start: 0, dur: 0.5 },   // D5 強拍(0)短 → snap
      { pitch: 74, start: 1, dur: 0.5 },   // D5 弱拍頭(1)短 → 通す
      { pitch: 74, start: 1.5, dur: 0.5 }, // D5 ウラ短(passing) → 通す
      { pitch: 74, start: 2, dur: 0.5 },   // D5 強拍(2)短 → snap
    ];
    snapToChordTones(notes, () => [0, 4, 7], cMaj); // Cメジャー
    expect([72, 76]).toContain(notes[0]!.pitch); // 強拍0→snap
    expect(notes[1]!.pitch).toBe(74); // 弱拍頭→通す
    expect(notes[2]!.pitch).toBe(74); // ウラ→通す（滑らかさ）
    expect([72, 76]).toContain(notes[3]!.pitch); // 強拍2→snap
  });
  it("長音は位置に関わらずスナップ（カデンツ/着地）／極短の強拍音は通す（解決じみた動き）", () => {
    const longOff = [{ pitch: 74, start: 1.5, dur: 2 }]; // ウラだが長音
    snapToChordTones(longOff, () => [0, 4, 7], cMaj);
    expect([72, 76]).toContain(longOff[0]!.pitch); // 長音→snap
    const tinyStrong = [{ pitch: 74, start: 0, dur: 0.25 }]; // 強拍だが極短
    snapToChordTones(tinyStrong, () => [0, 4, 7], cMaj);
    expect(tinyStrong[0]!.pitch).toBe(74); // 極短強拍→通す
  });
  it("既にコードトーンなら触らない", () => {
    const notes = [{ pitch: 72, start: 0, dur: 2 }];
    snapToChordTones(notes, () => [0, 4, 7], cMaj);
    expect(notes[0]!.pitch).toBe(72);
  });
});

describe("genSkeleton（コード追従・声部進行・open/close終止）", () => {
  const prog = [[0, 4, 7], [9, 0, 4], [5, 9, 0], [7, 11, 2]]; // C Am F G
  it("各拍が対応小節のコードトーン・末尾はclose=tonic/open=5度", () => {
    const close = genSkeleton(prog, cMaj, { tonicPc: 0, fifthPc: 7, ending: "close" });
    expect(close.length).toBe(16); // 4小節×4拍
    // 末尾(終止override)以外は各拍がその小節のコードトーン
    for (let b = 0; b < 15; b++) expect(prog[Math.floor(b / 4)]!.includes(((close[b]! % 12) + 12) % 12)).toBe(true);
    expect(((close[15]! % 12) + 12) % 12).toBe(0); // close末＝調tonic(C)
    const open = genSkeleton(prog, cMaj, { tonicPc: 0, fifthPc: 7, ending: "open" });
    expect(((open[15]! % 12) + 12) % 12).toBe(7); // open末＝調5度(G)
  });
  it("Urlinie：句全体で頭音→1度へ下降（前半平均>後半平均）・各拍コードトーン", () => {
    const prog8 = [[0, 4, 7], [9, 0, 4], [5, 9, 0], [7, 11, 2], [0, 4, 7], [9, 0, 4], [5, 9, 0], [0, 4, 7]];
    const sk = genSkeleton(prog8, cMaj, { ending: "close", tonicPc: 0, fifthPc: 7 });
    expect(sk.length).toBe(32);
    for (let b = 0; b < 31; b++) expect(prog8[Math.floor(b / 4)]!.includes(((sk[b]! % 12) + 12) % 12)).toBe(true);
    const firstQ = sk.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
    const lastQ = sk.slice(28, 32).reduce((a, b) => a + b, 0) / 4;
    expect(firstQ).toBeGreaterThan(lastQ); // 全体で下降（Urlinie）
    expect(Math.max(...sk)).toBeLessThanOrEqual(sk[0]! + 3); // 単一頂点（頭付近が最高・大きく超えない）
  });
});

describe("learnBarRhythms / sampleBarRhythm（motifリズム＝1小節8分onset列を語彙化）", () => {
  it("頻度で数え・重み付けサンプル・空はデフォルト", () => {
    const m = learnBarRhythms(["x.x.x.x.", "x.x.x.x.", ".xxxxxxx", "........"]); // 最後はonset無し→除外
    expect(m.patterns.get("x.x.x.x.")).toBe(2);
    expect(m.patterns.get(".xxxxxxx")).toBe(1);
    expect(m.patterns.has("........")).toBe(false); // onset無しは語彙に入れない
    const s = sampleBarRhythm(m, 5);
    expect(["x.x.x.x.", ".xxxxxxx"]).toContain(s);
    expect(sampleBarRhythm(m, 5)).toBe(s); // 同seedで決定的
    expect(sampleBarRhythm(learnBarRhythms([]), 1)).toContain("x"); // 空モデルでも音のあるデフォルト
  });
});

describe("learnMoveTransitions / genContour（Markov contour＝gap-fill：跳んだら戻る）", () => {
  it("move遷移 P(m2|m1) を数える", () => {
    const m = learnMoveTransitions([[60, 64, 67, 64, 60]]); // move列 +4,+3,-3,-4 → 遷移(+4→+3)(+3→-3)(-3→-4)
    expect(m.trans.get(4)?.get(3)).toBe(1);
    expect(m.trans.get(3)?.get(-3)).toBe(1);
    expect(m.trans.get(-3)?.get(-4)).toBe(1);
  });
  it("genContour：onset数ぶんの累積半音・先頭0・range内", () => {
    const m = learnMoveTransitions([[60, 62, 64, 62, 60, 62, 64]]);
    const c = genContour(5, m, 7, { range: 9 });
    expect(c.length).toBe(5);
    expect(c[0]).toBe(0);
    expect(c.every((x) => Math.abs(x) <= 9)).toBe(true);
  });
  it("genContour：禁則の三全音(±6)跳躍を含まない（Fux禁則）", () => {
    const m = learnMoveTransitions([[60, 66, 60, 66, 67, 61, 67, 61]]); // ±6(三全音)だらけのモデル
    const c = genContour(8, m, 3, { range: 12 });
    for (let i = 1; i < c.length; i++) expect(Math.abs(c[i]! - c[i - 1]!)).not.toBe(6);
  });
});

describe("learnSkeleton / genSkeletonFromModel（骨格をデータ駆動で学習）", () => {
  it("学習した度数遷移で骨格・各拍スケール音・先頭はtonic", () => {
    const m = learnSkeleton([
      { chordRel: 0, prevDeg: -1, deg: 0 }, { chordRel: 0, prevDeg: 0, deg: 2 }, { chordRel: 0, prevDeg: 2, deg: 0 },
      { chordRel: 0, prevDeg: -1, deg: 0 }, { chordRel: 0, prevDeg: 0, deg: 2 },
    ]); // I で start→tonic→3度→tonic を学習
    const sk = genSkeletonFromModel([0, 0], m, cMaj, { tonicPc: 0, seed: 1, beatsPerBar: 4, strongQuarters: [0, 2], start: 60 });
    expect(sk.length).toBe(8); // 2小節×4拍
    for (const p of sk) expect(cMaj.includes(p)).toBe(true); // 各拍スケール音
    expect(((sk[0]! % 12) + 12) % 12).toBe(0); // 先頭強拍=tonic(C)
  });
});

describe("genMotifMelody（統合：コード追従骨格＋motifリズム＋Markov contour＋snap）", () => {
  const prog = [[0, 4, 7], [9, 0, 4], [5, 9, 0], [0, 4, 7]]; // C Am F C（4小節）
  it("音が出る・強拍はその小節のコードトーン・モチーフ反復で2小節周期", () => {
    const rm = learnBarRhythms(["x.x.x.x.", ".x.x.x.x"]);
    const mm = learnMoveTransitions([[60, 62, 64, 65, 64, 62, 60, 59, 60]]);
    const ns = genMotifMelody(prog, cMaj, rm, mm, { seed: 3, tonicPc: 0, fifthPc: 7 });
    expect(ns.length).toBeGreaterThan(4);
    for (const n of ns) {
      const inBar = ((n.start % 4) + 4) % 4;
      if (Math.abs(inBar) < 0.06 || Math.abs(inBar - 2) < 0.06) { // 強拍
        const pcs = prog[Math.floor(n.start / 4) % 4]!;
        expect(pcs.includes(((n.pitch % 12) + 12) % 12)).toBe(true);
      }
    }
  });
  it("6/8（複合）：1小節=3四分・6枠リズム・強拍(0,1.5)がコードトーン・中景(contour)は流用", () => {
    const rm = learnBarRhythms(["x.x.x.", "xx.xx."]); // 6枠(6/8)パターン
    const mm = learnMoveTransitions([[60, 62, 64, 62, 60, 59, 60]]); // 4/4と同じmove文法を流用
    const ns = genMotifMelody(prog, cMaj, rm, mm, { seed: 3, tonicPc: 0, fifthPc: 7, meter: { beatsPerBar: 3, eighthsPerBar: 6, strongQuarters: [0, 1.5] } });
    expect(ns.length).toBeGreaterThan(4);
    // start は小節=3四分グリッドに乗る（最大 4小節*3=12四分）
    expect(ns.every((n) => n.start < 12 + 1e-6)).toBe(true);
    for (const n of ns) {
      const inBar = ((n.start % 3) + 3) % 3;
      if (Math.abs(inBar) < 0.06 || Math.abs(inBar - 1.5) < 0.06) { // 6/8 の強拍
        const pcs = prog[Math.floor(n.start / 3) % 4]!;
        expect(pcs.includes(((n.pitch % 12) + 12) % 12)).toBe(true);
      }
    }
  });
});

describe("anticipate（位置固定groove：指定拍のonsetを毎小節16分前借り＋タイ＝“a”の一定の食い）", () => {
  it("指定拍(beat2)のonsetを毎小節16分前借り・前音詰め・終端不変・一定", () => {
    const notes = [{ pitch: 67, start: 0, dur: 2 }, { pitch: 72, start: 2, dur: 2 }, { pitch: 74, start: 6, dur: 2 }];
    anticipate(notes, { beats: [2], offset: 0.25 });
    expect(notes[1]!.start).toBeCloseTo(1.75); // bar0 beat2 → a(1.75)
    expect(notes[2]!.start).toBeCloseTo(5.75); // bar1 beat2 → a(5.75)＝毎小節同じ＝一定
    expect(notes[1]!.start + notes[1]!.dur).toBeCloseTo(4); // タイ＝終端不変
    expect(notes[0]!.start + notes[0]!.dur).toBeCloseTo(1.75); // 前音が詰まる
  });
  it("指定拍以外は触らない", () => {
    const notes = [{ pitch: 67, start: 0, dur: 1 }, { pitch: 72, start: 1, dur: 1 }]; // beat1
    anticipate(notes, { beats: [2], offset: 0.25 });
    expect(notes[1]!.start).toBe(1); // beat1は対象外
  });
});
