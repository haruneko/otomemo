import { describe, it, expect } from "vitest";
import { RNG_SALT } from "../src/index";

// ── RNG ソルト表の凍結（M0契約 §4・§6①） ──
// 凍結する＝後で変えると全レシピの音が変わる。値のスナップショット＋役割間の非衝突を機械固定。
describe("RNG_SALT＝役割別ソルト表の凍結", () => {
  it("値スナップショット凍結（M0契約 §4：kick=+11…altTake=+43）", () => {
    expect(RNG_SALT).toMatchInlineSnapshot(`
      {
        "altTake": 43,
        "fill": 37,
        "ghost": 17,
        "hihat": 19,
        "jitter": 41,
        "kick": 11,
        "ride": 23,
        "snare": 13,
        "tom": 29,
      }
    `);
  });

  it("役割間でソルト値が衝突しない（同 seed で別役割の列が重ならない）", () => {
    const vals = Object.values(RNG_SALT);
    expect(new Set(vals).size).toBe(vals.length);
  });

  it("fill=+37 は将来枠として表に在る（現行 fill は生 seed＝注記のとおり実消費されない）", () => {
    // このテストは「値が表に凍結されている」ことのみ担保。resolve での実使用は M1 以降。
    expect(RNG_SALT.fill).toBe(37);
  });
});
