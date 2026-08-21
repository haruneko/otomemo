// ドラムフィル物理移植（M2）＝phrase_maker fills.py / humanize.py の忠実性テスト。
// 埋め込みベクトルは python place_fill（experiments/drums/fills/src）の実出力（round 済）。
// 開発時は scratchpad/fill-golden.json（363 配置）と全件突き合わせ済＝event-for-event 一致。ここは
// その代表を凍結し、CI で回帰を検出する（scratchpad 非依存の自己完結テスト）。
import { describe, it, expect } from "vitest";
import {
  placeFill, applyFills, fillMeter, KIND_NAMES, INTENSITIES, pyRound,
  resolvesLanding, isCrescendo, lengthOk, positionOk, validateLimbs, type FillEvent,
} from "../src/drumFill";
import { stableSeed, Breath, humanizeSeconds } from "../src/humanizeFill";

const ev = (p: ReturnType<typeof placeFill>) => p.events.map((e) => [e.beat, e.voice, e.velocity]);
const ld = (p: ReturnType<typeof placeFill>) => p.landing.map((e) => [e.beat, e.voice, e.velocity]);

describe("KINDS ＝ phrase_maker 一致（銀行丸め・挿入順）", () => {
  it("snare_roll medium beat 4/4", () => {
    expect(ev(placeFill(0, 0, "beat", "medium", "snare_roll"))).toEqual([
      [0.0, "snare", 70], [0.25, "snare", 82], [0.5, "snare", 93], [0.75, "snare", 104],
    ]); // 104.5→104（round-half-even）／Math.round なら 105 でずれる
  });
  it("snare_roll subtle beat 4/4（density 0.85→n=3）", () => {
    expect(ev(placeFill(0, 0, "beat", "subtle", "snare_roll"))).toEqual([
      [0.0, "snare", 48], [0.333333, "snare", 61], [0.666667, "snare", 78],
    ]);
  });
  it("tom_descent medium beat 4/4（tom_hi→mid→floor 梯子）", () => {
    expect(ev(placeFill(0, 0, "beat", "medium", "tom_descent"))).toEqual([
      [0.0, "tom_hi", 74], [0.25, "tom_hi", 86], [0.5, "tom_mid", 97], [0.75, "floor", 108],
    ]);
  });
  it("triplet_cascade medium beat 4/4", () => {
    expect(ev(placeFill(0, 0, "beat", "medium", "triplet_cascade"))).toEqual([
      [0.0, "snare", 76], [0.333333, "tom_mid", 85], [0.666667, "floor", 101],
    ]);
  });
  it("flam_accents medium beat 4/4（grace/main の順・先頭は 0.035 後ろ）", () => {
    expect(ev(placeFill(0, 0, "beat", "medium", "flam_accents"))).toEqual([
      [0.0, "snare", 40], [0.035, "snare", 74], [0.465, "snare", 63], [0.5, "snare", 97],
    ]);
  });
  it("buildup flashy bar 4/4（23打・加速・中間 crash swell）", () => {
    const p = placeFill(0, 0, "bar", "flashy", "buildup");
    expect(p.events.length).toBe(23);
    expect(ev(p).slice(0, 3)).toEqual([[0.0, "snare", 92], [0.444444, "snare", 98], [0.888889, "snare", 102]]);
    expect(ev(p).slice(-3)).toEqual([[3.878788, "snare", 126], [2.666667, "kick", 109], [2.0, "crash", 102]]);
    expect(ld(p)).toEqual([[4.0, "crash", 127], [4.0, "kick", 122]]);
  });
  it("6/8 尺の意味論（half_bar=1.5qb=3八分 / bar=3qb=2付点拍）", () => {
    const half = placeFill(0, 0, "half_bar", "medium", "tom_descent", fillMeter("6/8"));
    expect(half.lengthQb).toBe(1.5);
    expect(ev(half)).toEqual([
      [0.0, "tom_hi", 74], [0.25, "tom_hi", 82], [0.5, "tom_mid", 89],
      [0.75, "tom_mid", 97], [1.0, "tom_lo", 105], [1.25, "floor", 112],
    ]);
    const bar = placeFill(0, 0, "bar", "medium", "snare_roll", fillMeter("6/8"));
    expect(bar.lengthQb).toBe(3.0);
    expect(bar.events.length).toBe(12);
  });
  it("任意位置＝bar/beat のオフセットが qb に効く（末尾固定でない）", () => {
    const p = placeFill(1, 1.0, "beat", "medium", "gallop"); // bar1 beat1 → start qb5
    expect(p.startQb).toBe(5.0);
    expect(p.landingQb).toBe(6.0);
    expect(positionOk(p, 1, 1.0)).toBe(true);
  });
});

