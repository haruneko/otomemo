import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { findProgressions } from "../src/progression-search";

let core: Core;
beforeEach(() => {
  core = new Core(openDb(":memory:"));
});

const chords = (cs: [number, string][]) => ({ chords: cs.map(([root, quality], i) => ({ root, quality, start: i, dur: 1 })) });

describe("findProgressions（進行の連想retrieval）", () => {
  it("タグで足切り（切ない の進行だけ）", () => {
    core.createNeta({ scope: "library", kind: "chord_progression", title: "暗い", content: chords([[9, "m"], [5, ""], [7, ""], [0, ""]]), tags: ["切ない"] });
    core.createNeta({ scope: "library", kind: "chord_progression", title: "明るい", content: chords([[0, ""], [5, ""], [7, ""]]), tags: ["明るい"] });
    const hits = findProgressions(core, { tags: ["切ない"] });
    expect(hits.length).toBe(1);
    expect(hits[0].title).toBe("暗い");
    expect(hits[0].matchedTags).toEqual(["切ない"]);
  });

  it("構造類似（like に近い進行が上位）", () => {
    core.createNeta({ scope: "library", kind: "chord_progression", title: "カノン寄り", key: 0, content: chords([[0, ""], [7, ""], [9, "m"], [4, "m"]]), tags: [] });
    core.createNeta({ scope: "library", kind: "chord_progression", title: "別物", key: 0, content: chords([[1, "dim"], [6, "aug"]]), tags: [] });
    const hits = findProgressions(core, { like: { chords: [{ root: 0, quality: "" }, { root: 7, quality: "" }, { root: 9, quality: "m" }, { root: 4, quality: "m" }], key: 0 } });
    expect(hits[0].title).toBe("カノン寄り");
    expect(hits[0].similarity).toBeGreaterThan(hits[1].similarity);
  });

  it("人気度タグ（ヒット/定番）が同点を押し上げる", () => {
    core.createNeta({ scope: "library", kind: "chord_progression", title: "普通", content: chords([[0, ""]]), tags: ["明るい"] });
    core.createNeta({ scope: "library", kind: "chord_progression", title: "ヒット曲", content: chords([[0, ""]]), tags: ["明るい", "ヒット"] });
    const hits = findProgressions(core, { tags: ["明るい"] });
    expect(hits[0].title).toBe("ヒット曲"); // 人気度ぶん上
  });

  it("該当なしは空（捏造しない）", () => {
    core.createNeta({ scope: "library", kind: "chord_progression", title: "x", content: chords([[0, ""]]), tags: ["明るい"] });
    expect(findProgressions(core, { tags: ["存在しないタグ"] })).toEqual([]);
  });
});
