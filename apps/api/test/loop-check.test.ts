import { describe, it, expect } from "vitest";
import { checkLoop } from "../src/music/loopCheck";

// WP-X2 ゲームBGMループ境界チェック（純関数・指摘のみ）。正典＝docs/research/2026-07-14-intro-outro-game-loop.md §7.2。
const findingOf = (r: { findings: { code: string; severity: string }[] }, code: string) => r.findings.find((f) => f.code === code);

describe("checkLoop：ループ境界の機械判定（指摘のみ・自動修正しない）", () => {
  it("開いた境界（末尾＝V／ハーフ終止）は harmony=ok＝回り続ける", () => {
    // C major: F G C ... F G（末尾 V で開く）。key=0/major を明示して決定的に。
    const r = checkLoop({
      loop: { startBar: 0, endBar: 8 },
      meter: "4/4",
      key: 0,
      mode: "major",
      chords: [{ root: 0 }, { root: 5 }, { root: 7 }, { root: 5 }, { root: 7 }],
    });
    const cad = findingOf(r, "boundary-cadence")!;
    expect(cad.severity).toBe("ok"); // half＝開いている
  });

  it("完全終止（…V→I）で閉じていると harmony=warn（回り続けたいなら開けと指摘）", () => {
    const r = checkLoop({
      loop: { startBar: 0, endBar: 8 },
      meter: "4/4",
      key: 0,
      mode: "major",
      chords: [{ root: 5 }, { root: 7 }, { root: 0 }], // IV V I ＝ authentic
    });
    const cad = findingOf(r, "boundary-cadence")!;
    expect(cad.severity).toBe("warn");
    // 末尾→頭が D→T（V→I）循環なら info で肯定（末尾 I・頭 IV なのでここでは出ない）
  });

  it("末尾→頭が V→I 循環のとき boundary-wrap=info で肯定（末尾 D・頭 T）", () => {
    const r = checkLoop({
      loop: { startBar: 0, endBar: 4 },
      meter: "4/4",
      key: 0,
      mode: "major",
      chords: [{ root: 0 }, { root: 5 }, { root: 7 }], // 頭 I(T) … 末尾 V(D)
    });
    const wrap = findingOf(r, "boundary-wrap");
    expect(wrap?.severity).toBe("info");
  });

  it("ループ長が半端小節（整数でない）は warn", () => {
    const r = checkLoop({ loop: { startBar: 0, endBar: 7.5 }, meter: "4/4" });
    expect(findingOf(r, "loop-length-integer")!.severity).toBe("warn");
    const ok = checkLoop({ loop: { startBar: 0, endBar: 16 }, meter: "4/4" });
    expect(findingOf(ok, "loop-length-integer")!.severity).toBe("ok");
  });

  it("境界を跨ぐ持続ノートを検出（4/4・endBar=4→16拍目を跨ぐロングトーン）", () => {
    const r = checkLoop({
      loop: { startBar: 0, endBar: 4 }, // loopEnd = 4小節 = 16拍
      meter: "4/4",
      melody: [
        { pitch: 60, start: 0, dur: 1 },
        { pitch: 62, start: 15, dur: 4 }, // 15拍開始・4拍長→19拍まで＝16拍(境界)を跨ぐ
      ],
    });
    const cross = findingOf(r, "crossing-note")!;
    expect(cross.severity).toBe("warn");
  });

  it("境界を跨がないメロは crossing-note=ok", () => {
    const r = checkLoop({
      loop: { startBar: 0, endBar: 4 },
      meter: "4/4",
      melody: [
        { pitch: 60, start: 0, dur: 1 },
        { pitch: 62, start: 14, dur: 1 }, // 15拍で終わる＝跨がない
      ],
    });
    expect(findingOf(r, "crossing-note")!.severity).toBe("ok");
  });

  it("末尾音→頭音の跳躍が大きい（>完全5度）と melody=warn／近接は ok", () => {
    const big = checkLoop({
      loop: { startBar: 0, endBar: 2 },
      meter: "4/4",
      melody: [
        { pitch: 60, start: 0, dur: 1 }, // 頭
        { pitch: 74, start: 6, dur: 1 }, // 末尾 …差 14半音
      ],
    });
    expect(findingOf(big, "boundary-melody-interval")!.severity).toBe("warn");
    const near = checkLoop({
      loop: { startBar: 0, endBar: 2 },
      meter: "4/4",
      melody: [
        { pitch: 60, start: 0, dur: 1 },
        { pitch: 62, start: 6, dur: 1 }, // 差 2半音＝近接
      ],
    });
    expect(findingOf(near, "boundary-melody-interval")!.severity).toBe("ok");
  });

  it("tailBars 未設定は tail=info（余韻の重ね未指定）／設定時は出ない", () => {
    const r = checkLoop({ loop: { startBar: 0, endBar: 8 }, meter: "4/4" });
    expect(findingOf(r, "tail-unset")?.severity).toBe("info");
    const withTail = checkLoop({ loop: { startBar: 0, endBar: 8, tailBars: 1 }, meter: "4/4" });
    expect(findingOf(withTail, "tail-unset")).toBeUndefined();
  });
});
