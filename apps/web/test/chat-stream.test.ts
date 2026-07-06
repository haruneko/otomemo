import { describe, it, expect } from "vitest";
import {
  parseTurnEvent, toolLabel, classifyTool, toolCardFromResult, type TurnAction,
} from "../src/chat-stream";

// #100④-S3a：常駐 claude の stream-json 1イベント → UIアクションへの純変換。
// 脳は Claude（自然文＋tool_use）。web は描くだけ＝この純関数が契約。
describe("toolLabel", () => {
  it("MCP verb を人間語の実況に（prefix 有無どちらでも）", () => {
    expect(toolLabel("mcp__creative-manager__generate")).toBe("作ってる");
    expect(toolLabel("generate")).toBe("作ってる");
    expect(toolLabel("search")).toBe("探してる");
    expect(toolLabel("analyze")).toBe("調べてる");
  });
  it("未知ツールは名前そのまま（捏造しない）", () => {
    expect(toolLabel("mcp__creative-manager__zzz")).toBe("zzz");
  });
});

describe("parseTurnEvent", () => {
  it("assistant の text ブロック → text アクション", () => {
    const ev = { type: "assistant", message: { content: [{ type: "text", text: "やあ" }] } };
    expect(parseTurnEvent(ev)).toEqual<TurnAction[]>([{ kind: "text", text: "やあ" }]);
  });
  it("assistant の tool_use → tool アクション（人間語ラベル付き）", () => {
    const ev = { type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__creative-manager__search", input: {} }] } };
    expect(parseTurnEvent(ev)).toEqual<TurnAction[]>([{ kind: "tool", name: "mcp__creative-manager__search", label: "探してる" }]);
  });
  it("text と tool_use 混在は順に両方", () => {
    const ev = { type: "assistant", message: { content: [
      { type: "text", text: "探すね" },
      { type: "tool_use", name: "search", input: {} },
    ] } };
    expect(parseTurnEvent(ev)).toEqual<TurnAction[]>([
      { kind: "text", text: "探すね" },
      { kind: "tool", name: "search", label: "探してる" },
    ]);
  });
  it("result → 確定（最終テキスト＋エラー有無）", () => {
    expect(parseTurnEvent({ type: "result", subtype: "success", result: "完了", is_error: false }))
      .toEqual<TurnAction[]>([{ kind: "result", text: "完了", isError: false }]);
    expect(parseTurnEvent({ type: "result", subtype: "error_max_turns", result: "", is_error: true }))
      .toEqual<TurnAction[]>([{ kind: "result", text: "", isError: true }]);
  });
  it("error イベント（api 中継の起動失敗など）→ result(isError)", () => {
    expect(parseTurnEvent({ type: "error", error: "起動失敗" }))
      .toEqual<TurnAction[]>([{ kind: "result", text: "起動失敗", isError: true }]);
  });
  it("init / 空 text は無視", () => {
    expect(parseTurnEvent({ type: "system", subtype: "init", tools: [] })).toEqual([]);
    expect(parseTurnEvent({ type: "assistant", message: { content: [{ type: "text", text: "" }] } })).toEqual([]);
  });
  it("#① stream_event の content_block_delta(text_delta) → textDelta（加算用）", () => {
    const ev = { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "こん" } } };
    expect(parseTurnEvent(ev)).toEqual<TurnAction[]>([{ kind: "textDelta", text: "こん" }]);
  });
  it("#① stream_event の非テキスト系(block_start/stop・message_delta)は無視", () => {
    expect(parseTurnEvent({ type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } })).toEqual([]);
    expect(parseTurnEvent({ type: "stream_event", event: { type: "content_block_stop", index: 0 } })).toEqual([]);
    expect(parseTurnEvent({ type: "stream_event", event: { type: "message_delta", delta: {} } })).toEqual([]);
    // 空デルタは描画対象外（無音イベントで再描画しない）。
    expect(parseTurnEvent({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "" } } })).toEqual([]);
  });
  it("tool_use は id も載せる（tool_result と突合するため）", () => {
    const ev = { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "generate", input: {} }] } };
    expect(parseTurnEvent(ev)).toEqual<TurnAction[]>([{ kind: "tool", name: "generate", label: "作ってる", id: "t1" }]);
  });
  it("tool_result（user）→ toolResult アクション（content の JSON をパース）", () => {
    const ev = { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: '{"items":[{"kind":"chord_progression","content":{"chords":[]}}]}' }] }] } };
    expect(parseTurnEvent(ev)).toEqual<TurnAction[]>([
      { kind: "toolResult", id: "t1", payload: { items: [{ kind: "chord_progression", content: { chords: [] } }] } },
    ]);
  });
});

describe("classifyTool", () => {
  it("書込/候補/読取に分類（prefix 有無どちらでも）", () => {
    expect(classifyTool("mcp__creative-manager__capture")).toBe("write");
    expect(classifyTool("revise")).toBe("write");
    expect(classifyTool("assemble")).toBe("write");
    expect(classifyTool("generate")).toBe("candidate");
    expect(classifyTool("fit")).toBe("candidate");
    expect(classifyTool("search")).toBe("read");
    expect(classifyTool("analyze")).toBe("read");
  });
});

describe("toolCardFromResult", () => {
  it("候補（generate）→ items を持つカード", () => {
    const payload = { items: [{ kind: "chord_progression", content: { chords: [{ root: 0 }] } }] };
    const card = toolCardFromResult("mcp__creative-manager__generate", payload);
    expect(card.klass).toBe("candidate");
    expect(card.label).toBe("作ってる");
    expect(card.items).toEqual([{ kind: "chord_progression", content: { chords: [{ root: 0 }] } }]);
  });
  it("書込（capture）→ 作成ネタを持つカード", () => {
    const payload = { id: "n9", kind: "knowledge", text: "メモ", content: null };
    const card = toolCardFromResult("capture", payload);
    expect(card.klass).toBe("write");
    expect(card.neta).toEqual(payload);
  });
  it("読取（search）→ items も neta も無いカード", () => {
    const card = toolCardFromResult("search", [{ id: "a" }]);
    expect(card.klass).toBe("read");
    expect(card.items).toBeUndefined();
    expect(card.neta).toBeUndefined();
  });
});
