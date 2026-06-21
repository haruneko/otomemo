import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

let core: Core;
beforeEach(() => {
  core = new Core(openDb(":memory:"));
});

describe("job queue (producer side)", () => {
  it("enqueues a queued job and reads it back", () => {
    const j = core.enqueueJob({ intent: "mora_count", params: { text: "よる" } });
    expect(j.status).toBe("queued");
    expect(j.intent).toBe("mora_count");
    const got = core.getJob(j.id)!;
    expect(got.params).toEqual({ text: "よる" });
    expect(got.result).toBeNull();
  });

  it("lists jobs by status", () => {
    core.enqueueJob({ intent: "echo" });
    core.enqueueJob({ intent: "echo" });
    expect(core.listJobs({ status: "queued" }).length).toBe(2);
    expect(core.listJobs({ status: "done" }).length).toBe(0);
  });

  it("records job_result and links to target when from_job is given", () => {
    const target = core.createNeta({ kind: "lyric", text: "夜" });
    const job = core.enqueueJob({ intent: "suggest", target_neta_id: target.id });
    const result = core.createNeta({ kind: "other", text: "案A", from_job: job.id });
    expect(core.getJobResults(job.id)).toEqual([{ neta_id: result.id, role: "result" }]);
    expect(core.getRelations(target.id)).toEqual([{ to: result.id, type: "result" }]);
  });

  it("reaps async gen results into neta (background 受け取り)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    const target = c.createNeta({ kind: "lyric", text: "夜" });
    // plan の子のように、クライアント未受領の done な gen_melody（job_result 無し）
    db.prepare(
      `INSERT INTO job (id, intent, params, status, parent_job_id, target_neta_id, result_summary, created, updated)
       VALUES ('jm', 'gen_melody', '{}', 'done', 'plan1', ?, ?, '', '')`,
    ).run(target.id, JSON.stringify({ content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }));
    expect(c.reapResults()).toBe(1);
    expect(c.getJobResults("jm").length).toBe(1);
    expect(c.getRelations(target.id).some((r) => r.type === "result")).toBe(true);
    // #67 生成ネタの表示名は生kind("melody")でなく日本語ラベル/指示文
    const made = c.getJobResults("jm").map((r) => c.getNeta(r.neta_id!));
    expect(made[0]?.title).toBe("メロ案");
    expect(c.reapResults()).toBe(0); // 冪等：2回目は何もしない
  });

  it("reaped neta title uses the job instruction when present (#67)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, instruction, params, status, parent_job_id, result_summary, created, updated)
       VALUES ('ji', 'gen_chord', '切ないAメロ進行', '{}', 'done', 'plan1', ?, '', '')`,
    ).run(JSON.stringify({ content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }));
    expect(c.reapResults()).toBe(1);
    const nid = c.getJobResults("ji")[0]!.neta_id!;
    expect(c.getNeta(nid)?.title).toBe("切ないAメロ進行");
  });

  it("does not reap a FRESH synchronous (non-plan) gen job — client self-materializes", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    const fresh = new Date().toISOString();
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('js', 'gen_melody', '{}', 'done', ?, '', ?)`,
    ).run(JSON.stringify({ content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }), fresh);
    expect(c.reapResults()).toBe(0);
  });

  it("reaps a STALE parentless gen job — client never materialized it (no leak)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('jstale', 'gen_melody', '{}', 'done', ?, '', '2000-01-01T00:00:00.000Z')`,
    ).run(JSON.stringify({ content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }));
    expect(c.reapResults()).toBe(1);
  });

  it("does not reap empty gen results", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, parent_job_id, result_summary, created, updated)
       VALUES ('je', 'gen_chord', '{}', 'done', 'plan1', ?, '', '')`,
    ).run(JSON.stringify({ content: { chords: [] } }));
    expect(c.reapResults()).toBe(0);
  });

  it("reaps research with references into a reference neta (#9)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, parent_job_id, result_summary, created, updated)
       VALUES ('jr', 'research', '{}', 'done', 'plan1', ?, '', '')`,
    ).run(
      JSON.stringify({
        summary: "夜系の要点",
        references: [{ title: "曲A", artist: "X", why: "進行が近い", points: "IVm" }],
      }),
    );
    expect(c.reapResults()).toBe(1);
    const refs = c.listNeta({ kind: "reference" });
    expect(refs.length).toBe(1);
    expect((refs[0].content as { references: unknown[] }).references.length).toBe(1);
    expect(c.reapResults()).toBe(0); // 冪等
  });

  it("reaps collect with references into a reference neta too (#82)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, parent_job_id, result_summary, created, updated)
       VALUES ('jc', 'collect', '{}', 'done', 'plan1', ?, '', '')`,
    ).run(
      JSON.stringify({
        summary: "断片",
        references: [{ title: "IVM7→IIIm7", why: "切ない", points: "Aメロ頭" }],
      }),
    );
    expect(c.reapResults()).toBe(1);
    expect(c.listNeta({ kind: "reference" }).length).toBe(1);
  });

  it("reaps gen_variations into netas with compose edges + frame on container (#85 S2a)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('jv', 'gen_variations', ?, 'done', ?, '', '')`,
    ).run(
      JSON.stringify({ frame: { meter: "6/8", tempo: 120 } }),
      JSON.stringify({
        items: [
          { kind: "chord_progression", content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] }, label: "案A" },
          { kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] }, label: "案A" },
          { kind: "section", label: "案A" },
        ],
        edges: [
          { type: "compose", from: 2, to: 0, position: 0 },
          { type: "compose", from: 2, to: 1, position: 1 },
        ],
      }),
    );
    expect(c.reapResults()).toBe(3);
    const secs = c.listNeta({ kind: "section" });
    expect(secs.length).toBe(1);
    expect(secs[0].meter).toBe("6/8"); // container にも frame
    expect(c.getComposition(secs[0].id).children.length).toBe(2); // chord + melody が子
    expect(c.reapResults()).toBe(0); // 冪等
  });

  it("gen_variations drops edges touching empty items but keeps the rest (#85 S2a)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('jv2', 'gen_variations', '{}', 'done', ?, '', '')`,
    ).run(
      JSON.stringify({
        items: [
          { kind: "chord_progression", content: { chords: [] }, label: "空" }, // 空→null(idx0)
          { kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] }, label: "有" }, // idx1
        ],
        edges: [{ type: "relation", from: 0, to: 1 }], // from=null → 捨てる
      }),
    );
    expect(c.reapResults()).toBe(1); // melody だけ
    const mel = c.listNeta({ kind: "melody" });
    expect(mel.length).toBe(1);
    expect(c.getRelations(mel[0].id).length).toBe(0); // edge は張られない
  });

  it("reaps gen with frame from params onto the neta as hints (#85 S1)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, parent_job_id, result_summary, created, updated)
       VALUES ('jf', 'gen_chord', ?, 'done', 'plan1', ?, '', '')`,
    ).run(
      JSON.stringify({ frame: { meter: "6/8", tempo: 120, key: 9, bars: 8, mood: "切ない" } }),
      JSON.stringify({ content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }),
    );
    expect(c.reapResults()).toBe(1);
    const cp = c.listNeta({ kind: "chord_progression" })[0];
    expect(cp.meter).toBe("6/8");
    expect(cp.tempo).toBe(120);
    expect(cp.key).toBe(9);
    expect(cp.bars).toBe(8);
    expect(cp.mood).toBe("切ない");
  });

  it("reaps gen without frame leaves hints null (#85 S1 後退ゼロ)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, parent_job_id, result_summary, created, updated)
       VALUES ('jf2', 'gen_melody', '{}', 'done', 'plan1', ?, '', '')`,
    ).run(JSON.stringify({ content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }));
    expect(c.reapResults()).toBe(1);
    expect(c.listNeta({ kind: "melody" })[0].meter).toBe(null);
  });

  it("reaps import_midi tracks into melody/rhythm netas (#81)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('jm2', 'import_midi', '{}', 'done', ?, '', '')`,
    ).run(
      JSON.stringify({
        tracks: [
          { kind: "melody", title: "song - Track1", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } },
          { kind: "rhythm", title: "song - ドラム", content: { rhythm: { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }] } } },
        ],
      }),
    );
    expect(c.reapResults()).toBe(2);
    expect(c.listNeta({ kind: "melody" }).some((n) => n.title === "song - Track1")).toBe(true);
    expect(c.listNeta({ kind: "rhythm" }).length).toBe(1);
    expect(c.reapResults()).toBe(0); // 冪等
  });

  it("import_midi with empty tracks does not leak re-reaps (#81)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('jm3', 'import_midi', '{}', 'done', ?, '', '')`,
    ).run(JSON.stringify({ tracks: [] }));
    expect(c.reapResults()).toBe(0);
    expect(c.reapResults()).toBe(0); // 空マーカーで再reapしない
  });

  it("does not reap research with empty references (#9)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, parent_job_id, result_summary, created, updated)
       VALUES ('jr0', 'research', '{}', 'done', 'plan1', ?, '', '')`,
    ).run(JSON.stringify({ summary: "テキストのみ", references: [] }));
    expect(c.reapResults()).toBe(0);
  });

  it("enqueues via HTTP", async () => {
    const app: FastifyInstance = buildHttp(core);
    await app.ready();
    const r = await app.inject({
      method: "POST",
      url: "/job",
      payload: { intent: "mora_count", params: { text: "よるをかける" } },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe("queued");
    const id = r.json().id;
    const g = await app.inject({ method: "GET", url: `/job/${id}` });
    expect(g.json().intent).toBe("mora_count");
  });
});
