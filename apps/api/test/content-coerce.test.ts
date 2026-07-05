import { describe, it, expect } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";

// 常駐LLMが content を「JSON文字列」で渡す param 揺れの根治（保存できない＝二重エンコードで読めない、の修正）。
// 文字列の content がオブジェクト/配列にparseできる時は実体化して格納し、読み戻しでオブジェクトになる。

const core = () => new Core(openDb(":memory:"));

describe("content の param揺れ吸収（文字列JSON→実体化）", () => {
  it("capture: content が JSON文字列でも、読み戻しはオブジェクト（content.notes が配列）", () => {
    const c = core();
    const n = c.createNeta({
      kind: "melody",
      content: '{"notes":[{"pitch":67,"start":0,"dur":1},{"pitch":64,"start":1,"dur":0.5}]}',
    });
    const got = c.getNeta(n.id)!;
    expect(typeof got.content).toBe("object");
    expect((got.content as { notes: unknown[] }).notes.length).toBe(2);
  });

  it("capture: content がオブジェクトのとき（正常系）も従来通りオブジェクトで戻る", () => {
    const c = core();
    const n = c.createNeta({ kind: "chord_progression", content: { chords: [{ root: 0, quality: "" }] } });
    const got = c.getNeta(n.id)!;
    expect((got.content as { chords: unknown[] }).chords.length).toBe(1);
  });

  it("revise: content を JSON文字列で更新しても実体化される", () => {
    const c = core();
    const n = c.createNeta({ kind: "melody", content: { notes: [] } });
    c.updateNeta(n.id, { content: '{"notes":[{"pitch":60,"start":0,"dur":1}]}' });
    const got = c.getNeta(n.id)!;
    expect((got.content as { notes: unknown[] }).notes.length).toBe(1);
  });

  it("生テキスト（JSONでない文字列）は壊さずそのまま", () => {
    const c = core();
    const n = c.createNeta({ kind: "lyric", content: "ただの歌詞テキスト" });
    const got = c.getNeta(n.id)!;
    expect(got.content).toBe("ただの歌詞テキスト");
  });
});
