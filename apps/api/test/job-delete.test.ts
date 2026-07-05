import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

// #100④-S6 ジョブ削除：消費者のいない/廃止インテントの死にジョブを消せる（トレイの自浄）。
describe("JobRepo.deleteJob / Core.deleteJob", () => {
  let core: Core;
  beforeEach(() => {
    core = new Core(openDb(":memory:"));
  });

  it("キューされたジョブを削除できる（存在→true、以後 getJob は null）", () => {
    const j = core.enqueueJob({ intent: "gen_melody" });
    expect(core.getJob(j.id)).not.toBeNull();
    expect(core.deleteJob(j.id)).toBe(true);
    expect(core.getJob(j.id)).toBeNull();
  });

  it("存在しない id は false", () => {
    expect(core.deleteJob("nope")).toBe(false);
  });

  it("failed ジョブも削除できる", () => {
    const j = core.enqueueJob({ intent: "consult" });
    core.failJob(j.id, "boom");
    expect(core.listJobs({ status: "failed" }).map((x) => x.id)).toContain(j.id);
    expect(core.deleteJob(j.id)).toBe(true);
    expect(core.listJobs({ status: "failed" })).toHaveLength(0);
  });
});

describe("DELETE /job/:id（http）", () => {
  let app: FastifyInstance;
  let core: Core;
  beforeEach(async () => {
    core = new Core(openDb(":memory:"));
    app = buildHttp(core);
    await app.ready();
  });

  it("200＋{deleted:true}＝以後 GET /job/:id は 404", async () => {
    const j = core.enqueueJob({ intent: "gen_melody" });
    const del = await app.inject({ method: "DELETE", url: `/job/${j.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ deleted: true });
    const get = await app.inject({ method: "GET", url: `/job/${j.id}` });
    expect(get.statusCode).toBe(404);
  });

  it("存在しない id は {deleted:false}", async () => {
    const del = await app.inject({ method: "DELETE", url: "/job/none" });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ deleted: false });
  });
});
