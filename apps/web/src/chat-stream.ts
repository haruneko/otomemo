// #100④-S3a：常駐 claude（api `/chat/:thread/turn` SSE）の stream-json を UI アクションへ変換する純関数群。
// 脳は Claude＝自然文(text)＋ツール選択(tool_use)を出す。web は描くだけ。判別ユニオン(#61)は廃止（#100）。

export type TurnAction =
  | { kind: "textDelta"; text: string } // #① 部分テキスト（--include-partial-messages の content_block_delta）＝加算して逐次表示
  | { kind: "text"; text: string } // assistant の自然文（このステップの全文＝確定形。デルタが来ない古い経路の主役）
  | { kind: "tool"; name: string; label: string; id?: string } // tool_use＝今なにしてるかの実況（id で result と突合）
  | { kind: "toolResult"; id?: string; payload: unknown } // tool_result＝候補/書込の中身
  | { kind: "result"; text: string; isError: boolean }; // ターン確定（最終テキスト／失敗）

// 10 chat verbs の人間語実況（design #101）。worker 実況(#99)の後継。未知は名前そのまま＝捏造しない。
const TOOL_LABEL: Record<string, string> = {
  generate: "作ってる",
  capture: "書き留めてる",
  revise: "直してる",
  assemble: "組んでる",
  fit: "合わせてる",
  reshape: "整えてる",
  convert: "変換してる",
  continue: "続きを考えてる",
  search: "探してる",
  analyze: "調べてる",
};

/** MCP ツール名（mcp__creative-manager__verb / verb どちらでも）→ 人間語の実況。 */
export function toolLabel(name: string): string {
  const verb = name.replace(/^mcp__creative-manager__/, "");
  return TOOL_LABEL[verb] ?? verb;
}

type Block = { type?: string; text?: string; name?: string; id?: string; tool_use_id?: string; content?: unknown; [k: string]: unknown };
type Ev = {
  type?: string;
  message?: { content?: Block[] };
  result?: string;
  is_error?: boolean;
  error?: string;
  // #① --include-partial-messages のラッパー（type:"stream_event"）。中の Anthropic 生イベント。
  event?: { type?: string; delta?: { type?: string; text?: string }; [k: string]: unknown };
  [k: string]: unknown;
};

// tool_result の content（[{type:"text", text:"<JSON>"}] or 文字列）から payload を取り出す。
function parseToolResult(content: unknown): unknown {
  let text: string | undefined;
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    const t = content.find((b) => (b as Block)?.type === "text") as Block | undefined;
    text = typeof t?.text === "string" ? t.text : undefined;
  }
  if (text === undefined) return content;
  try { return JSON.parse(text); } catch { return text; }
}

/** stream-json の1イベント → 0..n の UI アクション。 */
export function parseTurnEvent(ev: Ev): TurnAction[] {
  // #① 部分メッセージ：content_block_delta の text_delta だけ拾って逐次加算する（他の生イベントは描画対象外）。
  if (ev?.type === "stream_event") {
    const inner = ev.event;
    if (inner?.type === "content_block_delta" && inner.delta?.type === "text_delta" && inner.delta.text) {
      return [{ kind: "textDelta", text: inner.delta.text }];
    }
    return [];
  }
  if (ev?.type === "assistant") {
    const out: TurnAction[] = [];
    for (const b of ev.message?.content ?? []) {
      if (b.type === "text" && b.text) out.push({ kind: "text", text: b.text });
      else if (b.type === "tool_use" && b.name) out.push({ kind: "tool", name: b.name, label: toolLabel(b.name), id: b.id });
    }
    return out;
  }
  if (ev?.type === "user") {
    const out: TurnAction[] = [];
    for (const b of ev.message?.content ?? []) {
      if (b.type === "tool_result") out.push({ kind: "toolResult", id: b.tool_use_id, payload: parseToolResult(b.content) });
    }
    return out;
  }
  if (ev?.type === "result") return [{ kind: "result", text: ev.result ?? "", isError: !!ev.is_error }];
  if (ev?.type === "error") return [{ kind: "result", text: ev.error ?? "エラー", isError: true }];
  return []; // system/init・空textは描画対象外
}

const WRITE_VERBS = new Set(["capture", "revise", "assemble"]);
const CANDIDATE_VERBS = new Set(["generate", "fit", "reshape", "continue", "convert"]);

/** ツールを 書込/候補/読取 に分類（カードの描き分け）。 */
export function classifyTool(name: string): "write" | "candidate" | "read" {
  const v = name.replace(/^mcp__creative-manager__/, "");
  if (WRITE_VERBS.has(v)) return "write";
  if (CANDIDATE_VERBS.has(v)) return "candidate";
  return "read";
}

export interface ToolCardItem { kind: string; content: unknown }
export interface ToolCard {
  tool: string; // verb（prefix 無し）
  label: string; // 人間語
  klass: "write" | "candidate" | "read";
  items?: ToolCardItem[]; // 候補（generate/fit…）
  neta?: { id?: string; kind?: string; content?: unknown; text?: string | null; key?: number; tempo?: number }; // 書込結果
}

/** tool_use 名＋tool_result payload → 描画用カード。候補は items、書込は作成/更新ネタを載せる。 */
export function toolCardFromResult(name: string, payload: unknown): ToolCard {
  const klass = classifyTool(name);
  const card: ToolCard = { tool: name.replace(/^mcp__creative-manager__/, ""), label: toolLabel(name), klass };
  const p = payload as Record<string, unknown> | null;
  if (klass === "candidate") {
    if (p && Array.isArray(p.items)) card.items = p.items as ToolCardItem[];
    else if (p && "content" in p && typeof p.kind === "string") card.items = [{ kind: p.kind, content: p.content }];
    else card.items = [];
  } else if (klass === "write" && p && typeof p.id === "string") {
    card.neta = p as ToolCard["neta"];
  }
  return card;
}
