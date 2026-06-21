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

  it("places the same child at multiple positions and removes one instance (#54)", () => {
    const sec = core.createNeta({ kind: "section", title: "S" });
    const mel = core.createNeta({ kind: "melody", title: "m" });
    core.placeChild(sec.id, mel.id, 0, 0);
    core.placeChild(sec.id, mel.id, 4, 1); // 同じ子を別位置に反復配置
    let tree = core.getComposition(sec.id)!;
    expect(tree.children.length).toBe(2);
    expect(tree.children.map((c) => c.position).sort((a, b) => a - b)).toEqual([0, 4]);
    core.removeChild(sec.id, mel.id, 0); // @0 だけ解除
    tree = core.getComposition(sec.id)!;
    expect(tree.children.length).toBe(1);
    expect(tree.children[0]!.position).toBe(4);
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

describe("jobs: waiting / answer (#45)", () => {
  it("askQuestion → waiting, answerJob enqueues a continuation and closes original", () => {
    const j = core.enqueueJob({ intent: "suggest", instruction: "歌詞案" });
    core.askQuestion(j.id, "テンポは？");
    expect(core.getJob(j.id)!.status).toBe("waiting");
    expect(core.getJob(j.id)!.question).toBe("テンポは？");

    const cont = core.answerJob(j.id, "120くらい")!;
    expect(cont.parent_job_id).toBe(j.id);
    expect(cont.status).toBe("queued");
    expect(cont.instruction).toContain("120くらい");
    expect(core.getJob(j.id)!.status).toBe("done"); // 元ジョブは完了
  });

  it("answerJob carries orig params and folds a form answer into frame (#85 S3)", () => {
    const j = core.enqueueJob({
      intent: "gen_variations",
      params: { count: 4, kinds: ["chord_progression", "melody"], frame: { mood: "切ない" } },
    });
    core.askQuestion(j.id, '{"kind":"form","fields":[{"key":"meter","label":"拍子"}]}');
    // フォームが meter(枠)＋count(トップレベル)を返す
    const cont = core.answerJob(j.id, { meter: "6/8", count: 3 })!;
    expect(cont.intent).toBe("gen_variations");
    const p = cont.params as { count: number; kinds: string[]; frame: { meter: string; mood: string } };
    expect(p.count).toBe(3); // count はトップレベルへ（worker が読む場所）＝上書き
    expect(p.kinds).toEqual(["chord_progression", "melody"]); // 引き継ぎ
    expect(p.frame.meter).toBe("6/8"); // meter は frame へ
    expect(p.frame.mood).toBe("切ない"); // 既存 frame を保持
  });

  it("answerJob string answer still preserves params (#85 S3)", () => {
    const j = core.enqueueJob({ intent: "gen_chord", instruction: "作って", params: { frame: { meter: "6/8" } } });
    core.askQuestion(j.id, "どんな感じ?");
    const cont = core.answerJob(j.id, "明るく")!;
    expect((cont.params as { frame: { meter: string } }).frame.meter).toBe("6/8");
    expect(cont.instruction).toContain("明るく");
  });
});

describe("song overlay + neta_asset (#83)", () => {
  it("updateSong upserts stage/next_action with partial update", () => {
    const s = core.createNeta({ kind: "song", title: "曲A" });
    expect(core.getSong(s.id)).toBeNull();
    const up = core.updateSong(s.id, { stage: "アレンジ", next_action: "サビ作る" });
    expect(up?.stage).toBe("アレンジ");
    expect(up?.next_action).toBe("サビ作る");
    const up2 = core.updateSong(s.id, { next_action: "2番" }); // stage は保持
    expect(up2?.stage).toBe("アレンジ");
    expect(up2?.next_action).toBe("2番");
    expect(core.updateSong("nope", { stage: "x" })).toBeNull();
  });

  it("linkAsset/getNetaAssets/unlinkAsset carry role", () => {
    const n = core.createNeta({ kind: "melody" });
    const a = core.addAsset({ kind: "midi", path: "/x.mid", name: "x" });
    expect(core.linkAsset(n.id, a.id, "source")).toBe(true);
    const list = core.getNetaAssets(n.id);
    expect(list.length).toBe(1);
    expect(list[0].role).toBe("source");
    expect(list[0].kind).toBe("midi");
    expect(core.linkAsset(n.id, "nope", "source")).toBe(false); // 無い資産は false
    expect(core.unlinkAsset(n.id, a.id, "source")).toBe(true);
    expect(core.getNetaAssets(n.id).length).toBe(0);
  });
});
