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

  it("チャット発(chat_thread)のジョブは reap が結果をそのスレッドへ記録（fb-3・サーバ著者）", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, parent_job_id, result_summary, created, updated)
       VALUES ('jc', 'gen_melody', ?, 'done', 'plan1', ?, '', '')`,
    ).run(
      JSON.stringify({ chat_thread: "chat:abc" }),
      JSON.stringify({ content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }),
    );
    expect(c.reapResults()).toBe(1);
    const msgs = c.listChatMessages("chat:abc");
    expect(msgs.length).toBe(1); // クライアントが居なくてもサーバがスレッドに残す
    expect(msgs[0]!.role).toBe("ai");
    expect((msgs[0]!.data as { neta?: { kind?: string } } | null)?.neta?.kind).toBe("melody"); // ネタ参照を同梱
  });
  it("reap は相対bass(pattern・notes/chords無し)を落とさない（hasMusic pattern・S3）", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('jb', 'gen_pair_rule', '{}', 'done', ?, '', '')`,
    ).run(
      JSON.stringify({
        items: [
          { kind: "bass", content: { mode: "relative", steps: 16, pattern: [{ step: 0, degree: "R", dur: 4 }] }, label: "ベース案" },
        ],
        edges: [],
      }),
    );
    expect(c.reapResults()).toBe(1); // pattern を見るので materialize される（旧hasMusicは0で落としていた）
    expect(c.listNeta({ kind: "bass" }).length).toBe(1);
  });

  it("facets は既定 project（library 値を混ぜない・S3）", () => {
    core.createNeta({ kind: "melody", mood: "作業", scope: "project" });
    core.createNeta({ kind: "chord_progression", mood: "取込専用", scope: "library" });
    expect(core.facets().mood).toEqual(["作業"]); // 既定=project
    expect(core.facets("all").mood.sort()).toEqual(["作業", "取込専用"]);
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

  it("reaps agentic consult (type:items) into netas, ignores type:chat (#86 S2b)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    // agentic consult＝ツール推敲済みの items 結果 → reap が materialize（縫合をreapに統一）
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('jca', 'consult', '{}', 'done', ?, '', '')`,
    ).run(
      JSON.stringify({
        type: "items",
        items: [
          { kind: "chord_progression", content: { chords: [{ root: 0, quality: "m", start: 0, dur: 4 }] }, label: "案" },
          { kind: "melody", content: { notes: [{ pitch: 72, start: 0, dur: 1 }] }, label: "案" },
        ],
        edges: [{ type: "relation", from: 0, to: 1 }],
      }),
    );
    // 普通の chat consult は reap 対象外
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('jcc', 'consult', '{}', 'done', ?, '', '')`,
    ).run(JSON.stringify({ type: "chat", text: "やあ" }));
    expect(c.reapResults()).toBe(2); // items の2ネタだけ
    expect(c.listNeta({ kind: "chord_progression" }).length).toBe(1);
    expect(c.listNeta({ kind: "melody" }).length).toBe(1);
    expect(c.reapResults()).toBe(0); // 冪等・chat は触らない
  });

  it("reaps gen_pair_rule into chord+melody under a section (#86)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('jpr', 'gen_pair_rule', '{}', 'done', ?, '', '')`,
    ).run(
      JSON.stringify({
        items: [
          { kind: "chord_progression", content: { chords: [{ root: 0, quality: "m", start: 0, dur: 4 }] }, label: "案1" },
          { kind: "melody", content: { notes: [{ pitch: 72, start: 0, dur: 1 }] }, label: "案1", meta: { fit: { score: 0.9 } } },
          { kind: "section", label: "案1" },
        ],
        edges: [
          { type: "compose", from: 2, to: 0, position: 0 },
          { type: "compose", from: 2, to: 1, position: 1 },
        ],
      }),
    );
    expect(c.reapResults()).toBe(3);
    const sec = c.listNeta({ kind: "section" });
    expect(sec.length).toBe(1);
    expect(c.getComposition(sec[0].id).children.length).toBe(2);
  });

  it("reaps gen_chords_rule (rule-based) into a chord_progression neta (#86)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('jcr', 'gen_chords_rule', '{}', 'done', ?, '', '')`,
    ).run(
      JSON.stringify({
        items: [{ kind: "chord_progression", content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] }, label: "ルール" }],
        edges: [],
      }),
    );
    expect(c.reapResults()).toBe(1);
    expect(c.listNeta({ kind: "chord_progression" }).length).toBe(1);
  });

  it("reaps gen_lyric items as lyric netas carrying text (#85 S2c)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('jl', 'gen_lyric', '{}', 'done', ?, '', '')`,
    ).run(JSON.stringify({ items: [{ kind: "lyric", text: "夜を駆ける", label: "夜" }], edges: [] }));
    expect(c.reapResults()).toBe(1);
    const ly = c.listNeta({ kind: "lyric" });
    expect(ly.length).toBe(1);
    expect(ly[0].text).toBe("夜を駆ける");
  });

  it("reaps transform variant with new frame, content unchanged (#85 S2c)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('jt', 'transform', ?, 'done', ?, '', '')`,
    ).run(
      JSON.stringify({ frame: { meter: "6/8" } }),
      JSON.stringify({ items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] }, label: "変換" }], edges: [] }),
    );
    expect(c.reapResults()).toBe(1);
    const m = c.listNeta({ kind: "melody" })[0];
    expect(m.meter).toBe("6/8"); // 拍子は frame ヒントで付与
    expect((m.content as { notes: { pitch: number }[] }).notes[0].pitch).toBe(60); // C基準のまま
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

  it("reaps gen with string key / time_signature alias onto neta hints (#86 robust)", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, parent_job_id, result_summary, created, updated)
       VALUES ('jrk', 'gen_chord', ?, 'done', 'plan1', ?, '', '')`,
    ).run(
      JSON.stringify({ frame: { key: "A", time_signature: "6/8" } }), // Claudeの揺れ
      JSON.stringify({ content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }),
    );
    expect(c.reapResults()).toBe(1);
    const cp = c.listNeta({ kind: "chord_progression" })[0];
    expect(cp.key).toBe(9); // "A" → 9
    expect(cp.meter).toBe("6/8"); // time_signature → meter
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

  it("jobOutcome: settled only when all descendants terminal, collects neta from self+children", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    const target = c.createNeta({ kind: "lyric", text: "夜" });
    // 親=plan を返した consult。子2つ（gen_chord/gen_melody, parent_job_id=親）。
    db.prepare(
      `INSERT INTO job (id, intent, params, status, target_neta_id, result_summary, created, updated)
       VALUES ('parent', 'consult', '{}', 'done', ?, ?, '', '')`,
    ).run(target.id, JSON.stringify({ type: "plan", subtasks: [{}, {}] }));
    db.prepare(
      `INSERT INTO job (id, intent, params, status, parent_job_id, target_neta_id, result_summary, created, updated)
       VALUES ('c1', 'gen_chord', '{}', 'done', 'parent', ?, ?, '', '')`,
    ).run(target.id, JSON.stringify({ content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }));
    db.prepare(
      `INSERT INTO job (id, intent, params, status, parent_job_id, target_neta_id, created, updated)
       VALUES ('c2', 'gen_melody', '{}', 'queued', 'parent', ?, '', '')`,
    ).run(target.id);

    // c2 はまだ queued ＝未終端 → settled=false
    let o = c.jobOutcome("parent");
    expect(o.settled).toBe(false);
    expect(o.jobs.length).toBe(3); // self + 2 children
    expect(o.failed).toBe(0);

    // c2 を done に。reap で c1/c2 をネタ化。
    db.prepare(`UPDATE job SET status='done', result_summary=? WHERE id='c2'`).run(
      JSON.stringify({ content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }),
    );
    c.reapResults();
    o = c.jobOutcome("parent");
    expect(o.settled).toBe(true);
    expect(o.neta.length).toBe(2); // chord + melody
    const kinds = o.neta.map((n) => n.kind).sort();
    expect(kinds).toEqual(["chord_progression", "melody"]);
  });

  it("jobOutcome: counts a failed child and stays settled", () => {
    const db = openDb(":memory:");
    const c = new Core(db);
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('p2', 'consult', '{}', 'done', '{}', '', '')`,
    ).run();
    db.prepare(
      `INSERT INTO job (id, intent, params, status, parent_job_id, error, created, updated)
       VALUES ('cf', 'gen_chord', '{}', 'failed', 'p2', 'boom', '', '')`,
    ).run();
    const o = c.jobOutcome("p2");
    expect(o.settled).toBe(true);
    expect(o.failed).toBe(1);
    expect(o.neta.length).toBe(0);
  });

  it("GET /job/:id/outcome returns settled + neta", async () => {
    const app: FastifyInstance = buildHttp(core);
    await app.ready();
    const db = (core as unknown as { db: import("better-sqlite3").Database }).db;
    db.prepare(
      `INSERT INTO job (id, intent, params, status, result_summary, created, updated)
       VALUES ('po', 'consult', '{}', 'done', ?, '', '')`,
    ).run(JSON.stringify({ type: "items" }));
    const r = await app.inject({ method: "GET", url: "/job/po/outcome" });
    expect(r.statusCode).toBe(200);
    expect(r.json().settled).toBe(true);
    expect(Array.isArray(r.json().neta)).toBe(true);
    // 無効idは settled:true でなく 404（存在しないジョブを「決着済み」と誤らない）
    const miss = await app.inject({ method: "GET", url: "/job/does-not-exist/outcome" });
    expect(miss.statusCode).toBe(404);
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
