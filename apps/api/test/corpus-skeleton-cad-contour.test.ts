import { describe, it, expect } from "vitest";
import { genSkeletonFromModel, loadSkeletonModel, scalePitchList, sampleCadDeg, sampleContour } from "../src/music/melodyCells";
import { scalePcs } from "../src/music/theory";

// WP-M1 第2スライス＝cadDeg／contour のコーパス prior 結線（gen_skeleton 専用）。
// 正典＝design「WP-M1 第2スライス＝cadDeg／contour のコーパス prior 結線」。bit一致既定が番人。

const cMaj = scalePitchList(scalePcs(0, "major"), 55, 72);
const model = loadSkeletonModel(false);
const roots = [0, 9, 5, 7, 0, 9, 5, 7]; // 8小節・I vi IV V ×2（度数根pc）
const baseArgs = { tonicPc: 0, beatsPerBar: 4, strongQuarters: [0, 2], start: 62, phraseEnds: [] as { bar: number; deg: number }[] };
// 対称句割り（各2小節句の unit尾＝5̂半終止・曲末＝主音）を骨格へ伝える phraseEnds。
const symPhraseEnds = [{ bar: 1, deg: 4 }, { bar: 3, deg: 4 }, { bar: 5, deg: 4 }, { bar: 7, deg: 0 }];
const degOf = (p: number) => (((p - baseArgs.tonicPc) % 12) + 12) % 12;

// 決定的 RNG（テスト内で sampleCadDeg/sampleContour を回すため）
function rngOf(seed: number): () => number { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 0xffffffff; }; }

describe("(第2スライス) sampleCadDeg 単体", () => {
  it("strength=0＝ルール度数を決定的に返す（アンカーのみ）", () => {
    for (const ruleDeg of [0, 1, 4]) {
      for (const seed of [1, 2, 9, 42]) {
        expect(sampleCadDeg(ruleDeg, new Map([[2, 1]]), 0, rngOf(seed))).toBe(ruleDeg);
      }
    }
  });
  it("候補集合に汚染度数 4̂(deg3)/7̂(deg6) は絶対に現れない（安定音制限）", () => {
    // deg3(4̂)/deg6(7̂) に極端な重みを与えても、strength 最大でも選ばれない
    const dirtyPrior = new Map<number, number>([[3, 100], [6, 100], [4, 0.01]]);
    const seen = new Set<number>();
    for (let seed = 1; seed <= 400; seed++) seen.add(sampleCadDeg(4, dirtyPrior, 8, rngOf(seed)));
    expect(seen.has(3)).toBe(false);
    expect(seen.has(6)).toBe(false);
  });
  it("2̂偏重＋strength大で分布が 2̂ へ寄る・ただしアンカー(ruleDeg=4)も残存", () => {
    const prior = new Map<number, number>([[1, 1]]); // 2̂=deg1 を強く
    let two = 0, four = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const d = sampleCadDeg(4, prior, 8, rngOf(seed));
      if (d === 1) two++;
      if (d === 4) four++;
    }
    expect(two).toBeGreaterThan(0); // prior の 2̂ が現れる
    expect(four).toBeGreaterThan(0); // ルール度数 5̂(=deg4) も重み1で残る
    expect(two).toBeGreaterThan(four); // strength大＝prior 側へ寄る
  });
});

describe("(第2スライス) sampleContour 単体", () => {
  it("ラベル写像：ascending→asc / descending→desc / arch/valley は同名", () => {
    expect(sampleContour([["arch", 1]], rngOf(1))).toBe("arch");
    expect(sampleContour([["valley", 1]], rngOf(1))).toBe("valley");
    expect(sampleContour([["ascending", 1]], rngOf(1))).toBe("asc");
    expect(sampleContour([["descending", 1]], rngOf(1))).toBe("desc");
  });
  it("wave/flat は型なし(undefined)へ写す", () => {
    expect(sampleContour([["wave", 1]], rngOf(1))).toBeUndefined();
    expect(sampleContour([["flat", 1]], rngOf(1))).toBeUndefined();
  });
  it("空 prior＝undefined（素通し）", () => {
    expect(sampleContour([], rngOf(1))).toBeUndefined();
  });
  it("pct 分布どおりに抽選（arch 支配＝多くが arch）", () => {
    const prior: [string, number][] = [["arch", 90], ["valley", 10]];
    let arch = 0;
    for (let seed = 1; seed <= 200; seed++) if (sampleContour(prior, rngOf(seed)) === "arch") arch++;
    expect(arch).toBeGreaterThan(120); // 90% 支配＝多数派
  });
});

