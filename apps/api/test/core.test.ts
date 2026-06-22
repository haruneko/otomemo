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

describe("scope: project / library 分離", () => {
  it("既定は project・listNeta は project だけ／library/all で出し分け", () => {
    const p = core.createNeta({ kind: "melody", title: "作業" }); // 既定 project
    const l = core.createNeta({ kind: "chord_progression", title: "取込", scope: "library" });
    expect(p.scope).toBe("project");
    expect(l.scope).toBe("library");
    expect(core.listNeta({}).map((n) => n.id)).toEqual([p.id]); // 既定=project のみ
    expect(core.listNeta({ scope: "library" }).map((n) => n.id)).toEqual([l.id]);
    expect(core.listNeta({ scope: "all" }).length).toBe(2);
  });
  it("copyNeta：library を project にコピー（独立・元不変・取込タグは引き継がない）", () => {
    const l = core.createNeta({ kind: "chord_progression", title: "元", scope: "library", content: { chords: [{ root: 0, quality: "" }] }, tags: ["取込", "明るい"] });
    const c = core.copyNeta(l.id)!;
    expect(c.scope).toBe("project");
    expect(c.id).not.toBe(l.id);
    expect(c.content).toEqual(l.content);
    expect(c.tags).toEqual(["明るい"]); // 取込 は落ちる
    expect(core.getNeta(l.id)!.scope).toBe("library"); // 元は不変
  });
  it("setScope：project↔library 切替（自作を連想元へ）", () => {
    const p = core.createNeta({ kind: "chord_progression", title: "自作" });
    expect(core.setScope(p.id, "library")!.scope).toBe("library");
    expect(core.listNeta({ scope: "library" }).some((n) => n.id === p.id)).toBe(true);
  });
  it("copyNeta は section の子も deep copy（M1・空シェルにならない）", () => {
    const sec = core.createNeta({ kind: "section", title: "S", scope: "library" });
    const mel = core.createNeta({ kind: "melody", title: "m", scope: "library" });
    core.placeChild(sec.id, mel.id, 0, 0);
    core.placeChild(sec.id, mel.id, 4, 1); // 同じ子を2位置（#54）
    const copy = core.copyNeta(sec.id)!;
    const tree = core.getComposition(copy.id)!;
    expect(copy.scope).toBe("project");
    expect(tree.children.length).toBe(2); // 子が付いてくる
    const childIds = new Set(tree.children.map((c) => c.node.neta.id));
    expect(childIds.size).toBe(1); // 共有childは1コピー（関係保持）
    expect([...childIds][0]).not.toBe(mel.id); // 子もコピー（元 mel ではない）
    expect(core.getNeta(mel.id)!.scope).toBe("library"); // 元は不変
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

  it("section をネストできる（section in section）が循環は禁止", () => {
    const a = core.createNeta({ kind: "section", title: "A" });
    const b = core.createNeta({ kind: "section", title: "B" });
    core.placeChild(a.id, b.id, 0, 0); // A の中に B（ネストOK）
    expect(core.getComposition(a.id)!.children[0]!.node.neta.id).toBe(b.id);
    expect(() => core.placeChild(a.id, a.id)).toThrow(); // 自分自身
    expect(() => core.placeChild(b.id, a.id)).toThrow(); // B⊃A は循環（A⊃B 既存）
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

describe("chat sessions: 複数会話の一覧", () => {
  it("listChatThreads lists global+chat:* with preview/count, excludes neta threads", () => {
    core.addChatMessage({ thread: "global", role: "user", text: "最初の会話" });
    core.addChatMessage({ thread: "chat:abc", role: "user", text: "二つ目の会話" });
    core.addChatMessage({ thread: "chat:abc", role: "ai", text: "はい" });
    core.addChatMessage({ thread: "neta-xyz-id", role: "user", text: "ネタ別" }); // 対象外
    const ts = core.listChatThreads();
    const threads = ts.map((t) => t.thread);
    expect(threads).toContain("global");
    expect(threads).toContain("chat:abc");
    expect(threads).not.toContain("neta-xyz-id");
    const abc = ts.find((t) => t.thread === "chat:abc")!;
    expect(abc.preview).toBe("二つ目の会話"); // 冒頭のuser発言
    expect(abc.count).toBe(2);
  });
});

describe("deleteNeta は reap を蘇生させない (#97)", () => {
  it("削除しても job_result 行は残る(neta_id NULL)＝reap が再生成しない", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    const n = c.createNeta({ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } });
    // reap が作った想定の done ジョブ＋job_result
    db.prepare(`INSERT INTO job (id,intent,status,created,updated) VALUES ('j97','gen_pair_rule','done','','')`).run();
    db.prepare(`INSERT INTO job_result (job_id, neta_id, ord) VALUES ('j97', ?, 0)`).run(n.id);
    expect(c.deleteNeta(n.id)).toBe(true);
    // ネタは消えるが job_result 行は残る＝reap の NOT EXISTS が依然 false（蘇生しない）
    const rows = db.prepare(`SELECT neta_id FROM job_result WHERE job_id='j97'`).all() as { neta_id: string | null }[];
    expect(rows.length).toBe(1);
    expect(rows[0]!.neta_id).toBeNull();
  });
});
