// #100 薄いラッパーの api 側中継。スレッド毎に **長命の `claude -p --input-format stream-json`** を1プロセス保持し、
// stdin にユーザー発言を流し、stdout の stream-json イベントを購読者へ配る。脳は持たない＝Claude が記憶・多ターン・
// ツール選択をネイティブに担う。MCP は `CM_MCP_SURFACE=chat` で 10 verbs だけ（モデルが旧ツールを掴まない）。
// フィジビリ確定事項（design #100 ③-8）：毎プロセスで stdio MCP がコールドスタート→**warmup 1ターンで温める**。
// 承認は CLI gate を使えない→**全 verb を allowedTools で事前承認**＋人のループは UI の候補選択＋可逆。
// #100④-S：session_id を thread から決定的に導出し **resume-or-create**＝プロセスが落ちても/再起動しても
// claude 側の文脈が戻る（「1 thread = 1 claude session = 1 履歴」）。境界（実機 2026-06-25）：既存idへ再 --session-id は
// "already in use"、不存在 --resume は "No conversation found" でハード失敗→まず resume、失敗時に新規作成へ。
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

type Ev = Record<string, unknown>;

const CHAT_VERBS = [
  "capture", "revise", "assemble", "generate", "fit", "reshape", "convert", "continue", "search", "analyze",
].map((n) => `mcp__creative-manager__${n}`);

// #100④ 脳の作法（A）：設計#16(枠は最後まで効く)・#86(Claude=言葉→構造化の翻訳、音符は記号エンジンが保証)を
// 脳の眼前に置く。ツールの段取りを束ねる上位指示＝ここが空だと「16小節→16進行」等の取りこぼしが出る。
const COMPOSE_PLAYBOOK = `You are a composer's partner. Your job is not to finish the work, but to give the user
material they can JUDGE, and help them steer. The user always makes the final call.

Reply in the same language the user writes in.

[Core rule] Musical correctness (in-key, chord-fit, functional harmony) is guaranteed by
the MCP symbolic engine — not by you. Your job is to translate words into structured
requests, and to put results into words. Never invent notes yourself. Always go through a tool.

[Lock the frame first] key / meter / tempo / bars / mood. The frame persists for the whole
conversation. Fill missing fields from recent context or existing neta; only ask about what's
still missing — don't interrogate the user for all of it.

["N bars" means frame.bars] One generation call = ONE structure spanning that many bars.
It does NOT mean N separate candidates.

[Offer 2-3 candidates] Too many choices kill judgment. For each, add one line on how it differs.

[Read before you generate] If relevant neta/progressions exist, use search/analyze to grasp
the foundation before calling generate/fit.

[Never generate melody or bass alone] They need a basis. Build on chords via fit.

[Commit only on the user's OK] Candidates are not saved. Only capture/revise once the user
says to adopt one. Never finalize on your own.

[Fix from evidence] Before reshape/fit, use analyze to see WHY it sounds the way it does,
put that into words, then change it.

[Style by corpus] When the user asks for a specific flavor (e.g. Irish, game-music), pass a
"style" arg to generate/fit (style:"irish" or "game") so the melody leans on the learned
corpus's idiom. Omit it for the neutral default.

[When asked "what's next?" or the user is stuck] Use song_state to read the song's ACTUAL
state — which lanes/sections are filled vs still empty, and its stage/next_action — plus
analyze if useful. Then point at the real gap and offer 2-3 CONCRETE next actions, each with a
one-line why (e.g. "サビのメロが空 → この進行にメロ候補を出す"). Don't just cheerlead. When you and
the user agree on the next step, record it with plan_next.`;

// 固定 namespace（変えると全スレッドの session_id が変わる＝既存の claude セッションを見失う）。
const CM_CHAT_NS = "5f6c1e0a-3b2d-5c4e-8a9b-1d2e3f4a5b6c";

