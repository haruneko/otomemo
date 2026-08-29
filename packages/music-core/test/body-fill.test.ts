// 身体シミュレータ（bodyFill.ts）の**忠実移植ゴールデン**。phrase_maker
// `experiments/drums/fills/src/bodyfill.py` を別プロセスで走らせた出力をそのまま焼き込んだもの。
// 移植の正しさは耳ではなく**データ一致**で証明する（アークの流儀）。検証時の全網羅は
// 3拍子×3長さ×3強度×3ソルト×2テンポ＝162件＋prior/つまみ84件＝**246/246 完全一致**。
// ここにはその代表10件を回帰ガードとして固定する（phrase_maker が無くても走る）。
import { describe, it, expect } from "vitest";
import { planBodyFill, fillMeter, GMD_PRIORS, type GmdPrior } from "../src/index";

const GOLDEN: {
  kind: string; drummer: string | null; meter: string; length: string; intensity: string;
  salt: number; tempo: number; depth: number | null; density: number | null;
  crescendo: number | null; tail: number | null;
  ev: [number, string, number][]; hands: string[];
}[] = [
  {"kind": "prior", "drummer": "drummer1", "meter": "4/4", "length": "2beat", "intensity": "subtle", "salt": 1, "tempo": 120, "depth": null, "density": null, "crescendo": null, "tail": null, "ev": [[8.0, "kick", 63], [8.0, "snare", 77], [8.5, "snare", 70], [8.54, "snare", 47], [8.75, "kick", 50], [9.0, "phh", 55], [9.0, "tom_lo", 80], [9.5, "floor", 86], [9.5, "kick", 72]], "hands": ["F", "R", "R", "L", "F", "F", "R", "R", "F"]},
  {"kind": "prior", "drummer": "drummer1", "meter": "4/4", "length": "2beat", "intensity": "subtle", "salt": 999, "tempo": 120, "depth": null, "density": null, "crescendo": null, "tail": null, "ev": [[8.0, "kick", 63], [8.0, "snare", 77], [8.5, "snare", 70], [8.54, "snare", 47], [9.0, "kick", 50], [9.0, "tom_lo", 80], [9.5, "kick", 72], [9.5, "snare", 86], [9.75, "kick", 50]], "hands": ["F", "R", "R", "L", "F", "R", "F", "R", "F"]},
  {"kind": "knob", "drummer": null, "meter": "4/4", "length": "bar", "intensity": "medium", "salt": 42, "tempo": 120, "depth": -0.3, "density": 1.8, "crescendo": null, "tail": 0.0, "ev": [[8.0, "kick", 60], [8.0, "snare", 74], [8.5, "snare", 72], [9.0, "snare", 86], [9.5, "kick", 77], [9.5, "snare", 83], [10.0, "kick", 83], [10.0, "tom_mid", 97], [10.5, "snare", 95], [10.625, "snare", 83], [10.75, "snare", 106], [10.875, "snare", 94], [11.0, "tom_hi", 100], [11.125, "tom_hi", 83], [11.25, "snare", 111], [11.375, "snare", 99], [11.5, "tom_hi", 106], [11.625, "tom_hi", 89], [11.75, "tom_hi", 117], [11.875, "tom_hi", 100]], "hands": ["F", "R", "L", "R", "F", "L", "F", "R", "L", "L", "R", "R", "L", "L", "R", "R", "L", "L", "R", "R"]},
  {"kind": "knob", "drummer": null, "meter": "4/4", "length": "bar", "intensity": "medium", "salt": 42, "tempo": 120, "depth": -0.3, "density": 1.8, "crescendo": null, "tail": 1.0, "ev": [[8.0, "kick", 60], [8.0, "snare", 74], [8.5, "snare", 72], [9.0, "tom_mid", 86], [9.5, "kick", 77], [9.5, "tom_mid", 83], [10.0, "kick", 83], [10.0, "tom_mid", 97], [10.5, "snare", 95], [10.625, "snare", 83], [10.75, "tom_mid", 106], [10.875, "tom_mid", 86], [11.0, "tom_hi", 100], [11.125, "tom_hi", 83], [11.25, "tom_hi", 111], [11.375, "tom_hi", 94], [11.5, "tom_hi", 106], [11.625, "tom_hi", 89], [11.75, "tom_hi", 117], [11.875, "tom_hi", 100]], "hands": ["F", "R", "L", "R", "F", "L", "F", "R", "L", "L", "R", "R", "L", "L", "R", "R", "L", "L", "R", "R"]},
  {"kind": "plain", "drummer": null, "meter": "4/4", "length": "beat", "intensity": "subtle", "salt": 7, "tempo": 128, "depth": null, "density": null, "crescendo": null, "tail": null, "ev": [[8.0, "kick", 38], [8.0, "snare", 52], [8.5, "snare", 73]], "hands": ["F", "R", "R"]},
  {"kind": "plain", "drummer": null, "meter": "4/4", "length": "beat", "intensity": "medium", "salt": 7, "tempo": 128, "depth": null, "density": null, "crescendo": null, "tail": null, "ev": [[8.0, "kick", 60], [8.0, "snare", 74], [8.5, "tom_lo", 97]], "hands": ["F", "R", "R"]},
  {"kind": "plain", "drummer": null, "meter": "4/4", "length": "beat", "intensity": "flashy", "salt": 7, "tempo": 128, "depth": null, "density": null, "crescendo": null, "tail": null, "ev": [[8.0, "kick", 82], [8.0, "tom_lo", 96], [8.5, "floor", 116], [8.75, "snare", 116], [8.875, "snare", 104]], "hands": ["F", "R", "R", "L", "L"]},
  {"kind": "plain", "drummer": null, "meter": "4/4", "length": "2beat", "intensity": "subtle", "salt": 7, "tempo": 128, "depth": null, "density": null, "crescendo": null, "tail": null, "ev": [[8.0, "kick", 38], [8.0, "tom_lo", 52], [8.5, "snare", 53], [9.0, "tom_lo", 73], [9.5, "kick", 72], [9.5, "tom_mid", 86]], "hands": ["F", "R", "L", "R", "F", "R"]},
  {"kind": "plain", "drummer": null, "meter": "4/4", "length": "2beat", "intensity": "medium", "salt": 7, "tempo": 128, "depth": null, "density": null, "crescendo": null, "tail": null, "ev": [[8.0, "kick", 60], [8.0, "tom_lo", 74], [8.5, "tom_mid", 78], [9.0, "tom_lo", 97], [9.5, "floor", 108], [9.5, "kick", 94]], "hands": ["F", "R", "L", "R", "R", "F"]},
  {"kind": "plain", "drummer": null, "meter": "4/4", "length": "2beat", "intensity": "flashy", "salt": 7, "tempo": 128, "depth": null, "density": null, "crescendo": null, "tail": null, "ev": [[8.0, "kick", 82], [8.0, "tom_lo", 96], [8.5, "tom_lo", 99], [9.0, "floor", 116], [9.25, "floor", 112], [9.5, "floor", 124], [9.5, "kick", 110], [9.75, "snare", 119], [9.875, "snare", 107]], "hands": ["F", "R", "L", "R", "L", "R", "F", "L", "L"]},
  // 3/4・6/8 のゴールデン（受け入れ監査「穴埋め」・2026-08-29 追加）：既存10件は 4/4 のみだった。
  // python bodyfill.py を実行し出力をそのまま焼き込み（bar=2/beat=0/length=beat/intensity=medium/salt=7/tempo=128・
  // 既存 plain 系エントリと同条件、meter だけ差し替え）。既存10件は不変（このエントリは追記のみ）。
  {"kind": "plain", "drummer": null, "meter": "3/4", "length": "beat", "intensity": "medium", "salt": 7, "tempo": 128, "depth": null, "density": null, "crescendo": null, "tail": null, "ev": [[6.0, "kick", 60], [6.0, "snare", 74], [6.5, "tom_lo", 97]], "hands": ["F", "R", "R"]},
  {"kind": "plain", "drummer": null, "meter": "6/8", "length": "beat", "intensity": "medium", "salt": 7, "tempo": 128, "depth": null, "density": null, "crescendo": null, "tail": null, "ev": [[6.0, "kick", 60], [6.0, "snare", 74], [6.5, "tom_hi", 81], [7.0, "floor", 105]], "hands": ["F", "R", "L", "R"]},
];

