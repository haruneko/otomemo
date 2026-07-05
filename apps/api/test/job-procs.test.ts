import { describe, it, expect } from "vitest";
import { beginJobProc, endJobProc, killJobProc, isJobProcRunning } from "../src/job-procs";

describe("job-procs（バッチジョブの実プロセス登録簿）", () => {
  it("begin→走行中true・signal は未 abort", () => {
    const sig = beginJobProc("j1");
    expect(isJobProcRunning("j1")).toBe(true);
    expect(sig.aborted).toBe(false);
    endJobProc("j1");
    expect(isJobProcRunning("j1")).toBe(false);
  });

  it("kill→signal が abort し、走行中でなくなる（true を返す）", () => {
    const sig = beginJobProc("j2");
    expect(killJobProc("j2")).toBe(true);
    expect(sig.aborted).toBe(true); // spawn 側はこれで SIGKILL する
    expect(isJobProcRunning("j2")).toBe(false);
  });

  it("走行していない id の kill は false（副作用なし）", () => {
    expect(killJobProc("none")).toBe(false);
  });

  it("end 済みを kill しても false", () => {
    beginJobProc("j3");
    endJobProc("j3");
    expect(killJobProc("j3")).toBe(false);
  });
});
