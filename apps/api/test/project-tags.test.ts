import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "../src/db";
import { Core, isProjectTag, PROJECT_TAG_PREFIX } from "../src/core";

// #13 複数プロジェクト（prj: 名前空間タグ）。所属は prj:<名前> タグ＝意味タグとは別軸。
let core: Core;
beforeEach(() => {
  core = new Core(openDb(":memory:"));
});

describe("プロジェクトタグ（prj:）", () => {
  it("isProjectTag / prefix", () => {
    expect(PROJECT_TAG_PREFIX).toBe("prj:");
    expect(isProjectTag("prj:みなそこ")).toBe(true);
    expect(isProjectTag("疾走")).toBe(false);
  });

  it("facets: prj: は projects へ分離し、意味タグ(tags)からは除外", () => {
    core.createNeta({ kind: "melody", tags: ["疾走", "prj:みなそこ"] });
    core.createNeta({ kind: "lyric", text: "x", tags: ["prj:夏の歌", "切ない"] });
    const f = core.facets("all");
    expect(f.tags).toContain("疾走");
    expect(f.tags).toContain("切ない");
    expect(f.tags).not.toContain("prj:みなそこ");
    expect(f.tags).not.toContain("prj:夏の歌");
    expect(f.projects).toEqual(expect.arrayContaining(["みなそこ", "夏の歌"]));
  });

  it("listNeta: prj: タグでプロジェクト絞り込み（既存タグ絞り込みを流用）", () => {
    const a = core.createNeta({ kind: "melody", tags: ["prj:みなそこ"] });
    core.createNeta({ kind: "melody", tags: ["prj:夏の歌"] });
    const got = core.listNeta({ tags: ["prj:みなそこ"] });
    expect(got.map((n) => n.id)).toEqual([a.id]);
  });

  it("同じネタが複数プロジェクトに所属できる（多対多・コピー不要）", () => {
    const a = core.createNeta({ kind: "melody", tags: ["prj:みなそこ", "prj:夏の歌"] });
    expect(core.listNeta({ tags: ["prj:みなそこ"] }).map((n) => n.id)).toContain(a.id);
    expect(core.listNeta({ tags: ["prj:夏の歌"] }).map((n) => n.id)).toContain(a.id);
  });
});
