import { describe, it, expect } from "vitest";
import { nearestBeatIndex, autoDownbeatOffset } from "../src/audio-grid";

describe("audio-grid（拍/小節グリッド）", () => {
  const beats = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]; // 8拍・0.5s間隔

  it("nearestBeatIndex：最寄ビート", () => {
    expect(nearestBeatIndex(beats, 0.0)).toBe(0);
    expect(nearestBeatIndex(beats, 1.1)).toBe(2); // 1.0
    expect(nearestBeatIndex(beats, 1.3)).toBe(3); // 1.5 が近い
    expect(nearestBeatIndex([], 1)).toBe(-1);
  });

  it("autoDownbeatOffset：コード変化が小節頭に最も乗る位相を返す（4/4）", () => {
    // コード変化を beat index 2,6（=位相2 で小節頭に乗る／meter4）に置く
    const changes = [beats[2]!, beats[6]!]; // 1.0, 3.0
    expect(autoDownbeatOffset(beats, changes, 4)).toBe(2);
  });

  it("コード変化が拍0,4（位相0）なら 0", () => {
    const changes = [beats[0]!, beats[4]!]; // 0.0, 2.0
    expect(autoDownbeatOffset(beats, changes, 4)).toBe(0);
  });

  it("データ不足は 0", () => {
    expect(autoDownbeatOffset([], [1], 4)).toBe(0);
    expect(autoDownbeatOffset(beats, [], 4)).toBe(0);
  });
});