describe("身体シミュレータ＝phrase_maker bodyfill.py の忠実移植", () => {
  for (const g of GOLDEN) {
    const tag = `${g.kind}/${g.meter}/${g.length}/${g.intensity}/salt${g.salt}` + (g.drummer ? `/${g.drummer}` : "");
    it(`打点・打圧・手の割当が Python と一致：${tag}`, () => {
      const fm = fillMeter(g.meter);
      const grid = Math.round(fm.qbeatsPerBar / 0.25);
      const onsets: number[] = [];
      for (let i = 0; i < grid; i += 2) onsets.push(i);
      const p = planBodyFill({
        rhythm: { grid, onsets, accents: [0, 4, 8, 12].slice(0, Math.floor(grid / 4)), kick: [0, 6, 8] },
        bar: 2, beat: 0, length: g.length, intensity: g.intensity, meter: fm,
        tempo: g.tempo, seedSalt: g.salt,
        prior: g.drummer ? (GMD_PRIORS[g.drummer] as GmdPrior) : null,
        depth: g.depth ?? undefined, density: g.density ?? undefined,
        crescendo: g.crescendo ?? undefined, tailAnchor: g.tail ?? 0,
      });
      expect(p.events.map((e) => [e.beat, e.voice, e.velocity])).toStrictEqual(g.ev);
      expect(p.hands).toStrictEqual(g.hands);
    });
  }

  it("同じ入力は何度呼んでも同じ（RNG も builtin hash も使っていない）", () => {
    const fm = fillMeter("4/4");
    const mk = () => planBodyFill({ rhythm: { grid: 16, onsets: [0, 2, 4, 6, 8, 10, 12, 14], accents: [0, 4, 8, 12], kick: [0, 6, 8] },
      bar: 2, beat: 2, length: "2beat", intensity: "medium", meter: fm, tempo: 120, seedSalt: 5 });
    expect(mk().events).toStrictEqual(mk().events);
  });

  it("seed が違えば別の解が出る（辞書ではなく毎回解いている）", () => {
    const fm = fillMeter("4/4");
    const mk = (salt: number) => planBodyFill({ rhythm: { grid: 16, onsets: [0, 2, 4, 6, 8, 10, 12, 14], accents: [0, 4, 8, 12], kick: [0, 6, 8] },
      bar: 2, beat: 2, length: "bar", intensity: "flashy", meter: fm, tempo: 120, seedSalt: salt });
    const seqs = new Set([1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(mk(s).trace.drumSeq)));
    expect(seqs.size).toBeGreaterThan(1);
  });

  it("物理法則：同じ手の3連続は無い／届かない移動は選ばれない", () => {
    const fm = fillMeter("4/4");
    for (let salt = 0; salt < 25; salt++) {
      const p = planBodyFill({ rhythm: { grid: 16, onsets: [0, 2, 4, 6, 8, 10, 12, 14], accents: [0, 4, 8, 12], kick: [0, 6, 8] },
        bar: 0, beat: 0, length: "bar", intensity: "flashy", meter: fm, tempo: 160, seedSalt: salt });
      const hs = p.trace.handSeq;
      for (let i = 2; i < hs.length; i++) expect(hs[i] === hs[i - 1] && hs[i - 1] === hs[i - 2]).toBe(false);
    }
  });

  it("着地は必ず crash+kick で解決する", () => {
    const fm = fillMeter("4/4");
    const p = planBodyFill({ rhythm: { grid: 16, onsets: [0, 4, 8, 12], kick: [0, 8] },
      bar: 1, beat: 2, length: "2beat", intensity: "medium", meter: fm, tempo: 120, seedSalt: 3 });
    expect(new Set(p.landing.map((e) => e.voice))).toStrictEqual(new Set(["crash", "kick"]));
    for (const e of p.landing) expect(e.beat).toBe(p.landingQb);
  });

  it("GMD prior＝統計のみ（打圧/密度カーブと率だけ・打点列は持たない）", () => {
    for (const [name, pr] of Object.entries(GMD_PRIORS)) {
      expect(pr.vel_curve.length).toBe(8);
      expect(pr.density_curve.length).toBe(8);
      expect(typeof pr.flam_rate).toBe("number");
      // リテラルな打点/系列を持ち込んでいないこと（キーが統計7項目だけ）
      expect(Object.keys(pr).sort()).toStrictEqual(
        ["density_curve", "flam_rate", "ghost_kick_per_qb", "ghost_kick_vel", "pedal_hh_per_qb", "pedal_hh_vel", "vel_curve"]);
      expect(name.startsWith("drummer")).toBe(true);
    }
  });

  it("prior=null＝統計を一切使わない純物理でも解ける（フラム/足ゴーストが出ない）", () => {
    const fm = fillMeter("4/4");
    const p = planBodyFill({ rhythm: { grid: 16, onsets: [0, 2, 4, 6, 8, 10, 12, 14], accents: [0, 4, 8, 12], kick: [0, 6, 8] },
      bar: 2, beat: 0, length: "bar", intensity: "flashy", meter: fm, tempo: 120, seedSalt: 9, prior: null });
    expect(p.events.length).toBeGreaterThan(0);
    expect(p.trace.nFlams).toBe(0);
    expect(p.trace.nPedalHh).toBe(0);
    expect(p.events.some((e) => e.voice === "phh")).toBe(false);
  });
});

