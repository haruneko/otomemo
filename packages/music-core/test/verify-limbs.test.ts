// M4＝四肢衝突をグルーヴ全体へ一般化（drumFill.ts の判定を verify/limbs.ts へ切り出し）。
// 源流：drums/gen2/src/validate.py（判定）・gm.py（LIMB 表）。
import { describe, it, expect } from "vitest";
import {
  assertCoverage, assertGate, grooveLimbGate, limbEventsFromLanes, limbOfGmNote,
  validateLimbEvents, validateLimbs, type FillEvent, type GrooveLane, type LimbEvent,
} from "../src/index";

// 8ビート（drumLibrary beat8.basic と同じ形・16格子）。
const BEAT8: GrooveLane[] = [
  { name: "HiHat", midi: 42, hits: [0, 2, 4, 6, 8, 10, 12, 14] },
  { name: "Snare", midi: 38, hits: [4, 12] },
  { name: "Kick", midi: 36, hits: [0, 8] },
];

describe("切り出しの同一性＝フィル経路のメッセージ・丸めは 1文字も変えない", () => {
  it("validateLimbs（フィル）は従来どおりの文言で違反を返す", () => {
    const bad: FillEvent[] = [
      { beat: 0, voice: "kick", velocity: 100 },
      { beat: 0, voice: "kick", velocity: 100 },
    ];
    const r = validateLimbs(bad);
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([
      "beat 0: 2 kick voices (need 1 right foot) kick,kick",
      "beat 0: duplicate voice at same instant kick,kick",
    ]);
    expect(r.maxSimul).toBe(2);
  });
  it("小数拍は round4 で表示される（従来と同じ）", () => {
    const bad: FillEvent[] = [
      { beat: 1.333333333, voice: "snare", velocity: 90 },
      { beat: 1.333333333, voice: "tom_hi", velocity: 90 },
      { beat: 1.333333333, voice: "tom_mid", velocity: 90 },
    ];
    expect(validateLimbs(bad).problems).toEqual(["beat 1.3333: 3 hand voices > 2 hands snare,tom_hi,tom_mid"]);
  });
  it("汎用版は同じ入力に同じ判定を返す（単位名だけ差し替え可能）", () => {
    const evs: LimbEvent[] = [
      { at: 0, voice: "kick", limb: "RF" },
      { at: 0, voice: "kick", limb: "RF" },
    ];
    expect(validateLimbEvents(evs).problems).toEqual([
      "beat 0: 2 kick voices (need 1 right foot) kick,kick",
      "beat 0: duplicate voice at same instant kick,kick",
    ]);
    expect(validateLimbEvents(evs, 1e-6, "step").problems[0]).toMatch(/^step 0: /);
  });
});

describe("GM 番号→四肢（gm.py LIMB の一般化）", () => {
  it("35/36=右足・44=左足・他は手", () => {
    expect(limbOfGmNote(36)).toBe("RF");
    expect(limbOfGmNote(35)).toBe("RF");
    expect(limbOfGmNote(44)).toBe("LF");
    for (const m of [37, 38, 39, 41, 42, 45, 46, 48, 49, 51, 53, 54, 69]) expect(limbOfGmNote(m)).toBe("HAND");
  });
  it("レーン→イベント：ゴーストとスネアは別 voice（同 GM 番号でも重複扱いにしない）", () => {
    const evs = limbEventsFromLanes([
      { name: "Snare", midi: 38, hits: [4] },
      { name: "SnareGhost", midi: 38, hits: [4] },
    ]);
    expect(evs.map((e) => e.voice)).toEqual(["Snare", "SnareGhost"]);
    expect(validateLimbEvents(evs).ok).toBe(true);
  });
});

describe("グルーヴ全体のゲート（陽性・陰性対照・被覆率）", () => {
  it("陽性：8ビートは弾ける＋同時打点があるので被覆率 > 0", () => {
    const g = grooveLimbGate(BEAT8);
    expect(g.pass).toBe(true);
    expect(() => assertGate(g)).not.toThrow();
    expect(g.coverage.applied).toBe(4);   // 2打点以上の時刻＝step 0,4,8,12
    expect(g.coverage.total).toBe(8);
    expect(() => assertCoverage(g, 0.2)).not.toThrow();
  });
  it("陰性対照：足が2本required（キック二重）／手が3本 は落ちる", () => {
    const twoKicks = grooveLimbGate([...BEAT8, { name: "Kick2", midi: 36, hits: [0] }]);
    expect(twoKicks.pass).toBe(false);
    expect(twoKicks.problems.join()).toMatch(/kick voices \(need 1 right foot\)/);
    const twoPedals = grooveLimbGate([
      { name: "PedalHat", midi: 44, hits: [2] },
      { name: "PedalHat2", midi: 44, hits: [2] },
    ]);
    expect(twoPedals.problems.join()).toMatch(/pedal-hat voices \(need 1 left foot\)/);
  });
  it("空虚な合格を暴く：同時打点が無いグルーヴは被覆率 0（合格しても何も証明していない）", () => {
    const solo = grooveLimbGate([{ name: "Kick", midi: 36, hits: [0, 4, 8, 12] }]);
    expect(solo.pass).toBe(true);
    expect(solo.coverage.applied).toBe(0);
    expect(() => assertCoverage(solo, 0.1)).toThrow(/検査が効いていない/);
  });
});

describe("変異検査（§6-4 #6 (m3)＝出力に故障を注入）", () => {
  it("(m3) ある時刻に手を1本足すたび、3本目でゲートが落ちる", () => {
    const at4 = (n: number): GrooveLane[] => {
      const extra: GrooveLane[] = [];
      for (let i = 0; i < n; i++) extra.push({ name: `Tom${i}`, midi: 45 + i, hits: [4] });
      return [...BEAT8, ...extra];
    };
    expect(grooveLimbGate(at4(0)).pass).toBe(true);  // step 4: HiHat+Snare = 手2本
    expect(grooveLimbGate(at4(1)).pass).toBe(false); // 手3本
    expect(grooveLimbGate(at4(3)).problems.join()).toMatch(/simultaneous voices > 4/);
  });
  it("(m2 相当) キックのレーンを1つ複製すると RF 制約が落ちる＝不変条件は空虚ではない", () => {
    expect(grooveLimbGate(BEAT8).pass).toBe(true);
    expect(grooveLimbGate([...BEAT8, { name: "KickDup", midi: 36, hits: [8] }]).pass).toBe(false);
  });
});
