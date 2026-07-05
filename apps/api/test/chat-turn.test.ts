import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

// getChatSession をモック＝実 claude を spawn せず、擬似イベントを流す。
// 目的：/turn がターン完了時に assistant 返信を**サーバ側で永続化**することの回帰テスト
// （チャットを閉じてストリームが切れても締めの返信が chat_message に残る、の核）。
const say = vi.fn(async (text: string, onEvent: (e: unknown) => void) => {
  onEvent({ type: "assistant", message: { content: [{ type: "text", text: "とりあえずの案" }] } });
  onEvent({ type: "result", result: "こう直すのはどう？" });
});
vi.mock("../src/chat-session", () => ({
  getChatSession: () => ({ say }),
}));

import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

describe("POST /chat/:thread/turn（ストリーム切れ対策＝サーバ側でターンを永続化）", () => {
  let app: FastifyInstance;
  let core: Core;
  beforeEach(async () => {
    say.mockClear();
    core = new Core(openDb(":memory:"));
    app = buildHttp(core);
    await app.ready();
  });

  it("ターン完了時に assistant 返信（result の最終テキスト）を chat_message へ保存する", async () => {
    await app.inject({ method: "POST", url: "/chat/t-turn/turn", payload: { text: "メロ直して" } });
    const msgs = core.listChatMessages("t-turn");
    // クライアントが載せる user 発言はこの経路(inject)では来ない＝assistant 1件だけがサーバ保存される。
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("assistant");
    expect(msgs[0].text).toBe("こう直すのはどう？");
    expect(msgs[0].kind).toBe("chat");
  });

  it("再オープンで GET /messages に締めの返信が出る（閉じても消えない）", async () => {
    await app.inject({ method: "POST", url: "/chat/t2/turn", payload: { text: "続き" } });
    const r = await app.inject({ method: "GET", url: "/chat/t2/messages" });
    expect(r.statusCode).toBe(200);
    expect(r.json().map((m: { text: string }) => m.text)).toEqual(["こう直すのはどう？"]);
  });

  it("走行していない thread の /turn/status は live:false", async () => {
    const r = await app.inject({ method: "GET", url: "/chat/idle/turn/status" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ live: false });
  });

  it("走行中ターンが無ければ /turn/live は即 done（no-op）", async () => {
    const r = await app.inject({ method: "GET", url: "/chat/idle/turn/live" });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain("event: done");
  });
});
