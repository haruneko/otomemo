import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";

let core: Core;
beforeEach(() => {
  core = new Core(openDb(":memory:"));
});

describe("neta CRUD", () => {
  it("creates and reads a neta with content + tags", () => {
    const n = core.createNeta({
      kind: "melody",
      title: "サビ案",
      content: { notes: [{ pitch: 60, start: 0, dur: 1 }] },
      key: 0,
      mode: "major",
      tempo: 120,
      meter: "4/4",
      mood: "切ない",
      tags: ["サビ", "疾走"],
    });
    expect(n.id).toBeTruthy();
    const got = core.getNeta(n.id)!;
    expect(got.kind).toBe("melody");
    expect(got.content).toEqual({ notes: [{ pitch: 60, start: 0, dur: 1 }] });
    expect(got.key).toBe(0);
    expect(got.tags).toEqual(["サビ", "疾走"]);
  });

  it("returns null for missing neta", () => {
    expect(core.getNeta("nope")).toBeNull();
  });

  it("updates fields and replaces tags", () => {
    const n = core.createNeta({ kind: "lyric", text: "夜を駆ける", tags: ["x"] });
    const u = core.updateNeta(n.id, { text: "朝を待つ", tags: ["a", "b"] })!;
    expect(u.text).toBe("朝を待つ");
    expect(u.tags).toEqual(["a", "b"]);
    expect(u.updated >= u.created).toBe(true);
  });

  it("deletes (and cascades tags/edges)", () => {
    const n = core.createNeta({ kind: "other", tags: ["t"] });
    expect(core.deleteNeta(n.id)).toBe(true);
    expect(core.getNeta(n.id)).toBeNull();
  });
});

describe("faceted list / facets", () => {
  beforeEach(() => {
    core.createNeta({ kind: "melody", mood: "切ない", tags: ["サビ"], title: "m1" });
    core.createNeta({ kind: "chord", mood: "明るい", tags: ["イントロ"], title: "c1" });
    core.createNeta({ kind: "melody", mood: "明るい", tags: ["サビ", "疾走"], title: "m2" });
  });

  it("filters by kind", () => {
    expect(core.listNeta({ kind: "melody" }).length).toBe(2);
  });
  it("filters by mood", () => {
    expect(core.listNeta({ mood: "明るい" }).length).toBe(2);
  });
  it("filters by tags (all must match)", () => {
    expect(core.listNeta({ tags: ["サビ", "疾走"] }).length).toBe(1);
    expect(core.listNeta({ tags: ["サビ"] }).length).toBe(2);
  });
  it("text search via q", () => {
    expect(core.listNeta({ q: "m" }).length).toBe(2);
    expect(core.listNeta({ q: "c1" }).length).toBe(1);
  });
  it("lists distinct facet values", () => {
    const f = core.facets();
    expect([...f.kind].sort()).toEqual(["chord", "melody"]);
    expect(f.mood).toContain("切ない");
    expect(f.tags).toContain("疾走");
  });
});

describe("edges: compose (DAG) + relation", () => {
  it("builds a composition tree with a reused child", () => {
    const song = core.createNeta({ kind: "song", title: "曲" });
    const sec = core.createNeta({ kind: "section", title: "Aメロ" });
    const mel = core.createNeta({ kind: "melody", title: "m" });
    core.placeChild(song.id, sec.id, 0, 0);
    core.placeChild(sec.id, mel.id, 0, 0);
    core.placeChild(song.id, mel.id, 4, 1); // 同じ mel を song にも直接配置（使い回し）
    const tree = core.getComposition(song.id)!;
    expect(tree.neta.id).toBe(song.id);
    expect(tree.children.length).toBe(2);
    const secNode = tree.children.find((c) => c.node.neta.id === sec.id)!;
    expect(secNode.node.children[0]!.node.neta.id).toBe(mel.id);
  });

  it("links and unlinks relations", () => {
    const a = core.createNeta({ kind: "theme", title: "a" });
    const b = core.createNeta({ kind: "lyric", title: "b" });
    core.link(a.id, b.id, "related");
    expect(core.getRelations(a.id)).toEqual([{ to: b.id, type: "related" }]);
    core.unlink(a.id, b.id, "related");
    expect(core.getRelations(a.id)).toEqual([]);
  });
});
