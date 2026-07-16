import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";

let core: Core;
beforeEach(() => {
  core = new Core(openDb(":memory:"));
});

// プロジェクト実体（説明・AIへの指示）。器の説明文と、会話に効く指示を持つ（Claude Projects風）。
describe("project entity (description / instructions)", () => {
  it("getProject returns null until set, then round-trips", () => {
    expect(core.getProject("みなそこ")).toBeNull();
    core.setProject("みなそこ", { description: "切ない疾走の一曲", instructions: "サビは上行で締める" });
    const p = core.getProject("みなそこ")!;
    expect(p.name).toBe("みなそこ");
    expect(p.description).toBe("切ない疾走の一曲");
    expect(p.instructions).toBe("サビは上行で締める");
  });

  it("setProject upserts: partial update keeps the other field", () => {
    core.setProject("みなそこ", { description: "説明A", instructions: "指示A" });
    core.setProject("みなそこ", { description: "説明B" }); // instructions は触らない
    const p = core.getProject("みなそこ")!;
    expect(p.description).toBe("説明B");
    expect(p.instructions).toBe("指示A");
  });
});

// プロジェクト名の一覧＝prj:タグを持つネタ ∪ project行（説明だけ作った空の器も拾う＝到達可能に）。
describe("listProjectNames (picker source incl. empty projects)", () => {
  it("unions tag-derived projects and project-table-only (empty) ones", () => {
    core.createNeta({ kind: "section", title: "A", tags: ["prj:みなそこ"] });
    core.setProject("空の器", { description: "まだ曲なし" }); // ネタゼロ＝タグ由来には出ない
    const names = core.listProjectNames();
    expect(names).toContain("みなそこ");
    expect(names).toContain("空の器");
  });
});

// プロジェクト配下のジョブ（投げて受け取る）をワークスペースに可視化する（S6）。
describe("listProjectJobs (workspace job visibility)", () => {
  it("lists jobs targeting netas in the project, excludes others", () => {
    const song = core.createNeta({ kind: "section", title: "A", tags: ["prj:みなそこ"] });
    const other = core.createNeta({ kind: "section", title: "B", tags: ["prj:別曲"] });
    const j1 = core.enqueueJob({ intent: "research", target_neta_id: song.id });
    core.enqueueJob({ intent: "research", target_neta_id: other.id });
    expect(core.listProjectJobs("みなそこ").map((j) => j.id)).toEqual([j1.id]);
  });
});

