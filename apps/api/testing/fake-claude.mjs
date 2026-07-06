#!/usr/bin/env node
// テスト用フェイク claude（e2e 決定化）。実 claude を spawn する代わりに chat-session.ts が
// CM_FAKE_CLAUDE=<このファイル> の時にこれを起動する。実 claude の stream-json 契約を模す：
//   - 起動直後に system/init（mcp ツール名入り）を吐く＝api の warmup が即通過（mcpReady=true）。
//   - stdin の {type:"user",...} 1行ごとに1ターン：--include-partial-messages 相当の
//     stream_event(content_block_delta/text_delta) を時間差で複数 → full assistant → result。
// 目的：①逐次表示（デルタが時間差で届く）と ②再アタッチ（生成中に離脱→復帰）を決定的に検証する。
//
// 調整 env：
//   CM_FAKE_DELAY_MS  デルタ間隔(ms、既定120)。reattach で「生成中に離脱」する猶予を作る。
//   CM_FAKE_REPLY     返信本文（既定は下の固定文）。末尾に必ず END_MARK を付ける＝完了検証の錨。
import { createInterface } from "node:readline";

const DELAY = Number(process.env.CM_FAKE_DELAY_MS ?? 120);
const END_MARK = "【返信おわり】";
const BASE_REPLY =
  process.env.CM_FAKE_REPLY ??
  "なるほど、その方向で考えてみましょう。まずコード進行を素直に置いて、サビで転回を効かせると映えます。";
const REPLY = `${BASE_REPLY}${END_MARK}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function emit(ev) {
  process.stdout.write(JSON.stringify(ev) + "\n");
}

// 起動直後の init：mcp ツールが見える＝chat-session の warmup が即 mcpReady=true で抜ける。
emit({
  type: "system",
  subtype: "init",
  session_id: "fake",
  tools: ["mcp__creative-manager__generate", "mcp__creative-manager__capture"],
});

let queue = Promise.resolve();
async function runTurn(userText) {
  // warmup 用の短い問い（"OK とだけ返して。"）には即 result（ストリームしない）＝起動を速く。
  if (userText.includes("OK とだけ")) {
    emit({ type: "assistant", message: { content: [{ type: "text", text: "OK" }] } });
    emit({ type: "result", subtype: "success", is_error: false, result: "OK" });
    return;
  }
  emit({ type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } });
  // 返信を文字の塊に割って time-sliced に流す（＝タラタラ出る手触りを再現）。
  const chunks = REPLY.match(/.{1,8}/gu) ?? [REPLY];
  for (const c of chunks) {
    await sleep(DELAY);
    emit({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: c } } });
  }
  emit({ type: "stream_event", event: { type: "content_block_stop", index: 0 } });
  // full assistant ブロック＋ result（実 claude はデルタの後に完成形も出す）。
  emit({ type: "assistant", message: { content: [{ type: "text", text: REPLY }] } });
  emit({ type: "result", subtype: "success", is_error: false, result: REPLY });
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const s = line.trim();
  if (!s) return;
  let msg;
  try { msg = JSON.parse(s); } catch { return; }
  if (msg?.type !== "user") return;
  const blocks = msg.message?.content ?? [];
  const text = blocks.map((b) => (typeof b?.text === "string" ? b.text : "")).join("");
  // ターンは直列化（実 claude 同様、1プロセス=1会話の順序を保つ）。
  queue = queue.then(() => runTurn(text));
});
// stdin が閉じたら終了（親が kill した時も同様）。
rl.on("close", () => process.exit(0));
