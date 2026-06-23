import { describe, it, expect, vi } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";

// #3 DB の JSON 列は外部書込/部分書込で壊れうる。1行の壊れ JSON で getter/一覧全体を巻き込まない
// （reaper.ts は既にこの方針＝core も揃える）。壊れたら null＋warn（無音にしない）。

describe("#3 壊れ JSON 列の安全パース", () => {
  it("neta.content が壊れていても getNeta は throw せず content=null", () => {
    const db = openDb(":memory:");
    const core = new Core(db);
    const n = core.createNeta({ kind: "melody", content: { notes: [] } });
    db.prepare("UPDATE neta SET content=? WHERE id=?").run("{not json", n.id);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const got = core.getNeta(n.id)!;
    expect(got).not.toBeNull();
    expect(got.content).toBeNull();
    expect(warn).toHaveBeenCalled(); // 無音にしない
    warn.mockRestore();
  });

  it("job の params が壊れていても listJobs は1行も落とさず全件返す", () => {
    const db = openDb(":memory:");
    const core = new Core(db);
    const j1 = core.enqueueJob({ intent: "echo", params: { a: 1 } });
    core.enqueueJob({ intent: "echo", params: { b: 2 } });
    db.prepare("UPDATE job SET params=? WHERE id=?").run("{broken", j1.id);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const jobs = core.listJobs({});
    expect(jobs.length).toBe(2); // 壊れ行で一覧全体が落ちない
    expect(jobs.find((x) => x.id === j1.id)!.params).toBeNull();
    warn.mockRestore();
  });

  it("正常な JSON は従来どおりパースされる（回帰なし）", () => {
    const db = openDb(":memory:");
    const core = new Core(db);
    const n = core.createNeta({ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } });
    expect(core.getNeta(n.id)!.content).toEqual({ notes: [{ pitch: 60, start: 0, dur: 1 }] });
  });
});
