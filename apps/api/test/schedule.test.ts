import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { openDb } from "../src/db";
import { Core } from "../src/core";

let db: Database.Database;
let core: Core;

beforeEach(() => {
  db = openDb(":memory:");
  core = new Core(db);
});

describe("schedule (#80 proactive)", () => {
  it("addSchedule lists and runs immediately on next tick (next_run=now)", () => {
    const theme = core.createNeta({ kind: "knowledge", title: "シティポップのコード" });
    const s = core.addSchedule({ neta_id: theme.id, intent: "research", every_sec: 21600 });
    expect(core.listSchedules(theme.id).map((x) => x.id)).toContain(s.id);

    // next_run=now なので即 due → research ジョブが1件積まれる
    expect(core.tickSchedules()).toBe(1);
    const jobs = core.listJobs({ status: "queued" });
    const j = jobs.find((x) => x.intent === "research");
    expect(j).toBeTruthy();
    expect(j!.target_neta_id).toBe(theme.id);
    expect(j!.instruction).toBe("シティポップのコード"); // テーマ=対象ネタ名
    expect((j!.params as { schedule_id?: string }).schedule_id).toBe(s.id);
  });

  it("does not re-enqueue while a prior job is still pending (spam防止)", () => {
    const theme = core.createNeta({ kind: "knowledge", title: "X" });
    core.addSchedule({ neta_id: theme.id, intent: "research", every_sec: 60 });
    expect(core.tickSchedules()).toBe(1); // 1件積む
    // next_run は未来へ進む＋まだ queued が残る → 2回目は0
    expect(core.tickSchedules()).toBe(0);
  });

  it("disabled schedule is skipped", () => {
    const theme = core.createNeta({ kind: "knowledge", title: "Y" });
    const s = core.addSchedule({ neta_id: theme.id, intent: "research", every_sec: 60 });
    core.setScheduleEnabled(s.id, false);
    expect(core.tickSchedules()).toBe(0);
    core.setScheduleEnabled(s.id, true);
    expect(core.tickSchedules()).toBe(1);
  });

  it("deleteSchedule removes it", () => {
    const s = core.addSchedule({ intent: "research", every_sec: 60 });
    expect(core.deleteSchedule(s.id)).toBe(true);
    expect(core.listSchedules()).toHaveLength(0);
  });
});
