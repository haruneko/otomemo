// py-parity（M3-3g）＝phrase_maker `_lock_bass_roots_to_sheet` とのデータ一致。
// 参照値＝`tools/py-parity/cases/*.json`（`tools/py-parity/run_dump.sh` が焼く・コミット済み）。
// 「○件一致」を後から抜き打ちで検算できる形にしてある（計画 §6-3 の末尾）。
//
// なぜデータ一致を主張してよいか（計画 §6-1 の1行目）：源流のこの関数は RNG も hash も使わず
// （docstring "Deterministic: no rng / hash()"）、レジスタ選択の同点も `(abs(c-base), c)` で決まる＝
// 完全な純関数。だから列で突き合わせられる。
import { describe, it, expect } from "vitest";
import { lockBassRootsToSheet } from "../src/anchorLock";
import { loadCase, listCaseIds, rows, type ParityCase } from "./pyParity";

const run = (c: ParityCase) => lockBassRootsToSheet(c.body, c.segs, {
  stepsPerBar: c.stepsPerBar, nBars: c.nBars, kick: c.kick, accents: c.accents,
  restOnSyncopatedKick: c.restOnSyncopatedKick, lo: c.lo, hi: c.hi, rootDeg: "0",
});

describe("py-parity スモーク（計画 §11-3 の 2＝これが動かないと M3 の受け入れが実行できない）", () => {
  it("4/4・pedal_answer・kick[0,8]・進行 Am F C G が Python と列一致", () => {
    const c = loadCase("pedal_answer__amfcg__k08__restA");
    expect(c.spec.progression).toBe("Am F C G");
    expect(c.spec.kick).toEqual([0, 8]);
    expect(c.stepsPerBar).toBe(16);
    expect(rows(run(c).onsets)).toEqual(c.expected);
  });
});

describe("py-parity ケース表（kick パターン × 進行 × grammar セル3型 × 案B on/off）", () => {
  const ids = listCaseIds();
  it("ケース表がコミットされている（110件＝3 grammar × 3 進行 × 6 kick × 案B 2 ＋ アクセント2）", () => {
    expect(ids.length).toBe(110);
  });
  for (const id of ids) {
    it(`一致：${id}`, () => {
      const c = loadCase(id);
      expect(rows(run(c).onsets)).toEqual(c.expected);
    });
  }
});

describe("py-parity の陰性対照（計画 §6-4 の 4＝比較が空虚でないことを見る）", () => {
  it("案B（restOnSyncopatedKick）を反転すると、シンコペ kick のケースでは列が変わる", () => {
    const a = loadCase("pedal_answer__amfcg__krest__restA");
    const b = loadCase("pedal_answer__amfcg__krest__restB");
    expect(rows(run(a).onsets)).not.toEqual(rows(run(b).onsets)); // 差が出る＝つまみが効いている
    expect(rows(run(b).onsets)).toEqual(b.expected);              // 反転側も Python と一致
  });
  it("キックを1つずらすと Python の参照値と一致しなくなる（＝一致が偶然でない）", () => {
    const c = loadCase("pedal_answer__amfcg__k08__restA");
    const moved = lockBassRootsToSheet(c.body, c.segs, {
      stepsPerBar: c.stepsPerBar, nBars: c.nBars, kick: [0, 9], accents: c.accents,
      restOnSyncopatedKick: c.restOnSyncopatedKick, lo: c.lo, hi: c.hi, rootDeg: "0",
    });
    expect(rows(moved.onsets)).not.toEqual(c.expected);
  });
});

describe("被覆率（byConstruction＝証拠に数えない・数値で出す：計画 §6-4 の 7）", () => {
  it("案B OFF＝全キック step に錨（coverage=1）／案B ON＝拍頭以外は見送られる分だけ下がる", () => {
    const off = run(loadCase("pedal_answer__amfcg__krest__restA")).report;
    const on = run(loadCase("pedal_answer__amfcg__krest__restB")).report;
    expect(off.coverage).toBe(1);
    expect(off.skipped).toBe(0);
    expect(on.coverage).toBeGreaterThan(0);
    expect(on.coverage).toBeLessThan(1);
    expect(on.skipped).toBeGreaterThan(0);
    // 分岐の内訳が全部 0 でない＝(a)(b)(c) が実際に踏まれているケース表になっている
    const dense = run(loadCase("octave_call_response__amfcg__kdense__restA")).report;
    expect(dense.promoted).toBeGreaterThan(0);
    expect(dense.overwritten).toBeGreaterThan(0);
    expect(dense.inserted).toBeGreaterThan(0);
  });
});
