import { describe, it, expect } from "vitest";
// 連想エンジン S1：度数化＋調推定(上位2)＋進行の似ている度合い（純TSドメイン・データ不要）。
// design.md「連想エンジン」S1。ゴールデンテスト＝決定的に固定できる関係を assert。
import { toDegrees, detectKeyFromChords, progressionDistance } from "../src/music";

// C基準のコード列（content スキーマ＝{root:0-11, quality}）。
const CANON = [
  { root: 0, quality: "" }, { root: 7, quality: "" }, { root: 9, quality: "m" }, { root: 4, quality: "m" },
  { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 5, quality: "" }, { root: 7, quality: "" },
]; // C-G-Am-Em-F-C-F-G
const KOMURO = [
  { root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 7, quality: "" }, { root: 0, quality: "" },
]; // Am-F-G-C（6451）
const MARUNOUCHI = [
  { root: 5, quality: "maj7" }, { root: 4, quality: "7" }, { root: 9, quality: "m7" },
  { root: 7, quality: "m7" }, { root: 0, quality: "7" },
]; // FM7-E7-Am7-Gm7-C7

describe("toDegrees（コード列→C基準度数・調相対）", () => {
  it("key=0 はルートそのまま・quality保持", () => {
    expect(toDegrees(MARUNOUCHI, 0)).toEqual([
      { degree: 5, quality: "maj7" }, { degree: 4, quality: "7" }, { degree: 9, quality: "m7" },
      { degree: 7, quality: "m7" }, { degree: 0, quality: "7" },
    ]);
  });
  it("調を変えると度数が回る（同じ和音でも調相対）", () => {
    // 同じ FM7-E7-... を A(9) 基準で見ると度数がずれる
    const d = toDegrees(MARUNOUCHI, 9);
    expect(d.map((x) => x.degree)).toEqual([8, 7, 0, 10, 3]);
  });
  it("音名ルートも解釈（C#/Db）", () => {
    expect(toDegrees([{ root: "C#", quality: "" }], 0)[0].degree).toBe(1);
    expect(toDegrees([{ root: "Db", quality: "m" }], 0)[0]).toEqual({ degree: 1, quality: "m" });
  });
});

describe("detectKeyFromChords（コード列→調・上位2/決め打たない）", () => {
  it("カノンは C メジャーが第1候補", () => {
    const r = detectKeyFromChords(CANON);
    expect(r[0].key).toBe(0);
    expect(r[0].mode).toBe("major");
  });
  it("既定で2候補・スコア降順", () => {
    const r = detectKeyFromChords(CANON);
    expect(r.length).toBe(2);
    expect(r[0].score).toBeGreaterThanOrEqual(r[1].score);
  });
  it("relative（C/Am）の曖昧さ＝上位に両方が出る（決め打たない）", () => {
    const r = detectKeyFromChords(CANON, 4);
    expect(r.some((x) => x.key === 0 && x.mode === "major")).toBe(true);
    expect(r.some((x) => x.key === 9 && x.mode === "minor")).toBe(true);
  });
  it("空入力は安全（既定 C メジャー）", () => {
    expect(detectKeyFromChords([])).toEqual([{ key: 0, mode: "major", score: 0 }]);
  });
});

describe("progressionDistance（進行の似ている度合い＝度数列の編集距離）", () => {
  const dC = (cs: { root: number; quality: string }[]) => toDegrees(cs, 0);
  it("同一は0", () => {
    expect(progressionDistance(dC(CANON), dC(CANON))).toBe(0);
  });
  it("末尾だけ違う亜種 < 全然別物（小室）", () => {
    const variant = CANON.slice(0, 7).concat([{ root: 9, quality: "m" }]); // 末尾 G→Am の1箇所だけ
    const near = progressionDistance(dC(CANON), dC(variant));
    const far = progressionDistance(dC(CANON), dC(KOMURO));
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(far);
  });
  it("移調不変：同じ機能なら調が違っても距離0（度数化を通すから）", () => {
    // 丸の内を 7半音上げた進行（roots +7）を、調7基準で度数化＝元の度数と一致
    const up7 = MARUNOUCHI.map((c) => ({ root: (c.root + 7) % 12, quality: c.quality }));
    expect(progressionDistance(toDegrees(MARUNOUCHI, 0), toDegrees(up7, 7))).toBe(0);
  });
  it("片側空／長さ違いも sane（挿入削除コスト＝要素数差以上）", () => {
    expect(progressionDistance([], dC(KOMURO))).toBe(4); // 空 vs 4個＝4挿入
    expect(progressionDistance([], [])).toBe(0);
    const oneVsFour = progressionDistance(dC(KOMURO.slice(0, 1)), dC(KOMURO));
    expect(oneVsFour).toBeGreaterThanOrEqual(3); // 1個 vs 4個は最低3操作
  });
});

describe("detectKeyFromChords：dur 重みが調推定に効く", () => {
  it("長く鳴るコードのルートが調中心へ寄せる", () => {
    // C と A をそれぞれ長く鳴らすと、第1候補の主音が変わる（重み付けが効いている証拠）
    const cHeavy = detectKeyFromChords([
      { root: 0, quality: "", dur: 8 }, { root: 7, quality: "", dur: 1 }, { root: 5, quality: "", dur: 1 },
    ]);
    const aHeavy = detectKeyFromChords([
      { root: 9, quality: "m", dur: 8 }, { root: 7, quality: "", dur: 1 }, { root: 5, quality: "", dur: 1 },
    ]);
    expect(cHeavy[0].key).not.toBe(aHeavy[0].key); // 重みの偏りで第1候補が動く
  });
});
