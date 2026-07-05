import { describe, it, expect } from "vitest";
import { sessionIdForThread, isIdle } from "../src/chat-session";

// #100④-S：thread から claude session_id を決定的に導出（DB列不要・再起動耐性）。
// 「1 thread = 1 claude session = 1 履歴」の土台＝同じ thread は常に同じ session を resume する。
describe("sessionIdForThread", () => {
  it("決定的：同じ thread は常に同じ id", () => {
    expect(sessionIdForThread("global")).toBe(sessionIdForThread("global"));
    expect(sessionIdForThread("neta-abc")).toBe(sessionIdForThread("neta-abc"));
  });

  it("衝突しない：違う thread は違う id", () => {
    expect(sessionIdForThread("global")).not.toBe(sessionIdForThread("neta-abc"));
    expect(sessionIdForThread("neta-1")).not.toBe(sessionIdForThread("neta-2"));
  });

  it("妥当な UUIDv5 形式（claude --session-id が受ける）", () => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(sessionIdForThread("global")).toMatch(re);
    expect(sessionIdForThread("日本語スレッド")).toMatch(re);
    expect(sessionIdForThread("")).toMatch(re);
  });
});

// #100④-S2：idle reap の契約。無発言が続いた proc を kill（session_id は残置→次発言で resume）。
describe("isIdle", () => {
  const IDLE = 15 * 60_000;
  it("制限内は idle でない", () => {
    expect(isIdle(1_000_000, 1_000_000 + IDLE - 1, IDLE)).toBe(false);
  });
  it("制限到達で idle", () => {
    expect(isIdle(1_000_000, 1_000_000 + IDLE, IDLE)).toBe(true);
    expect(isIdle(1_000_000, 1_000_000 + IDLE + 5000, IDLE)).toBe(true);
  });
  it("一度も発言してない(=0)は idle 扱いしない（reap 対象外）", () => {
    expect(isIdle(0, 9_999_999, IDLE)).toBe(false);
  });
});
