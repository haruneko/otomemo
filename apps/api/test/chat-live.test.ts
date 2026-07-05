import { describe, it, expect } from "vitest";
import { beginTurn, pushTurnEvent, endTurn, isTurnLive, attachTurn, DONE } from "../src/chat-live";

describe("chat-live（走行中ターンのバッファ＋再アタッチ）", () => {
  it("ターンが無ければ attachTurn は null（呼び手は即done）", () => {
    expect(isTurnLive("nope")).toBe(false);
    expect(attachTurn("nope", () => {})).toBeNull();
  });

  it("開始→push→購読者へ配布、isTurnLive は走行中 true", () => {
    beginTurn("t1");
    expect(isTurnLive("t1")).toBe(true);
    const got: unknown[] = [];
    const detach = attachTurn("t1", (e) => got.push(e));
    expect(detach).toBeTypeOf("function");
    pushTurnEvent("t1", { type: "assistant", n: 1 });
    pushTurnEvent("t1", { type: "assistant", n: 2 });
    expect(got).toEqual([{ type: "assistant", n: 1 }, { type: "assistant", n: 2 }]);
    endTurn("t1");
  });

  it("途中参加（遅れて attach）でもバッファを頭からリプレイして受け取る", () => {
    beginTurn("t2");
    pushTurnEvent("t2", { type: "assistant", step: "a" });
    pushTurnEvent("t2", { type: "assistant", step: "b" });
    const got: unknown[] = [];
    attachTurn("t2", (e) => got.push(e)); // b の後から参加
    // 参加時点でバッファ2件を即受領
    expect(got).toEqual([{ type: "assistant", step: "a" }, { type: "assistant", step: "b" }]);
    pushTurnEvent("t2", { type: "result", result: "done" });
    expect(got).toHaveLength(3);
    endTurn("t2");
  });

  it("endTurn は全購読者へ DONE を流し、以後は破棄（isTurnLive=false, attach=null）", () => {
    beginTurn("t3");
    const got: unknown[] = [];
    attachTurn("t3", (e) => got.push(e));
    pushTurnEvent("t3", { type: "assistant", x: 1 });
    endTurn("t3");
    expect(got[got.length - 1]).toBe(DONE);
    expect(isTurnLive("t3")).toBe(false);
    expect(attachTurn("t3", () => {})).toBeNull();
    // 完了後の push は無視（例外なく黙殺）
    expect(() => pushTurnEvent("t3", { type: "assistant", x: 2 })).not.toThrow();
    expect(got).toHaveLength(2); // assistant + DONE のみ
  });

  it("detach 後は配布されない", () => {
    beginTurn("t4");
    const got: unknown[] = [];
    const detach = attachTurn("t4", (e) => got.push(e))!;
    pushTurnEvent("t4", { type: "assistant", x: 1 });
    detach();
    pushTurnEvent("t4", { type: "assistant", x: 2 });
    expect(got).toEqual([{ type: "assistant", x: 1 }]);
    endTurn("t4");
  });

  it("beginTurn の再呼び出しは前ターンを作り直す（1 thread=1 走行）", () => {
    beginTurn("t5");
    pushTurnEvent("t5", { type: "assistant", gen: 1 });
    beginTurn("t5"); // やり直し
    const got: unknown[] = [];
    attachTurn("t5", (e) => got.push(e));
    expect(got).toEqual([]); // 新ターンのバッファは空
    pushTurnEvent("t5", { type: "assistant", gen: 2 });
    expect(got).toEqual([{ type: "assistant", gen: 2 }]);
    endTurn("t5");
  });
});