// プロジェクト＝一曲(or組曲)の器：配下ネタに紐づくファイル(asset)を曲単位で集約する（S2）。
describe("listProjectFiles (workspace file aggregation)", () => {
  it("aggregates assets attached to netas carrying prj: tag, grouped per asset", () => {
    const song = core.createNeta({ kind: "section", title: "セクションA", tags: ["prj:みなそこ"] });
    const other = core.createNeta({ kind: "melody", title: "別曲メロ", tags: ["prj:別曲"] });
    const lyric = core.addAsset({ kind: "lyrics", name: "歌詞.txt", path: "/x/歌詞.txt", mime: "text/plain" });
    const mid = core.addAsset({ kind: "midi", name: "demo.mid", path: "/x/demo.mid" });
    const stray = core.addAsset({ kind: "midi", name: "別.mid", path: "/x/別.mid" });
    core.linkAsset(song.id, lyric.id, "source");
    core.linkAsset(song.id, mid.id, "render");
    core.linkAsset(other.id, stray.id, "source");

    const files = core.listProjectFiles("みなそこ");
    expect(files.map((f) => f.name).sort()).toEqual(["demo.mid", "歌詞.txt"]);
    const lf = files.find((f) => f.name === "歌詞.txt")!;
    expect(lf.attachedTo).toEqual([{ netaId: song.id, title: "セクションA", kind: "section", role: "source" }]);
    expect(files.map((f) => f.name)).not.toContain("別.mid");
  });

  it("dedupes an asset attached to multiple netas in the same project (attachedTo has both)", () => {
    const a = core.createNeta({ kind: "section", title: "A", tags: ["prj:みなそこ"] });
    const b = core.createNeta({ kind: "section", title: "B", tags: ["prj:みなそこ"] });
    const shared = core.addAsset({ kind: "image", name: "ジャケ.png", path: "/x/ジャケ.png" });
    core.linkAsset(a.id, shared.id, "attachment");
    core.linkAsset(b.id, shared.id, "attachment");
    const files = core.listProjectFiles("みなそこ");
    expect(files.length).toBe(1);
    expect(files[0].attachedTo.map((x) => x.title).sort()).toEqual(["A", "B"]);
  });
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
  it("kindCounts：kind別件数（kind と同じ母集団・scope=project）", () => {
    const f = core.facets(); // 既定 project（beforeEach＝melody×2, chord×1）
    expect(f.kindCounts).toEqual({ melody: 2, chord: 1 });
    // 母集団は kind リストと一致＝件数 key の集合と distinct kind が同じ
    expect(Object.keys(f.kindCounts).sort()).toEqual([...f.kind].sort());
  });
  it("kindCounts：library は除外（scope=project 母集団）", () => {
    core.createNeta({ kind: "chord_progression", title: "取込", scope: "library" });
    const f = core.facets(); // project のみ＝library 分は数えない
    expect(f.kindCounts.chord_progression).toBeUndefined();
    expect(f.kindCounts).toEqual({ melody: 2, chord: 1 });
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

// 分家（vary＝変奏の一級化・design「分家モデル」S2）。copyNeta（deep copy）との差＝子は参照共有＋variant_of。
describe("vary (shallow branch / variant_of) — S2", () => {
  it("container を分家＝子は参照共有（deep copy しない）・辺は同 position/ord で複製・variant_of を新→元へ", () => {
    const sec = core.createNeta({ kind: "section", title: "サビ", key: 0, tags: ["role:chorus"] });
    const mel = core.createNeta({ kind: "melody", title: "m" });
    const bass = core.createNeta({ kind: "bass", title: "b" });
    core.placeChild(sec.id, mel.id, 0, 0);
    core.placeChild(sec.id, bass.id, 4, 1);

    const branch = core.varyNeta(sec.id, { title: "ラスサビ" })!;
    expect(branch.id).not.toBe(sec.id);
    expect(branch.kind).toBe("section");
    expect(branch.title).toBe("ラスサビ");
    expect(branch.tags).toContain("role:chorus"); // frame/role はコピー（分家側で自由に変える起点）

    const tree = core.getComposition(branch.id)!;
    expect(tree.children.length).toBe(2);
    const childIds = new Set(tree.children.map((c) => c.node.neta.id));
    expect(childIds.has(mel.id)).toBe(true); // 子は**参照共有**＝元 mel そのもの（copyNeta と真逆）
    expect(childIds.has(bass.id)).toBe(true);
    // 辺は同 position/ord で複製
    expect(tree.children.map((c) => c.position).sort((a, b) => a - b)).toEqual([0, 4]);

    // variant_of＝新→元
    expect(core.getRelations(branch.id)).toContainEqual({ to: sec.id, type: "variant_of" });
    // 元は無傷（辺も relation も増えない）
    expect(core.getComposition(sec.id)!.children.length).toBe(2);
    expect(core.getRelations(sec.id)).toEqual([]);
  });

  it("既定 title＝元title′・title 省略時", () => {
    const sec = core.createNeta({ kind: "section", title: "Aメロ" });
    const branch = core.varyNeta(sec.id)!;
    expect(branch.title).toBe("Aメロ′");
  });

  it("リーフ（辺ゼロ）＝content コピー＋variant_of＝copy_neta 単体と同じ実体だが系譜が残る", () => {
    const mel = core.createNeta({ kind: "melody", title: "m", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } });
    const branch = core.varyNeta(mel.id)!;
    expect(branch.id).not.toBe(mel.id);
    expect(branch.content).toEqual(mel.content); // content はコピー
    expect(core.getComposition(branch.id)!.children.length).toBe(0); // 辺ゼロ＝浅い＝深い
    expect(core.getRelations(branch.id)).toContainEqual({ to: mel.id, type: "variant_of" });
  });

  it("存在しない id は null", () => {
    expect(core.varyNeta("nope")).toBeNull();
  });

  it("元の共有子を編集しても分家に効く＝参照共有の証明（サビを直せば全サビに効く）", () => {
    const sec = core.createNeta({ kind: "section", title: "サビ" });
    const mel = core.createNeta({ kind: "melody", title: "m" });
    core.placeChild(sec.id, mel.id, 0, 0);
    const branch = core.varyNeta(sec.id)!;
    // 共有子 mel を更新
    core.updateNeta(mel.id, { title: "改" });
    const branchChild = core.getComposition(branch.id)!.children[0]!.node.neta;
    expect(branchChild.title).toBe("改"); // 分家からも同じ実体が見える
  });
});

// 共有検出（分家の安全弁・design「copy-on-write」S2）。placementCount>=2 で「共有」。
describe("placementsOf (shared detection) — S2", () => {
  it("複数親からの参照を親ごとの position 群で返す", () => {
    const secA = core.createNeta({ kind: "section", title: "A" });
    const secB = core.createNeta({ kind: "section", title: "B" });
    const mel = core.createNeta({ kind: "melody", title: "m" });
    core.placeChild(secA.id, mel.id, 0, 0);
    core.placeChild(secB.id, mel.id, 8, 0);
    const p = core.placementsOf(mel.id);
    expect(p.placementCount).toBe(2);
    expect(p.parents.map((x) => x.parentId).sort()).toEqual([secA.id, secB.id].sort());
  });

  it("同一親2配置（反復）も placementCount に数える＝ユニゾン反復も共有扱い", () => {
    const sec = core.createNeta({ kind: "section", title: "S" });
    const mel = core.createNeta({ kind: "melody", title: "m" });
    core.placeChild(sec.id, mel.id, 0, 0);
    core.placeChild(sec.id, mel.id, 4, 1);
    const p = core.placementsOf(mel.id);
    expect(p.placementCount).toBe(2);
    expect(p.parents.length).toBe(1);
    expect(p.parents[0]!.positions.sort((a, b) => a - b)).toEqual([0, 4]);
  });

  it("配置ゼロ＝空（未使用ネタ）", () => {
    const mel = core.createNeta({ kind: "melody", title: "m" });
    expect(core.placementsOf(mel.id)).toEqual({ parents: [], placementCount: 0 });
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

  it("WP-X2 updateSong は loop を JSON 永続＝新規曲は null・部分更新で loop 保持・null で解除", () => {
    const s = core.createNeta({ kind: "song", title: "ゲームBGM" });
    expect(core.getSong(s.id)).toBeNull(); // 未指定＝overlay 無し
    const up = core.updateSong(s.id, { stage: "ループ設計", loop: { startBar: 0, endBar: 16, tailBars: 1 } });
    expect(up?.loop).toEqual({ startBar: 0, endBar: 16, tailBars: 1 });
    // 読み直しで JSON が往復する（列に文字列で載っている）
    expect(core.getSong(s.id)?.loop).toEqual({ startBar: 0, endBar: 16, tailBars: 1 });
    // loop を渡さない部分更新では据え置き
    const up2 = core.updateSong(s.id, { next_action: "境界チェック" });
    expect(up2?.loop).toEqual({ startBar: 0, endBar: 16, tailBars: 1 });
    expect(up2?.stage).toBe("ループ設計");
    // 明示 null で解除
    const up3 = core.updateSong(s.id, { loop: null });
    expect(up3?.loop).toBeNull();
  });

  it("WP-X2 loop 未指定の既存曲は overlay に loop=null（後方互換）", () => {
    const s = core.createNeta({ kind: "song" });
    const up = core.updateSong(s.id, { stage: "x" }); // loop に触れない
    expect(up?.loop).toBeNull();
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

describe("getComposition：繰り返し配置は各所で展開・循環だけ打ち切る（伸ばしたsectionが鳴る）", () => {
  it("同じ section を2箇所に置くと、両方とも子(パート)が展開される（旧: 2個目が空だった）", () => {
    const song = core.createNeta({ kind: "song", title: "S" });
    const sec = core.createNeta({ kind: "section", title: "A" });
    const mel = core.createNeta({ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } });
    core.placeChild(sec.id, mel.id, 0, 0);
    core.placeChild(song.id, sec.id, 0, 0);
    core.placeChild(song.id, sec.id, 16, 0); // ループ＝同一 section をもう1箇所
    const tree = core.getComposition(song.id)!;
    expect(tree.children.length).toBe(2);
    // 両方の section が melody 子を持つ（2個目も空でない＝合成で鳴る）
    expect(tree.children.map((c) => c.node.children.length)).toEqual([1, 1]);
  });
  // ※真の循環は placeChild(descendantIds) が配置時点で拒否＝データに存在しない。
  // getComposition の ancestors ガードはその上の防御的バックストップ（データ破損時の無限再帰止め）。
});
