import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

// #100④-S6 停止：走行中ターンを止める→/turn は**それまでの部分テキストを永続化して完了**する。
// getChatSession をモックし、say() は stop() が呼ばれるまで解決しない（＝実 claude を殺した時の再現）。
let resolveSay: (() => void) | null = null;
const say = vi.fn((_text: string, onEvent: (e: unknown) => void) => {
  onEvent({ type: "assistant", message: { content: [{ type: "text", text: "途中まで書いた案" }] } });
  return new Promise<void>((res) => {
    resolveSay = () => {
      // 実装では proc の exit で合成 result(aborted) を流して解決する。それを模す。
      onEvent({ type: "result", subtype: "aborted", is_error: false, result: "" });
      res();
    };
  });
});
const stop = vi.fn(() => resolveSay?.());
vi.mock("../src/chat-session", () => ({
  getChatSession: () => ({ say, stop }),
  stopChatSession: (_thread: string) => {
    stop();
    return true;
  },
}));

import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

describe("POST /chat/:thread/turn/stop（停止＝部分テキストを残して完了）", () => {
  let app: FastifyInstance;
  let core: Core;
  beforeEach(async () => {
    resolveSay = null;
    say.mockClear();
    stop.mockClear();
    core = new Core(openDb(":memory:"));
    app = buildHttp(core);
    await app.ready();
  });

  it("stop→turn が部分 assistant テキストを chat_message に残して完了する", async () => {
    const turnP = app.inject({ method: "POST", url: "/chat/tstop/turn", payload: { text: "長めの相談" } });
    await new Promise((r) => setTimeout(r, 20)); // say が部分テキストを出しレジストリに載るのを待つ
    const stopRes = await app.inject({ method: "POST", url: "/chat/tstop/turn/stop" });
    expect(stopRes.statusCode).toBe(200);
    expect(stopRes.json()).toEqual({ stopped: true });
    await turnP; // 停止で /turn が解決するはず（ハングしない）
    const msgs = core.listChatMessages("tstop");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("assistant");
    expect(msgs[0].text).toBe("途中まで書いた案"); // 出た分は捨てない
  });

  it("走行中ターンが無ければ stopChatSession は true でも副作用なく 200", async () => {
    const r = await app.inject({ method: "POST", url: "/chat/idle/turn/stop" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toHaveProperty("stopped");
  });
});
