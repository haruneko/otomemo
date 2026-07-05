import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

// #S8 書込(capture/revise/assemble)で作られたネタ参照を assistant メッセージに永続化する回帰テスト
// ＝チャットを開き直しても「ネタへのカード/リンク」が消えない（S5 でカードは非永続だった）。
const say = vi.fn((_text: string, onEvent: (e: unknown) => void) => {
  // capture の tool_use → tool_result(ネタ) → 最終テキスト、の順で流す（claude stream-json 形）。
  onEvent({ type: "assistant", message: { content: [{ type: "tool_use", id: "tu1", name: "mcp__creative-manager__capture", input: {} }] } });
  onEvent({
    type: "user",
    message: {
      content: [{
        type: "tool_result", tool_use_id: "tu1",
        content: [{ type: "text", text: JSON.stringify({ id: "neta-xyz", kind: "chord_progression", title: "作った進行" }) }],
      }],
    },
  });
  onEvent({ type: "assistant", message: { content: [{ type: "text", text: "保存しました。" }] } });
  onEvent({ type: "result", result: "保存しました。" });
});
vi.mock("../src/chat-session", () => ({ getChatSession: () => ({ say }) }));

import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

describe("POST /chat/:thread/turn＝作られたネタ参照を data.netas に永続化", () => {
  let app: FastifyInstance;
  let core: Core;
  beforeEach(async () => {
    say.mockClear();
    core = new Core(openDb(":memory:"));
    app = buildHttp(core);
    await app.ready();
  });

  it("capture の tool_result から neta(id/kind/title) を拾い、assistant メッセージの data.netas に残す", async () => {
    await app.inject({ method: "POST", url: "/chat/tn/turn", payload: { text: "この進行を保存して" } });
    const msgs = core.listChatMessages("tn");
    expect(msgs).toHaveLength(1);
    const m = msgs[0];
    expect(m.role).toBe("assistant");
    expect(m.text).toBe("保存しました。");
    expect(m.data).toEqual({ netas: [{ id: "neta-xyz", kind: "chord_progression", title: "作った進行" }] });
  });

  it("再オープン(GET /messages)でも data.netas が返る＝カード復元の材料が残る", async () => {
    await app.inject({ method: "POST", url: "/chat/tn2/turn", payload: { text: "保存して" } });
    const r = await app.inject({ method: "GET", url: "/chat/tn2/messages" });
    const rows = r.json() as { role: string; data: unknown }[];
    const asst = rows.find((x) => x.role === "assistant")!;
    expect(asst.data).toMatchObject({ netas: [{ id: "neta-xyz" }] });
  });
});
