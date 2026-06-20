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