/** thread → claude session_id（UUIDv5/SHA-1・決定的）。同じ thread は常に同じ session を resume する。 */
export function sessionIdForThread(thread: string): string {
  const ns = Buffer.from(CM_CHAT_NS.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(ns).update(Buffer.from(thread, "utf8")).digest();
  h[6] = (h.readUInt8(6) & 0x0f) | 0x50; // version 5
  h[8] = (h.readUInt8(8) & 0x3f) | 0x80; // variant 10x
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** idle 判定：最後の発言から idleMs 以上経過したら reap 対象（未発言 lastActiveAt=0 は対象外）。 */
export function isIdle(lastActiveAt: number, now: number, idleMs: number): boolean {
  return lastActiveAt > 0 && now - lastActiveAt >= idleMs;
}

export class ChatSession {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buf = "";
  private listeners = new Set<(e: Ev) => void>();
  private ready: Promise<void> | null = null;
  private mcpReady = false; // init イベントの tools に creative-manager が出たら true
  private readonly sid: string;
  private mode: "resume" | "create" = "resume"; // 初手は resume、失敗（不存在）時のみ create にフォールバック
  private sawNoConv = false; // stderr に "No conversation found"（＝新規スレッド）
  private lastActiveAt = 0; // 最後に say した時刻（idle reap 用）。0=未発言。
  private systemSuffix = ""; // 器（プロジェクト）の指示文。COMPOSE_PLAYBOOK に追記＝この会話に効かせる。空=従来通り。

  constructor(private readonly thread: string, private readonly dbPath: string, private readonly cwd: string) {
    this.sid = sessionIdForThread(thread);
    // init イベントで MCP 接続状況が分かる（spawn 毎に張り直さないようコンストラクタで1回）。
    this.on((e) => {
      if (e.type === "system" && (e as { subtype?: string }).subtype === "init") {
        const tools = (e as { tools?: string[] }).tools ?? [];
        if (tools.some((t) => t.startsWith("mcp__creative-manager__"))) this.mcpReady = true;
      }
    });
  }

  private spawn(): void {
    // MCP は worker と同じ pnpm 経由（proven）。node の bin を PATH 先頭へ補強（claude/tsx 解決）。
    const nodeBin = dirname(process.execPath);
    const childPath = `${nodeBin}:${process.env.PATH ?? ""}`;
    const mcpConfig = JSON.stringify({
      mcpServers: {
        "creative-manager": {
          command: "pnpm",
          args: ["-s", "--filter", "@cm/api", "exec", "tsx", "src/mcp-stdio.ts"],
          env: { ...process.env, CM_DB: this.dbPath, CM_MCP_SURFACE: "chat", PATH: childPath },
        },
      },
    });
    // resume-or-create：セッションが在れば resume（文脈が戻る）、不存在なら作成。
    const sessionArg = this.mode === "resume" ? ["--resume", this.sid] : ["--session-id", this.sid];
    const args = [
      "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
      ...sessionArg,
      "--mcp-config", mcpConfig, "--strict-mcp-config",
      "--tools", ...CHAT_VERBS, "--allowedTools", ...CHAT_VERBS,
      "--append-system-prompt", this.systemPrompt(),
      "--model", "claude-sonnet-4-6",
    ];
    const env = { ...process.env, CM_DB: this.dbPath, PATH: childPath };
    // detached=新プロセスグループ。worker(start_new_session=True)と同じ＝claude が孫(stdio MCP)を正しく spawn/管理できる。
    const proc = spawn("claude", args, { cwd: this.cwd, env, detached: true });
    this.proc = proc;
    this.mcpReady = false;
    this.sawNoConv = false;
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (d: string) => this.onData(d));
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (d: string) => {
      if (d.includes("No conversation found")) this.sawNoConv = true; // resume 先が無い＝新規スレッド
      console.error(`[chat ${this.thread}] claude stderr:`, d.slice(0, 500));
    });
    proc.on("exit", () => { this.proc = null; this.mcpReady = false; });
    proc.on("error", () => { this.proc = null; this.mcpReady = false; });
  }

  // resume で起動→不存在なら create で1回だけ再起動。各回 warmup で MCP を温める。
  private async ensureReady(): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      this.spawn();
      await this.warmupOrExit();
      if (this.mcpReady || this.proc) { this.mode = "resume"; return; } // 温まった/生存＝次回は resume
      if (this.mode === "resume" && this.sawNoConv) { this.mode = "create"; continue; } // 新規スレッド→作成へ
      return; // それ以外の死は諦め（次の say で再試行）
    }
  }

  // stdio MCP のコールドスタート対策：creative-manager のツールが見えるまで warmup（最大4）。途中で proc が落ちたら抜ける。
  private warmupOrExit(): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      this.proc?.once("exit", finish);
      void (async () => {
        for (let i = 0; i < 4 && !this.mcpReady && !done && this.proc; i++) {
          await new Promise<void>((r) => {
            const off = this.on((e) => { if (e.type === "result") { off(); r(); } });
            this.proc?.once("exit", () => { off(); r(); });
            this.write("OK とだけ返して。");
          });
        }
        finish();
      })();
    });
  }

  private onData(d: string): void {
    this.buf += d;
    let i: number;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let e: Ev;
      try { e = JSON.parse(line) as Ev; } catch { continue; }
      for (const l of [...this.listeners]) l(e);
    }
  }

  private write(text: string): void {
    const msg = JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } });
    this.proc?.stdin.write(msg + "\n");
  }

  private on(l: (e: Ev) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** 1ターン：text を送り、そのターンの全イベントを onEvent へ。result で解決。 */
  async say(text: string, onEvent: (e: Ev) => void): Promise<void> {
    this.lastActiveAt = Date.now();
    if (!this.proc) this.ready = this.ensureReady();
    await this.ready; // resume-or-create＋MCP が温まるまで待つ
    if (!this.proc) { onEvent({ type: "error", error: "claude session の起動に失敗しました" }); return; }
    return new Promise<void>((resolve) => {
      const off = this.on((e) => {
        onEvent(e);
        if (e.type === "result") { off(); resolve(); }
      });
      this.write(text);
    });
  }

  /** 器の指示文を差し替える（次の spawn から有効＝走行中プロセスは idle reap 後の再起動で反映）。 */
  setSystemSuffix(suffix: string): void {
    this.systemSuffix = suffix ?? "";
  }

  // COMPOSE_PLAYBOOK にプロジェクト指示を追記。空なら従来と完全に同一（回帰ゼロ）。
  private systemPrompt(): string {
    const s = this.systemSuffix.trim();
    if (!s) return COMPOSE_PLAYBOOK;
    return `${COMPOSE_PLAYBOOK}\n\n[Project guidance from the user — honor it, but stay within the rules above]\n${s}`;
  }

  kill(): void {
    this.proc?.kill();
    this.proc = null;
    this.ready = null;
    this.mode = "resume"; // 次回はディスク上の session を resume（文脈を取り戻す）
  }

  /** idle なら proc を kill（メモリ解放）。session_id は残る→次 say で resume。kill 済みは false。 */
  reapIfIdle(now: number, idleMs: number): boolean {
    if (!this.proc || !isIdle(this.lastActiveAt, now, idleMs)) return false;
    this.kill();
    return true;
  }
}

const sessions = new Map<string, ChatSession>();

// #100④-S2：無発言で温まりっぱなしの claude プロセスを回収（メモリ解放）。session_id は残置＝次発言で resume。
const IDLE_MS = Number(process.env.CM_CHAT_IDLE_MS ?? 15 * 60_000);
let reaper: ReturnType<typeof setInterval> | null = null;
function ensureReaper(): void {
  if (reaper) return;
  reaper = setInterval(() => {
    const now = Date.now();
    for (const s of sessions.values()) s.reapIfIdle(now, IDLE_MS);
  }, 60_000);
  reaper.unref?.(); // イベントループを生かし続けない
}

/** スレッド毎の長命セッションを取得（無ければ生成・遅延spawn）。systemSuffix=器の指示文（毎回最新を反映）。 */
export function getChatSession(thread: string, dbPath: string, cwd: string, systemSuffix = ""): ChatSession {
  ensureReaper();
  let s = sessions.get(thread);
  if (!s) {
    s = new ChatSession(thread, dbPath, cwd);
    sessions.set(thread, s);
  }
  s.setSystemSuffix(systemSuffix); // 指示文が更新されていれば次spawnで効く
  return s;
}
