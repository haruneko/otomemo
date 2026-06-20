import { describe, it, expect } from "vitest";

// S0: テスト基盤が緑になることだけ確認する最小スモーク。
// 実体（neta CRUD・検索・MCP）は S1 で TDD。
describe("api smoke", () => {
  it("test harness runs", () => {
    expect(1 + 1).toBe(2);
  });
});
