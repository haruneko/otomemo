import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

// #70 Chat履歴の永続化（サーバ保存・スレッド=対象ネタ）。

describe("Core chat messages (#70)", () => {
  let core: Core;
  beforeEach(() => {
    core = new Core(openDb(":memory:"));
  });

  it("add then list returns messages in created order", () => {
    core.addChatMessage({ thread: "t1", role: "user", text: "hi" });
    core.addChatMessage({ thread: "t1", role: "ai", kind: "chat", text: "yo" });
    const msgs = core.listChatMessages("t1");
    expect(msgs.map((m) => m.text)).toEqual(["hi", "yo"]);
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].kind).toBe("chat");
  });

  it("preserves structured data payload (round-trip JSON)", () => {
    const data = { options: [{ title: "A", body: "b" }] };
    core.addChatMessage({ thread: "t1", role: "ai", kind: "options", data });
    const [m] = core.listChatMessages("t1");
    expect(m.data).toEqual(data);
  });

  it("keeps threads separate (A and B do not mix)", () => {
    core.addChatMessage({ thread: "A", role: "user", text: "a-msg" });
    core.addChatMessage({ thread: "B", role: "user", text: "b-msg" });
    expect(core.listChatMessages("A").map((m) => m.text)).toEqual(["a-msg"]);
    expect(core.listChatMessages("B").map((m) => m.text)).toEqual(["b-msg"]);
  });

  it("clear removes only the given thread", () => {
    core.addChatMessage({ thread: "A", role: "user", text: "a" });
    core.addChatMessage({ thread: "B", role: "user", text: "b" });
    core.clearChatThread("A");
    expect(core.listChatMessages("A")).toEqual([]);
    expect(core.listChatMessages("B").length).toBe(1);
  });
});

// プロジェクト＝一曲(or組曲)の器：会話セッションを器に束ねる（chat_thread・B案）。
describe("Core chat threads bound to project (workspace)", () => {
  let core: Core;
  beforeEach(() => {
    core = new Core(openDb(":memory:"));
  });

  it("listChatThreads(project) returns only that project's sessions", () => {
    core.setChatThread({ thread: "chat:a", project: "みなそこ" });
    core.setChatThread({ thread: "chat:b", project: "別曲" });
    core.addChatMessage({ thread: "chat:a", role: "user", text: "a" });
    core.addChatMessage({ thread: "chat:b", role: "user", text: "b" });
    expect(core.listChatThreads("みなそこ").map((t) => t.thread)).toEqual(["chat:a"]);
    expect(core.listChatThreads("別曲").map((t) => t.thread)).toEqual(["chat:b"]);
  });

  it("legacy thread (messages, no chat_thread row) = unsorted: in all-list, not in any project", () => {
    core.addChatMessage({ thread: "chat:legacy", role: "user", text: "old" });
    expect(core.listChatThreads().map((t) => t.thread)).toContain("chat:legacy");
    expect(core.listChatThreads("みなそこ").map((t) => t.thread)).not.toContain("chat:legacy");
  });

  it("empty session (registered, no messages yet) still lists under its project", () => {
    core.setChatThread({ thread: "chat:new", project: "みなそこ", title: "サビのメロ案" });
    const [t] = core.listChatThreads("みなそこ");
    expect(t.thread).toBe("chat:new");
    expect(t.count).toBe(0);
    expect(t.title).toBe("サビのメロ案");
    expect(t.project).toBe("みなそこ");
  });

  it("setChatThread upserts: partial update keeps existing fields", () => {
    core.setChatThread({ thread: "chat:a", project: "みなそこ", title: "初手" });
    core.setChatThread({ thread: "chat:a", title: "改題" }); // project は触らない
    const [t] = core.listChatThreads("みなそこ");
    expect(t.title).toBe("改題");
    expect(t.project).toBe("みなそこ");
  });
});

describe("http chat API (#70)", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = buildHttp(new Core(openDb(":memory:")));
    await app.ready();
  });

  it("POST a message then GET it back (created order)", async () => {
    await app.inject({
      method: "POST",
      url: "/chat/global/message",
      payload: { role: "user", text: "hello" },
    });
    await app.inject({
      method: "POST",
      url: "/chat/global/message",
      payload: { role: "ai", kind: "chat", text: "hi" },
    });
    const r = await app.inject({ method: "GET", url: "/chat/global/messages" });
    expect(r.statusCode).toBe(200);
    expect(r.json().map((m: { text: string }) => m.text)).toEqual(["hello", "hi"]);
  });

  it("requires role (400)", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/chat/global/message",
      payload: { text: "no role" },
    });
    expect(r.statusCode).toBe(400);
  });

  it("POST /chat/:thread/meta binds a session to a project, GET filters by it", async () => {
    await app.inject({ method: "POST", url: "/chat/chat:x/meta", payload: { project: "みなそこ" } });
    await app.inject({ method: "POST", url: "/chat/chat:x/message", payload: { role: "user", text: "hi" } });
    const r = await app.inject({ method: "GET", url: "/chat/threads?project=みなそこ" });
    expect(r.statusCode).toBe(200);
    const threads = r.json() as { thread: string; project: string | null }[];
    expect(threads.map((t) => t.thread)).toEqual(["chat:x"]);
    expect(threads[0].project).toBe("みなそこ");
  });

  it("DELETE clears the thread", async () => {
    await app.inject({
      method: "POST",
      url: "/chat/t/message",
      payload: { role: "user", text: "x" },
    });
    const del = await app.inject({ method: "DELETE", url: "/chat/t/messages" });
    expect(del.statusCode).toBe(200);
    const r = await app.inject({ method: "GET", url: "/chat/t/messages" });
    expect(r.json()).toEqual([]);
  });
});