describe("place_fill 契約（着地・クレッシェンド）", () => {
  it("既定で crash(49)+kick(36) 着地に解決", () => {
    for (const kind of KIND_NAMES) {
      const p = placeFill(0, 0, "bar", "medium", kind);
      expect(resolvesLanding(p)).toBe(true);
      expect(p.landing.map((e) => e.voice).sort()).toEqual(["crash", "kick"]);
    }
  });
  it("全型がクレッシェンド（頭<尻）", () => {
    for (const kind of KIND_NAMES) expect(isCrescendo(placeFill(0, 0, "bar", "medium", kind))).toBe(true);
  });
  it("length_ok / position_ok", () => {
    const p = placeFill(0, 0, "2beat", "medium", "snare_roll");
    expect(lengthOk(p)).toBe(true);
    expect(positionOk(p, 0, 0)).toBe(true);
  });
});

describe("四肢制約（同時<=4・キック1・手2）＝validate.py 移植", () => {
  it("全 KIND×INTENSITY×length×meter で違反ゼロ・max同時<=4", () => {
    let maxAll = 0;
    for (const kind of KIND_NAMES) for (const inten of INTENSITIES) for (const len of ["beat", "2beat", "half_bar", "bar"] as const) for (const m of ["4/4", "3/4", "6/8"]) {
      const p = placeFill(0, 0, len, inten, kind, fillMeter(m));
      const r = applyFills([], [p]);
      expect(r.ok).toBe(true);
      expect(r.problems).toEqual([]);
      expect(r.maxSimul).toBeLessThanOrEqual(4);
      maxAll = Math.max(maxAll, r.maxSimul);
    }
    expect(maxAll).toBe(2); // 実測（golden と一致）
  });
  it("validateLimbs は違反を検出（キック二重＝RF>1）", () => {
    const bad: FillEvent[] = [{ beat: 0, voice: "kick", velocity: 100 }, { beat: 0, voice: "kick", velocity: 100 }];
    const r = validateLimbs(bad);
    expect(r.ok).toBe(false);
  });
});

describe("決定論（同一 seed→同一フィル）", () => {
  it("placeFill は純関数＝2回で完全一致", () => {
    const a = placeFill(2, 3.0, "half_bar", "flashy", "herta");
    const b = placeFill(2, 3.0, "half_bar", "flashy", "herta");
    expect(a.events).toEqual(b.events);
    expect(a.landing).toEqual(b.landing);
  });
  it("applyFills のマージ結果が安定（beat,voice 昇順）", () => {
    const groove: FillEvent[] = [{ beat: 0, voice: "kick", velocity: 100 }, { beat: 1, voice: "snare", velocity: 100 }];
    const p = placeFill(1, 0.0, "bar", "medium", "snare_roll");
    const r1 = applyFills(groove, [p]);
    const r2 = applyFills(groove, [p]);
    expect(r1.merged).toEqual(r2.merged);
  });
});

describe("ヒューマナイズ決定論（md5 seed＋Python 互換 MT19937）", () => {
  it("stableSeed＝int(md5(s)[:8],16)", () => {
    expect(stableSeed("fills|kinds_tour_44|breath")).toBe(3541545836);
    expect(stableSeed("otomemo-fill-tom_descent")).toBe(1126245079);
  });
  it("Breath 位相が Python random.Random と一致（uniform×3）", () => {
    const b = new Breath(1126245079);
    expect(b.ph1).toBeCloseTo(2.1793146011732882, 12);
    expect(b.ph2).toBeCloseTo(4.336097570317884, 12);
    expect(b.vph).toBeCloseTo(6.1676430433209015, 12);
  });
  it("humanizeSeconds が決定的（同入力→同出力）", () => {
    const b = new Breath(stableSeed("otomemo-fill-tom_descent"));
    const a1 = humanizeSeconds("snare", 0.5, 100, b);
    const a2 = humanizeSeconds("snare", 0.5, 100, b);
    expect(a1).toEqual(a2);
    expect(a1.velocity).toBeGreaterThanOrEqual(1);
    expect(a1.velocity).toBeLessThanOrEqual(127);
  });
});

describe("pyRound（round-half-to-even）", () => {
  it("端数 0.5 は偶数側へ", () => {
    expect(pyRound(0.5)).toBe(0);
    expect(pyRound(1.5)).toBe(2);
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(81.5)).toBe(82);
    expect(pyRound(104.5)).toBe(104);
  });
});
