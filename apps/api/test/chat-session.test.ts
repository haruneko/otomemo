import { describe, it, expect } from "vitest";
import { sessionIdForThread, isIdle, CHAT_TOOLS, CHAT_VERB_NAMES, COMPOSE_PLAYBOOK } from "../src/chat-session";

// BUG#1型の機械的再発防止：プレイブック本文（Claude への指示）が「呼べ」と言っている verb が
// CHAT_VERB_NAMES（＝allowedTools 許可リスト）に無いと、指示どおり呼んでも is_error で自動拒否され
// 黙って死ぬ（実例＝gen_melody が漏れていて詞先メロが呼べなかった・2026-07-27発覚）。
// 抽出＝本文中の verb 名は snake_case（複合語）で書かれる規約（capture/revise/generate/weave/search/
// analyze 等の単語verbは通常の英文中に紛れ機械判別できないので対象外＝人間レビュー領分。単語verbは
// #100 初期からの固定10種＋既存テストで別途カバー済）。データフィールド名/kind値も snake_case で紛れる
// ので、既知の非verbトークンだけ明示的に denylist する（新規で紛れが増えたらここが伸びる＝気付ける設計）。
describe("プレイブック本文の verb 呼び出し ⊆ CHAT_VERB_NAMES（BUG#1型の機械的再発防止）", () => {
  const NOT_A_VERB = new Set([
    // 「アナリーゼ neta の raw 時系列」節（read_neta の戻りフィールド名の説明）で言及される非verbトークン
    "bass_notes", "beat_times", "chords_timeline", "drum_onsets", "melody_f0", "melody_notes",
    // kind値／状態フィールド名（呼び出し対象ではなく引数/戻り値の中身の説明）
    "chord_progression", "next_action",
  ]);

  it("本文中の snake_case トークンは全て CHAT_VERB_NAMES に含まれる（既知の非verb denylist を除く）", () => {
    const tokens = Array.from(new Set(COMPOSE_PLAYBOOK.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? []));
    const verbTokens = tokens.filter((t) => !NOT_A_VERB.has(t));
    expect(verbTokens.length).toBeGreaterThan(10); // 抽出ロジックが壊れて空/激減していないことの健全性チェック
    for (const v of verbTokens) {
      expect(
        CHAT_VERB_NAMES,
        `playbook says to call "${v}" but it's missing from CHAT_VERB_NAMES（allowedTools）— the call would be silently rejected`,
      ).toContain(v);
    }
  });
});

describe("CHAT_TOOLS（チャットに見せる/事前承認するツール一式）", () => {
  it("MCP 作曲動詞＋Web 検索を含み、Bash 等の危険ツールは含まない（#100④-S7）", () => {
    expect(CHAT_TOOLS).toContain("mcp__creative-manager__capture");
    expect(CHAT_TOOLS).toContain("mcp__creative-manager__generate");
    expect(CHAT_TOOLS).toContain("WebSearch"); // ブラウザ検索を許可
    expect(CHAT_TOOLS).toContain("WebFetch");
    expect(CHAT_TOOLS).not.toContain("Bash"); // Bash 逃げ道は開かない（当初の制限意図を維持）
    expect(CHAT_TOOLS).not.toContain("Write");
    expect(CHAT_TOOLS).not.toContain("Edit");
  });

  // E2E で発覚：mcp.ts chat面が公開する verb と allowlist が一致してないと、見えても呼ぶと自動拒否。
  it("③次の一手・②歌詞↔メロ・①音源解析・#S11横断研究の verb も含む＝chat面 verb と一致", () => {
    for (const v of ["song_state", "plan_next", "read_neta", "set_lyric", "analyze_audio", "fetch_chords", "start_study"]) {
      expect(CHAT_TOOLS).toContain(`mcp__creative-manager__${v}`);
    }
  });
});

// #100④-S：thread から claude session_id を決定的に導出（DB列不要・再起動耐性）。
// 「1 thread = 1 claude session = 1 履歴」の土台＝同じ thread は常に同じ session を resume する。
describe("sessionIdForThread", () => {
  it("決定的：同じ thread は常に同じ id", () => {
    expect(sessionIdForThread("global")).toBe(sessionIdForThread("global"));
    expect(sessionIdForThread("neta-abc")).toBe(sessionIdForThread("neta-abc"));
  });

  it("衝突しない：違う thread は違う id", () => {
    expect(sessionIdForThread("global")).not.toBe(sessionIdForThread("neta-abc"));
    expect(sessionIdForThread("neta-1")).not.toBe(sessionIdForThread("neta-2"));
  });

  it("妥当な UUIDv5 形式（claude --session-id が受ける）", () => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(sessionIdForThread("global")).toMatch(re);
    expect(sessionIdForThread("日本語スレッド")).toMatch(re);
    expect(sessionIdForThread("")).toMatch(re);
  });
});

// #100④-S2：idle reap の契約。無発言が続いた proc を kill（session_id は残置→次発言で resume）。
describe("isIdle", () => {
  const IDLE = 15 * 60_000;
  it("制限内は idle でない", () => {
    expect(isIdle(1_000_000, 1_000_000 + IDLE - 1, IDLE)).toBe(false);
  });
  it("制限到達で idle", () => {
    expect(isIdle(1_000_000, 1_000_000 + IDLE, IDLE)).toBe(true);
    expect(isIdle(1_000_000, 1_000_000 + IDLE + 5000, IDLE)).toBe(true);
  });
  it("一度も発言してない(=0)は idle 扱いしない（reap 対象外）", () => {
    expect(isIdle(0, 9_999_999, IDLE)).toBe(false);
  });
});