describe("(第2スライス) genSkeletonFromModel cadDeg 結線（OFF=bit一致・ON=句末が寄る）", () => {
  const cadPrior = new Map<number, number>([[1, 0.5], [4, 0.3], [2, 0.2]]); // 2̂/5̂/3̂

  it("cadPrior 未指定＝現行と bit 一致（回帰ゼロ）", () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      expect(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, cadPrior: undefined }))
        .toEqual(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed }));
    }
  });

  it("cadPrior 在でも cadDegStrength=0（または未指定）＝bit 一致（gate OFF）", () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      expect(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, cadPrior, cadDegStrength: 0 }))
        .toEqual(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed }));
      expect(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, cadPrior }))
        .toEqual(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed }));
    }
  });

  it("空 cadPrior Map＝bit 一致（degrade gracefully）", () => {
    for (const seed of [1, 5, 42]) {
      expect(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, cadPrior: new Map(), cadDegStrength: 6 }))
        .toEqual(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed }));
    }
  });

  it("cadDegStrength>0＝決定的、曲末=主音は 40/40 seed で不変（最終着地保護）", () => {
    for (const seed of [1, 5]) {
      expect(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, cadPrior, cadDegStrength: 6 }))
        .toEqual(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, cadPrior, cadDegStrength: 6 }));
    }
    for (let seed = 1; seed <= 40; seed++) {
      const skel = genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, cadPrior, cadDegStrength: 8 });
      expect(degOf(skel[skel.length - 1]!)).toBe(0); // 曲末=主音
    }
  });

  it("cadDegStrength>0＝句末（半終止5̂）着地が cadPrior の安定音側へシフトする", () => {
    // 返り値は beat 長(=bars*bpb=32)。各 beat は担当スロットの値を保持。unit-1 の尾カデンツ＝bar3 の beat2
    //   （句末ルール度数 5̂=deg4→pc7）が cadDegOf を通る唯一の中間句末（他 unit尾は smp/複写経路で pe 非経由）。
    //   ここを strength 0 vs 8 で比較＝OFF は全 seed で 5̂ 決め打ち、ON は cadPrior(2̂/3̂/1̂)で 5̂ 以外へ動く。
    const CAD_BEAT = 3 * 4 + 2; // bar3, beat2 = 14
    const non5 = (strength: number) => {
      let c = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const skel = genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, cadPrior, cadDegStrength: strength });
        if (degOf(skel[CAD_BEAT]!) !== 7) c++; // pc7=5̂ 以外
      }
      return c;
    };
    const off = non5(0), on = non5(8);
    expect(off).toBe(0);            // OFF＝半終止は 5̂ 決め打ち（60/60）
    expect(on).toBeGreaterThan(20); // ON＝過半に近い seed が cadPrior の安定音へ着地シフト
  });
});

describe("(第2スライス) genSkeletonFromModel contour 結線（OFF=bit一致・明示enum勝ち・曲単位一型）", () => {
  const contourPrior: [string, number][] = [["arch", 38], ["valley", 25], ["descending", 15], ["ascending", 13], ["wave", 6], ["flat", 3]];

  it("contourPrior 未指定＝現行と bit 一致（回帰ゼロ）", () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      expect(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, contourPrior: undefined }))
        .toEqual(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed }));
    }
  });

  it("空 contourPrior＝bit 一致（degrade gracefully）", () => {
    for (const seed of [1, 5, 42]) {
      expect(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, contourPrior: [] }))
        .toEqual(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed }));
    }
  });

  it("明示 contour='arch' が prior に勝つ（prior 在でも arch 単独と同一）", () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      expect(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, contour: "arch", contourPrior }))
        .toEqual(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, contour: "arch" }));
    }
  });

  it("contourPrior 在（enum 無し）＝決定的、かつ多くの seed で baseline から骨格が変わる", () => {
    const sig = (a: number[]) => a.join(",");
    let differ = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const withP = genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, contourPrior });
      const withP2 = genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, contourPrior });
      expect(sig(withP)).toBe(sig(withP2)); // 決定的
      const plain = genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed });
      if (sig(withP) !== sig(plain)) differ++;
    }
    expect(differ).toBeGreaterThan(0); // 型抽選→nudge で変わる seed がある（wave/flat 抽選時は不発もある）
  });

  it("曲末=主音は contourPrior 下でも保持（40/40 seed）", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const skel = genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, phraseEnds: symPhraseEnds, seed, contourPrior });
      expect(degOf(skel[skel.length - 1]!)).toBe(0);
    }
  });

  it("rCon オーバーフロー回帰：seed=5,000,000 と 5,000,001 が別系列（下位ビット潰れ不在）", () => {
    // Math.imul 版では大 seed でも隣接 seed が同一輪郭抽選へ潰れない＝十分な分布で結果が割れるはず。
    // 直接 sampleContour の系列を比較（rCon の種違い＝Math.imul で分離）。
    const rconOf = (seed: number) => rngOfImul((Math.imul(seed, 2246822519) >>> 0) + 59);
    const many: [string, number][] = [["arch", 1], ["valley", 1], ["descending", 1], ["ascending", 1]];
    // 単発だと同じになりうるので、複数 draw 列で違いを見る（10 draw の列が一致しないこと）
    const seq = (seed: number) => { const r = rconOf(seed); return Array.from({ length: 10 }, () => sampleContour(many, r)).join(","); };
    expect(seq(5_000_000)).not.toBe(seq(5_000_001));
  });
});

// 本体 makeRng と同一（Math.imul の LCG）＝rCon 系列の再現に使う
function rngOfImul(seed: number): () => number { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 0xffffffff; }; }
