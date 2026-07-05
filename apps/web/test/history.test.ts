import { describe, it, expect } from "vitest";
import { emptyHistory, pushHistory, undoHistory, redoHistory } from "../src/history";

// エディタ Undo/Redo の純ロジック（design 決定U1）。値は何でもよい（snapshot想定）。
describe("history（push/undo/redo）", () => {
  it("push＝変化前をpastへ・futureはクリア", () => {
    let h = emptyHistory<number>();
    h = pushHistory(h, 1); // 1→2 の前に 1 を積む
    h = pushHistory(h, 2);
    expect(h.past).toEqual([1, 2]);
    expect(h.future).toEqual([]);
  });

  it("undo＝現在をfutureへ・pastの末尾を返す", () => {
    let h = emptyHistory<string>();
    h = pushHistory(h, "a"); // 現在は "b" 相当
    const r = undoHistory(h, "b");
    expect(r).not.toBeNull();
    expect(r!.value).toBe("a"); // "a" に戻る
    expect(r!.history.past).toEqual([]);
    expect(r!.history.future).toEqual(["b"]);
  });

  it("redo＝undoの逆（futureの末尾を返し現在をpastへ）", () => {
    let h = emptyHistory<string>();
    h = pushHistory(h, "a");
    const u = undoHistory(h, "b")!; // past=[] future=["b"] value="a"
    const r = redoHistory(u.history, "a"); // "a"の状態から redo
    expect(r!.value).toBe("b");
    expect(r!.history.past).toEqual(["a"]);
    expect(r!.history.future).toEqual([]);
  });

  it("空pastのundo/空futureのredoはnull", () => {
    expect(undoHistory(emptyHistory<number>(), 5)).toBeNull();
    expect(redoHistory(emptyHistory<number>(), 5)).toBeNull();
  });

  it("新規pushでfutureは捨てられる（undo後に編集したらredo不可）", () => {
    let h = emptyHistory<string>();
    h = pushHistory(h, "a");
    const u = undoHistory(h, "b")!; // future=["b"]
    const h2 = pushHistory(u.history, "a"); // "a"から別編集→ future捨てる
    expect(h2.future).toEqual([]);
    expect(redoHistory(h2, "c")).toBeNull();
  });

  it("深さ上限を超えたら古いものから捨てる", () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 5; i++) h = pushHistory(h, i, 3); // cap=3
    expect(h.past).toEqual([2, 3, 4]); // 古い 0,1 は捨てられる
  });
});
