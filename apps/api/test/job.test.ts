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
    expect(c.reapResults()).toBe(0); // 冪等：2回目は何もしない
  });

  it("does not reap synchronous (non-plan) gen jobs — those self-materialize", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    // parent_job_id 無し = クライアント(NetaCard)が自分でネタ化する同期ジョブ → reaper は触らない
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('js', 'gen_melody', '{}', 'done', ?, '', '')`,
    ).run(JSON.stringify({ content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }));
    expect(c.reapResults()).toBe(0);
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
