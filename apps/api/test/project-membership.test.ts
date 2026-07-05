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

describe("deleteProject＝器を消す（ネタは残す・未仕分けへ）", () => {
  it("空の器（説明だけ）は行削除で一覧から消える", () => {
    core.setProject("空器", { description: "中身なし" });
    expect(core.listProjectNames()).toContain("空器");
    expect(core.deleteProject("空器")).toEqual({ unassigned: 0 });
    expect(core.listProjectNames()).not.toContain("空器");
  });

  it("中身のある器を消すと prj: タグが外れネタは未仕分けに残る（削除しない）", () => {
    const a = core.createNeta({ kind: "melody", tags: ["prj:夏", "疾走"] });
    const b = core.createNeta({ kind: "bass", tags: ["prj:夏"] });
    core.setProject("夏", { description: "夏の曲" });
    expect(core.deleteProject("夏")).toEqual({ unassigned: 2 });
    // 器は消える
    expect(core.listProjectNames()).not.toContain("夏");
    expect(core.listNeta({ tags: ["prj:夏"] })).toHaveLength(0);
    // ネタは残る＝未仕分けへ。意味タグ(疾走)は温存。
    expect(core.getNeta(a.id)!.tags).toContain("疾走");
    expect(core.getNeta(a.id)!.tags).not.toContain("prj:夏");
    const un = core.listNeta({ unassigned: true }).map((n) => n.id);
    expect(un).toEqual(expect.arrayContaining([a.id, b.id]));
  });
});
