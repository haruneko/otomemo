import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";

// 器への出し入れ(P3)＝addTag/removeTag prj: と、未仕分け抽出(P4)。design LV3 Slice A。
let core: Core;
beforeEach(() => {
  core = new Core(openDb(":memory:"));
});
const ids = (ns: { id: string }[]) => ns.map((n) => n.id).sort();

describe("器メンバーシップ(P3)＝prj: の addTag/removeTag", () => {
  it("addTag は他の意味タグを壊さない（updateNeta 全置換の危険を回避）", () => {
    const a = core.createNeta({ kind: "melody", tags: ["疾走", "切ない"] });
    core.addTag(a.id, "prj:みなそこ");
    const got = core.getNeta(a.id)!;
    expect(got.tags).toEqual(expect.arrayContaining(["疾走", "切ない", "prj:みなそこ"]));
  });

  it("入れる→prj: 絞り込みで拾える／取り出す→拾えない", () => {
    const a = core.createNeta({ kind: "melody" });
    core.addTag(a.id, "prj:みなそこ");
    expect(ids(core.listNeta({ tags: ["prj:みなそこ"] }))).toContain(a.id);
    core.removeTag(a.id, "prj:みなそこ");
    expect(ids(core.listNeta({ tags: ["prj:みなそこ"] }))).not.toContain(a.id);
  });
});

describe("未仕分け(P4)＝prj: タグを1つも持たないネタ", () => {
  it("unassigned=true は器に属さないネタだけ返す", () => {
    const free = core.createNeta({ kind: "melody", tags: ["メモ"] });
    const inPrj = core.createNeta({ kind: "melody", tags: ["prj:みなそこ"] });
    const got = ids(core.listNeta({ unassigned: true }));
    expect(got).toContain(free.id);
    expect(got).not.toContain(inPrj.id);
  });

  it("入れると未仕分けから外れる（P3↔P4 の対）", () => {
    const a = core.createNeta({ kind: "melody" });
    expect(ids(core.listNeta({ unassigned: true }))).toContain(a.id);
    core.addTag(a.id, "prj:夏の歌");
    expect(ids(core.listNeta({ unassigned: true }))).not.toContain(a.id);
  });
});

describe("projectCounts(P1)＝チップ用の件数", () => {
  it("すべて/未仕分け/器別を数える", () => {
    core.createNeta({ kind: "melody", tags: ["prj:A"] });
    core.createNeta({ kind: "melody", tags: ["prj:A"] });
    core.createNeta({ kind: "melody", tags: ["prj:B"] });
    core.createNeta({ kind: "melody", tags: ["メモ"] }); // 未仕分け
    const c = core.projectCounts();
    expect(c.all).toBe(4);
    expect(c.unassigned).toBe(1);
    expect(c.projects).toEqual([
      { name: "A", count: 2 },
      { name: "B", count: 1 },
    ]);
  });

  it("説明だけ作った空の器も 0 件で拾う（picker 到達可能）", () => {
    core.setProject("空器", { description: "まだ中身なし" });
    const c = core.projectCounts();
    expect(c.projects).toEqual([{ name: "空器", count: 0 }]);
  });
});
