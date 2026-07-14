import { describe, it, expect } from "vitest";
import { scalePitchList, snapToChordTones, genSkeleton, anticipate, learnBarRhythms, sampleBarRhythm, learnMoveTransitions, genContour, learnSkeleton, genSkeletonFromModel, loadSkeletonModel } from "../src/music/melodyCells";
import { scalePcs, chordPcs } from "../src/music/theory";

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

  // skelForm＝フォーム型リテラル回帰（design #12-M・2026-07-13）。既定=現状(輪郭反復)＝bit一致は上のテストが担保。
  describe("skelForm（構造のリテラル回帰・2/4/8で使い回す）", () => {
    const model = learnSkeleton([
      { chordRel: 0, prevDeg: -1, deg: 0 }, { chordRel: 0, prevDeg: 0, deg: 2 }, { chordRel: 0, prevDeg: 2, deg: 4 },
      { chordRel: 5, prevDeg: 4, deg: 3 }, { chordRel: 7, prevDeg: 3, deg: 1 }, { chordRel: 7, prevDeg: 1, deg: 6 },
      { chordRel: 0, prevDeg: 6, deg: 4 }, { chordRel: 0, prevDeg: 4, deg: 0 },
    ]);
    const chords = [0, 5, 7, 0, 9, 2, 5, 7]; // 8小節（後半4小節は前半と別進行＝def の前後半は割れる。period は前半をリテラル複写）
    const args = { tonicPc: 0, seed: 3, beatsPerBar: 4, strongQuarters: [0, 2] as number[], start: 60 };
    const half = 16; // 8小節×4拍=32拍／前半4小節=16拍
    const matchHalves = (a: number[]) => { let c = 0; for (let i = 0; i < half; i++) if (a[i] === a[half + i]) c++; return c; };

    it("period＝後半4小節が前半のリテラル反復（カデンツ除き一致）＝既定より自己相似が高い", () => {
      const def = genSkeletonFromModel(chords, model, cMaj, args);
      const per = genSkeletonFromModel(chords, model, cMaj, { ...args, skelForm: "period" });
      expect(matchHalves(per)).toBeGreaterThan(matchHalves(def)); // 形式の方が前後半が揃う
      expect(matchHalves(per)).toBeGreaterThanOrEqual(half - 4); // カデンツ数拍を除き一致
    });
    it("aaba＝u3(7-8小節)が u0(1-2小節)へリテラル回帰（頭スロット一致・カデンツ除く）", () => {
      const ab = genSkeletonFromModel(chords, model, cMaj, { ...args, skelForm: "aaba" });
      // u0=beats0-7 / u3=beats24-31。カデンツ(各ユニット末の強拍スロット=beats6-7 / 30-31)を除いた頭側を比較。
      let c = 0; for (let b = 0; b < 6; b++) if (ab[b] === ab[24 + b]) c++;
      expect(c).toBeGreaterThanOrEqual(5); // 頭6拍中5拍以上が回帰（リテラル）
    });
  });

  // skelColor＝骨格の脱平面化（WP-M1・2026-07-14）。強拍スロットへコーパス駆動の accented NCT（倚音）を確率的に
  // 注入し、必ず次スロットへ段進行で解決させる＝無菌な主音平面（強拍CT≈100%）を実曲帯（65.8%）へ割る。
  describe("skelColor（脱平面化＝強拍倚音のコーパス駆動注入）", () => {
    const model = loadSkeletonModel(false); // POP909 学習の長調骨格モデル
    const roots = [0, 9, 5, 7, 0, 9, 5, 7];           // I vi IV V ×2（C major）
    const quals = ["", "m", "", "", "", "m", "", ""];
    const chordPcsPerBar = roots.map((r, i) => chordPcs(r, quals[i]!));
    const sp = scalePitchList(scalePcs(0, "major"), 55, 72);
    const bpb = 4, strongQ = [0, 2];
    const args = { tonicPc: 0, beatsPerBar: bpb, strongQuarters: strongQ as number[], start: 62 };
    const strongSlots = (skel: number[]) => { const out: { pitch: number; bar: number }[] = []; for (let bar = 0; bar < roots.length; bar++) for (const q of strongQ) out.push({ pitch: skel[bar * bpb + q]!, bar }); return out; };

    it("skelColor 未指定/0 は従来出力と完全一致（bit一致）", () => {
      for (const seed of [1, 3, 7, 12, 40]) {
        const base = genSkeletonFromModel(roots, model, sp, { ...args, seed });
        const undef = genSkeletonFromModel(roots, model, sp, { ...args, seed, chordPcsPerBar }); // color 無し＝倚音パス不発
        const zero = genSkeletonFromModel(roots, model, sp, { ...args, seed, skelColor: 0, chordPcsPerBar });
        expect(undef).toEqual(base);
        expect(zero).toEqual(base);
      }
    });

    // 集計ヘルパ：強拍CT率・NCTの段進行解決率・禁則跳躍率（強拍スロット間）。
    const agg = (skelColor?: number) => {
      let ct = 0, tot = 0, nct = 0, nctStep = 0, forbid = 0, ivs = 0, changed = 0;
      for (let seed = 1; seed <= 80; seed++) {
        const base = genSkeletonFromModel(roots, model, sp, { ...args, seed });
        const skel = genSkeletonFromModel(roots, model, sp, { ...args, seed, ...(skelColor != null ? { skelColor, chordPcsPerBar } : {}) });
        if (skelColor != null && JSON.stringify(base) !== JSON.stringify(skel)) changed++;
        const slots = strongSlots(skel);
        for (let i = 0; i < slots.length; i++) {
          const pc = ((slots[i]!.pitch % 12) + 12) % 12; tot++;
          if (chordPcsPerBar[slots[i]!.bar]!.includes(pc)) ct++;
          else { nct++; if (i < slots.length - 1 && Math.abs(slots[i + 1]!.pitch - slots[i]!.pitch) <= 2) nctStep++; }
          if (i > 0) { const iv = Math.abs(slots[i]!.pitch - slots[i - 1]!.pitch); ivs++; if (iv === 6 || iv === 10 || iv === 11 || iv > 12) forbid++; }
        }
      }
      return { ctRate: ct / tot, nctStepRatio: nct ? nctStep / nct : 1, forbidRate: forbid / ivs, changed };
    };

    it("ノブON（0.5）で強拍コードトーン率が実曲帯（60〜75%）に収まる", () => {
      const on = agg(0.5);
      expect(on.changed).toBeGreaterThan(0);            // 実際に骨格を変えている
      expect(on.ctRate).toBeGreaterThanOrEqual(0.6);    // 実曲下限（65.8%帯）
      expect(on.ctRate).toBeLessThanOrEqual(0.75);      // 無菌側（≈100%）へ戻らない
    });

    it("倚音は裸で放置されない＝ノブONで強拍NCTの段進行解決率が上がる（principled）", () => {
      const base = agg();       // 素の骨格（モデルの偶発NCTは跳ぶものも多い）
      const on = agg(1.0);      // color最大＝倚音を段解決で注入
      expect(on.nctStepRatio).toBeGreaterThan(base.nctStepRatio);
    });

    it("E-ruleガード：ノブONで強拍間の禁則跳躍（三全音/7度/8度超）を増やさない", () => {
      const base = agg();
      const on = agg(1.0);
      expect(on.forbidRate).toBeLessThanOrEqual(base.forbidRate + 1e-9);
    });
  });
});

// genMotifMelody（③ motifModel 経路）は #16(J4) で撤去済み＝本番全経路 useV2:true で②V2が先取り・③不到達。
// 統合生成の検証は V2（genMotifMelodyV2）側の melody-cells-v2*/section-context/generate-invariants が担保する。

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
