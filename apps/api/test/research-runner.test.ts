import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { parseResearch, researchPrompt, collectPrompt, runResearchJob } from "../src/research-runner";

let core: Core;
beforeEach(() => {
  core = new Core(openDb(":memory:"));
});

describe("parseResearch＝claude出力から {summary,references} を頑健に抽出", () => {
  it("素の JSON を読む", () => {
    const r = parseResearch('{"summary":"3曲","references":[{"title":"A","artist":"X","why":"疾走","points":"速い"}]}');
    expect(r.summary).toBe("3曲");
    expect(r.references).toEqual([{ title: "A", artist: "X", why: "疾走", points: "速い" }]);
  });
  it("前後に散文/コードフェンスが混じっても { } を拾う", () => {
    const r = parseResearch('参考です:\n```json\n{"summary":"S","references":[{"title":"B"}]}\n```\nどうぞ');
    expect(r.summary).toBe("S");
    expect(r.references).toEqual([{ title: "B", artist: "", why: "", points: "" }]); // 欠けは空文字で埋める
  });
  it("title 無しの ref は落とす", () => {
    const r = parseResearch('{"summary":"S","references":[{"artist":"X"},{"title":"ok"}]}');
    expect(r.references.map((x) => x.title)).toEqual(["ok"]);
  });
  it("壊れていたら全文を summary に・references=[]（無言で捨てない）", () => {
    const r = parseResearch("JSONじゃない文章");
    expect(r.summary).toBe("JSONじゃない文章");
    expect(r.references).toEqual([]);
  });
});

describe("prompts＝worker と同契約（JSONのみ）", () => {
  it("research は topic/依頼と references 2〜5曲の JSON 指示を含む", () => {
    const p = researchPrompt({ topic: "夏の疾走ロック" });
    expect(p).toContain("夏の疾走ロック");
    expect(p).toContain('"references"');
    expect(p).toContain("JSONのみ");
  });
  it("collect は断片/アイデア収集の指示", () => {
    expect(collectPrompt({ topic: "t" })).toContain("すぐ試せる断片");
  });
});

describe("claimQueued＝queued を1件ずつ running・対象intentのみ", () => {
  it("research/collect だけを古い順に claim し、running に落とす", () => {
    const a = core.enqueueJob({ intent: "research", params: { topic: "a" } });
    const b = core.enqueueJob({ intent: "collect", params: { topic: "b" } });
    core.enqueueJob({ intent: "import_midi" }); // 対象外＝claim されない
    const c1 = core.claimQueued(["research", "collect"])!;
    expect(c1.id).toBe(a.id); // 古い順
    expect(core.getJob(a.id)!.status).toBe("running");
    const c2 = core.claimQueued(["research", "collect"])!;
    expect(c2.id).toBe(b.id);
    expect(core.claimQueued(["research", "collect"])).toBeNull(); // 残りは対象外のみ
  });
});

describe("runResearchJob＝claude結果を done に→reaper が reference ネタ化", () => {
  it("done + result、reap で参考曲ネタが出る（fake shot 注入）", async () => {
    const job = core.enqueueJob({ intent: "research", params: { topic: "夏の疾走ロック" } });
    const claimed = core.claimQueued(["research", "collect"])!;
    const fake = async () =>
      JSON.stringify({ summary: "3曲挙げた", references: [{ title: "曲A", artist: "X", why: "疾走感", points: "BPM速い" }] });
    await runResearchJob(core, claimed, fake);
    const done = core.getJob(job.id)!;
    expect(done.status).toBe("done");
    expect(done.result).toMatchObject({ summary: "3曲挙げた" });
    // 単発 research の reap は stale ガード（updated<120s前）＝updated を過去にして越す。
    core.db.prepare("UPDATE job SET updated='2020-01-01T00:00:00.000Z' WHERE id=?").run(job.id);
    expect(core.reapResults()).toBeGreaterThanOrEqual(1);
    const refs = core.listNeta({ kind: "reference", scope: "all", limit: 100 });
    expect(refs.length).toBe(1);
    const content = refs[0]!.content as { references?: { title?: string }[] };
    expect(content.references?.[0]?.title).toBe("曲A");
  });
  it("テーマ(job.instruction)がプロンプトに載る＝汎用に落ちない", async () => {
    // scheduler は theme を instruction に入れる（params.topic ではない）。
    const job = core.enqueueJob({ intent: "research", instruction: "切ない冬のバラード", params: { schedule_id: "s1" } });
    const claimed = core.claimQueued(["research", "collect"])!;
    let seen = "";
    await runResearchJob(core, claimed, async (prompt) => {
      seen = prompt;
      return '{"summary":"ok","references":[{"title":"A"}]}';
    });
    expect(seen).toContain("切ない冬のバラード");
    expect(core.getJob(job.id)!.status).toBe("done");
  });

  it("shot が失敗したら failed＋error を残す（無言で消さない）", async () => {
    const job = core.enqueueJob({ intent: "research", params: { topic: "x" } });
    const claimed = core.claimQueued(["research", "collect"])!;
    await runResearchJob(core, claimed, async () => {
      throw new Error("boom");
    });
    const f = core.getJob(job.id)!;
    expect(f.status).toBe("failed");
    expect(f.error).toContain("boom");
  });
});
