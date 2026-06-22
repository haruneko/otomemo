import { describe, it, expect } from "vitest";
// 連想エンジン：代替コード＝機能代理/相対/セカンダリードミナント/裏コード/借用 を決定的に列挙（データ不要）。
import { substitutesOf } from "../src/music";

const has = (subs: { degree: number; quality: string; kind: string }[], degree: number, quality: string, kind?: string) =>
  subs.some((s) => s.degree === degree && s.quality === quality && (kind ? s.kind === kind : true));

describe("substitutesOf（コードの代替候補）", () => {
  it("I(0) の機能代理＝iii(4m)/vi(9m)、相対も vi(9m)", () => {
    const s = substitutesOf({ degree: 0, quality: "" }, { mode: "major" });
    expect(has(s, 4, "m", "functional")).toBe(true);
    expect(has(s, 9, "m", "functional")).toBe(true);
    expect(has(s, 9, "m", "relative")).toBe(true);
  });
  it("V7(7) は裏コード bII7(1,7)＋機能代理 vii°(11,dim)", () => {
    const s = substitutesOf({ degree: 7, quality: "7" }, { mode: "major" });
    expect(has(s, 1, "7", "tritone_sub")).toBe(true);
    expect(has(s, 11, "dim", "functional")).toBe(true);
  });
  it("next 指定でセカンダリードミナント（vi の前→ V7/vi = III7(4,7)）", () => {
    const s = substitutesOf({ degree: 0, quality: "" }, { mode: "major", next: { degree: 9, quality: "m" } });
    expect(has(s, 4, "7", "secondary_dominant")).toBe(true);
  });
  it("IV(5) はサブドミ機能代理 ii(2m)＋同主調借用 iv(5m)", () => {
    const s = substitutesOf({ degree: 5, quality: "" }, { mode: "major" });
    expect(has(s, 2, "m", "functional")).toBe(true);
    expect(has(s, 5, "m", "modal_interchange")).toBe(true);
  });
  it("入力そのものは候補に出さない・重複しない", () => {
    const s = substitutesOf({ degree: 0, quality: "" }, { mode: "major" });
    expect(s.some((x) => x.degree === 0 && x.quality === "")).toBe(false);
    const keys = s.map((x) => `${x.degree}:${x.quality}:${x.kind}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
