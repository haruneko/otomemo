import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";

// ネタ一覧の手動並べ替え（被せ表 neta_order・design LV-A）。
let core: Core;
beforeEach(() => {
  core = new Core(openDb(":memory:"));
});

const idsOf = (ns: { id: string }[]) => ns.map((n) => n.id);

describe("reorderNeta (手動並べ替え)", () => {
  it("並べ替え前は orderProject 指定でも既定(updated順)と同じ＝純加算", () => {
    const a = core.createNeta({ kind: "melody", tags: ["prj:P"] });
    const b = core.createNeta({ kind: "melody", tags: ["prj:P"] });
    const plain = idsOf(core.listNeta({ tags: ["prj:P"] }));
    const withOrder = idsOf(core.listNeta({ tags: ["prj:P"], orderProject: "P" }));
    expect(withOrder).toEqual(plain);
    expect(new Set(withOrder)).toEqual(new Set([a.id, b.id]));
  });

  it("reorder した順に position 昇順で返す", () => {
    const a = core.createNeta({ kind: "melody", tags: ["prj:P"] });
    const b = core.createNeta({ kind: "melody", tags: ["prj:P"] });
    const c = core.createNeta({ kind: "melody", tags: ["prj:P"] });
    core.reorderNeta("P", [c.id, a.id, b.id]);
    expect(idsOf(core.listNeta({ tags: ["prj:P"], orderProject: "P" }))).toEqual([c.id, a.id, b.id]);
  });

  it("position の無い新規ネタは先頭(未並べ替え=updated順)に来る", () => {
    const a = core.createNeta({ kind: "melody", tags: ["prj:P"] });
    const b = core.createNeta({ kind: "melody", tags: ["prj:P"] });
    core.reorderNeta("P", [b.id, a.id]); // b,a に固定
    const fresh = core.createNeta({ kind: "melody", tags: ["prj:P"] }); // 並べ替え後の新規
    const got = idsOf(core.listNeta({ tags: ["prj:P"], orderProject: "P" }));
    expect(got[0]).toBe(fresh.id); // 未配置は先頭
    expect(got.slice(1)).toEqual([b.id, a.id]); // 配置済みは指定順
  });

  it("並べ替えはプロジェクト別＝別プロジェクトに影響しない", () => {
    const a = core.createNeta({ kind: "melody", tags: ["prj:P"] });
    const b = core.createNeta({ kind: "melody", tags: ["prj:P"] });
    core.reorderNeta("P", [b.id, a.id]);
    // orderProject を別名にすると neta_order 行が無い＝既定順
    const other = idsOf(core.listNeta({ tags: ["prj:P"], orderProject: "Q" }));
    expect(other).toEqual(idsOf(core.listNeta({ tags: ["prj:P"] })));
  });

  it("再 reorder は全上書き（前回順を引きずらない）", () => {
    const a = core.createNeta({ kind: "melody", tags: ["prj:P"] });
    const b = core.createNeta({ kind: "melody", tags: ["prj:P"] });
    const c = core.createNeta({ kind: "melody", tags: ["prj:P"] });
    core.reorderNeta("P", [a.id, b.id, c.id]);
    core.reorderNeta("P", [c.id, b.id, a.id]);
    expect(idsOf(core.listNeta({ tags: ["prj:P"], orderProject: "P" }))).toEqual([c.id, b.id, a.id]);
  });
});