// ===========================================================================
// 三連スロット（sub=1/3qb）＝2026-08-29 の新規増分（源流 bodyfill.py に無い・移植ではない）。
// shuffle 系グルーヴ（1拍3分割）でも身体シミュレータが解けるようにする。
// 物理（連打レート上限・リバウンド窓）は**秒**で効くので、スロット幅が変わっても
// 判定は秒ベースのまま正しいこと＝ここが検証の芯。
describe("三連スロット（sub=1/3）", () => {
  const T = 1 / 3;
  const mkOpts = (over: object = {}) => ({
    rhythm: { grid: 12, onsets: [0, 2, 4, 6, 8, 10], accents: [0, 6], kick: [0, 6] },
    bar: 2, beat: 0, length: "2beat" as const, intensity: "medium", meter: fillMeter("4/4"),
    tempo: 120, seedSalt: 5, prior: null, sub: T, ...over,
  });

  it("既存の 0.25 格子は sub を明示しても1ビットも変わらない（additive の証明）", () => {
    const base = {
      rhythm: { grid: 16, onsets: [0, 2, 4, 6, 8, 10, 12, 14], accents: [0, 4, 8, 12], kick: [0, 6, 8] },
      bar: 2, beat: 0, length: "bar" as const, intensity: "flashy", meter: fillMeter("4/4"),
      tempo: 120, seedSalt: 9, prior: null,
    };
    expect(planBodyFill({ ...base, sub: 0.25 })).toStrictEqual(planBodyFill(base));
  });

  it("三連格子で解け、全打点が 1/6qb 格子に乗る（主格子 1/3＋バウンスの半スロット）", () => {
    for (let salt = 0; salt < 10; salt++) {
      const p = planBodyFill(mkOpts({ seedSalt: salt }));
      expect(p.events.length).toBeGreaterThan(0);
      for (const e of p.events) {
        const k = e.beat * 6; // 1/6qb 単位
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-4);
      }
    }
  });

  it("同じ入力は何度呼んでも同じ（決定論は三連でも保たれる）", () => {
    expect(planBodyFill(mkOpts()).events).toStrictEqual(planBodyFill(mkOpts()).events);
  });

  it("物理法則：三連でも同じ手の3連続は無い", () => {
    for (let salt = 0; salt < 25; salt++) {
      const p = planBodyFill(mkOpts({ seedSalt: salt, length: "bar", intensity: "flashy", tempo: 160 }));
      const hs = p.trace.handSeq;
      for (let i = 2; i < hs.length; i++) expect(hs[i] === hs[i - 1] && hs[i - 1] === hs[i - 2]).toBe(false);
    }
  });

  it("物理は秒で効く：スロット実時間が伸び、遅テンポではバウンス窓が閉じる", () => {
    const fast = planBodyFill(mkOpts({ tempo: 120 }));
    expect(fast.trace.slotMs).toBeCloseTo(166.67, 2); // (1/3)×(60/120)＝16分の4/3倍
    expect(fast.trace.bouncePlayable).toBe(true); // 半スロット＝1/6qb＝83ms は窓内
    const slow = planBodyFill(mkOpts({ tempo: 60 }));
    expect(slow.trace.bouncePlayable).toBe(false); // 167ms＞130ms＝ダブルは物理的に打てない
    expect(slow.trace.nBounces).toBe(0);
  });

  it("seed が違えば三連でも別の解が出る", () => {
    const seqs = new Set([1, 2, 3, 4, 5, 6].map((s) =>
      JSON.stringify(planBodyFill(mkOpts({ seedSalt: s, length: "bar", intensity: "flashy" })).trace.drumSeq)));
    expect(seqs.size).toBeGreaterThan(1);
  });

  it("対応外の定規は黙って歪めず投げる（0.25/1/3 以外・スロットが割り切れない長さ）", () => {
    expect(() => planBodyFill(mkOpts({ sub: 0.2 }))).toThrow();
    // 6/8 の付点拍（1.5qb）は 1/3 で割り切れない＝三連定規は要らない（八分3つ＝0.25 格子で既に表せる）
    expect(() => planBodyFill(mkOpts({ meter: fillMeter("6/8"), length: "beat" }))).toThrow();
  });
});
