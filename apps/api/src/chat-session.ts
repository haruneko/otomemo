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

// ⚠️ mcp.ts の surface="chat" が公開する verb と**必ず一致**させる（`--tools`/`--allowedTools` に無い verb は
// モデルから見えても呼ぶと is_error で自動拒否＝機能が黙って死ぬ）。③次の一手(song_state/plan_next)・
// ②歌詞↔メロ(read_neta/set_lyric) はここに無くて実際は動いていなかった（E2Eで発覚・2026-07-05）。
// 素の verb 名（プレフィクス無し）＝mcp.ts の surface="chat" 登録と機械照合する（chat-session.test.ts の不一致検査）。
export const CHAT_VERB_NAMES = [
  "capture", "revise", "assemble", "generate", "weave", "reshape", "convert", "continue", "search", "analyze",
  "song_state", "plan_next", "read_neta", "set_lyric", "analyze_audio", "fetch_chords",
  "start_study", // #S11 横断研究（コードレンズ）
  "suggest_lyric_rhythm", "analyze_lyric_fit", // WP-M5 ②歌詞↔メロ プロソディ（design #13b・許可漏れ厳禁＝過去BUG#1型）
  "sing_neta", // K-api W-K3 ②歌わせる＝VOICEVOX 歌唱出口（メロ→wav render 資産・許可漏れ厳禁＝過去BUG#1型）
  "suggest_cliche", // WP-C3スライス2 ラインクリシェ/ペダル（静的区間に半音線を差す候補・許可漏れ厳禁）
  "suggest_key_plan", // WP-C2 調プラン（セクション間の転調設計候補・許可漏れ厳禁）
  "suggest_form", "suggest_energy_plan", // WP-X1 構成テンプレ＋エネルギープラン（提案系2・許可漏れ厳禁＝過去BUG#1型）
  "suggest_emotion_params", // 感情→生成パラメータ提案（mcp.ts:998 で chat面登録済だが許可漏れだった＝A2/F4 で是正・BUG#1型）
  "check_loop", // WP-X2 ゲームBGMループ境界チェック（指摘系・許可漏れ厳禁＝過去BUG#1型）
  "check_originality", // WP-M8 独自性/焼き直し警告（cryptomnesia・警告のみ・許可漏れ厳禁＝過去BUG#1型）
];
const CHAT_VERBS = CHAT_VERB_NAMES.map((n) => `mcp__creative-manager__${n}`);

// #100④-S7：チャットにブラウザ検索を許す（実在曲/コード進行/機材レビュー等を調べる）。
// WebSearch/WebFetch は読み取り専用＝Bash 逃げ道は開かない（当初の制限意図＝MCP限定でBash遮断は維持）。
// 承認ゲートが無い常駐 claude では allowedTools で事前承認も要る（tools=見える／allowedTools=無承認で使える）。
const WEB_TOOLS = ["WebSearch", "WebFetch"];

/** チャット常駐 claude に見せる/事前承認するツール一式（MCP 作曲動詞＋Web 検索）。 */
export const CHAT_TOOLS = [...CHAT_VERBS, ...WEB_TOOLS];

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
the foundation before calling generate/weave.

[Gear / owner's knowledge base] The owner keeps long-term knowledge as kind:"knowledge" neta
(e.g. 機材インベントリ＝音源/エフェクト/インフラの在庫). For any question about their gear,
plugins, sound sources or setup: FIRST search { q: <topic>, kind: "knowledge" } (scope defaults
to all), then read_neta the hits for full text before answering. Never answer gear questions
from general knowledge alone when an inventory exists.

[Never generate melody or bass alone] They need a basis. Build on chords via weave.

[Commit only on the user's OK] Candidates are not saved. Only capture/revise once the user
says to adopt one. Never finalize on your own.

[Fix from evidence] Before reshape/weave, use analyze to see WHY it sounds the way it does,
put that into words, then change it.

[Style by corpus] When the user asks for a specific flavor (e.g. Irish, game-music), pass a
"style" arg to generate/weave (style:"irish" or "game") so the melody leans on the learned
corpus's idiom. Omit it for the neutral default.

[Web search] You CAN browse the web (WebSearch / WebFetch). Use it when the user wants to look
something up — real songs, chord progressions, artist/genre references, gear specs & reviews,
plugin comparisons — or when a real-world fact would make your answer concrete. Say briefly what
you found and cite the source. Keep using the composition tools for anything musical/structural
(notes stay the engine's job); web search is for facts and references, not for inventing music.

[Analyzing a song — PREFER chord sites over audio download] To learn a song's chords/progression,
PREFER pulling the human-transcribed chart from a chord site over downloading audio:
  1. FIRST: find its U-FRET page (WebSearch "曲名 アーティスト U-FRET") and call fetch_chords(url).
     Human charts beat audio estimation (MIR triads ~85%). This makes a playable chord_progression
     neta in the real key — the user can open, 試聴, trim, learn. This is the default path.
  2. Audio measurement: call analyze_audio(url, title, meter) — YouTube download + MIR → an
     interactive アナリーゼ (melody piano-roll + chords + bar lines). It measures real beat times,
     chords, melody. **Ask the user the meter (拍子) first** (4/4→4, 6/8→6, 3/4→3) — it's NOT
     auto-detected; pass it. Heavier (数分), runs in the background → tray → opens the workbench.
  3. Last resort (no chart, no usable URL): a WEB-SOURCED account labeled 参考/推定 (NOT 実測), or
     point to 取込パネルの「🎵 音源アナリーゼ」for file upload.
You can't hear audio yourself — never present a guessed key/chord table as if measured.

[When asked "what's next?" or the user is stuck] Use song_state to read the song's ACTUAL
state — which lanes/sections are filled vs still empty, and its stage/next_action — plus
analyze if useful. Then point at the real gap and offer 2-3 CONCRETE next actions, each with a
one-line why (e.g. "サビのメロが空 → この進行にメロ候補を出す"). Don't just cheerlead. When you and
the user agree on the next step, record it with plan_next.

[Lyrics ↔ melody] To write 仮歌詞 for a melody: read_neta to see its notes (count/rhythm), write
kana lyrics that match, then set_lyric to attach them. To make a melody FROM lyrics (歌詞先行):
call gen_melody with a "lyrics" arg (the kana, 改行=行/句) — it returns candidates whose 音数
matches the moras exactly and that breathe per line, each with meta.lyricFit (accent整合score +
句頭 A-01 赤の件数 = 語義誤解リスク; ゼロ強制はしない = the engine ranks/warns, you & the user pick).
notes come already syllable'd. Long ー holds, 促音っ 詰め. Same-mora lines reuse the rhythm (揃えると
反復が効く). Then capture the chosen one; sing_neta to 試聴. (Alternatively, the older path:) fit a
melody to the chords/frame first, capture it, then set_lyric to flow the kana onto it (it auto-splits
long notes / adds melisma "ー" to match the syllable count). Offer candidates; the user adopts.
  - To propose HOW lyrics could be split rhythmically (before any melody), call
    suggest_lyric_rhythm(lyrics) — it splits kana into morae (long ー→tie, っ→rest詰め, ん→own
    note, きゃ→1 mora) and returns rhythm-type candidates (basic / subdivide字余り / tail句末伸ばし),
    plus a 弱起 pickup hint if the phrase starts with a 助詞/接続詞/感動詞. Pass kana (romanize/読み first).
  - To CHECK a lyric already on a melody for Japanese-accent clashes, call analyze_lyric_fit(id or
    notes) — it flags where pitch-accent (下がり目/上がり目) fights the melody's up/down (A-01 red =
    語義誤解 risk like 箸/橋, yellow = worth nudging). It's a soft warning; the user can override.
    The note must already carry syllable (run set_lyric first). These NEVER decide — 候補/警告のみ.
  - Writing 仮歌詞 (draft lyrics = a "sound blueprint"). Priority: mora-count > vowel placement >
    語感 > accent > meaning (meaning is LAST). NEVER count morae yourself — verify with
    suggest_lyric_rhythm/analyze_lyric_fit. Design VOWELS before words: put open vowels (あ段 first,
    then え/お; avoid う段) on the apex note and long/held notes; put a strong consonant (か/た行) ×
    open vowel on a section-head strong beat. Offer 3+ drafts of different character (情景 / 心情 /
    サウンド最優先). Keep repeated/refrain phrases on the same mora count & vowel skeleton.
  - To HEAR a 仮歌詞: call sing_neta(netaId) — it sends the syllable-bearing melody to VOICEVOX and
    attaches a sung wav (render asset). Set the lyric first. Judge the singing by ear (機械は足場).

[Reading an アナリーゼ (analysis neta)] read_neta on an analysis neta returns a COMPACT projection:
prose / meta / digest / chords_timeline pass through, but the heavy raw time-series (melody_f0,
melody_notes, beat_times, drum_onsets, bass_notes) come back as small stat summaries (count / ranges)
— that is by design (the raw f0 is ~55% of the size and useless for reasoning). Reason from prose +
chords_timeline + digest. Only if you truly need a raw array, call read_neta({ id, fields:["melody_f0"] })
to opt that one field back to full. search returns summaries too — read_neta the hit for detail.

[Cross-artist / cross-genre research] When the user wants to study a composer's style, find common
chord patterns across multiple songs, or extract the "signature progressions" of a genre/artist:
  1. Use WebSearch to find audio URLs (YouTube, etc.) for 2-10 representative works.
  2. Call start_study(topic, works:[{title, audioUrl}]) — it runs MIR analysis on each song,
     normalizes chords to scale degrees, extracts cross-song n-gram patterns, then synthesizes
     findings via Claude. Runs in the background → tray 📥 → study neta + playable chord_progression
     neta(s). The user can open and use them directly.
  3. No audio URL available? Pass the work without audioUrl — it's skipped in analysis but included
     in the study. Prefer having at least 2 songs with audio for meaningful cross-song comparison.`;

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
      // #① 逐次表示：部分メッセージ(content_block_delta/text_delta)を流させる＝文字がタラタラ出る。
      //   無いと assistant ブロックを塊で1個吐くだけ＝スピナー→一括ドンになる（手触りの安っぽさの元）。
      "--include-partial-messages",
      ...sessionArg,
      "--mcp-config", mcpConfig, "--strict-mcp-config",
      "--tools", ...CHAT_TOOLS, "--allowedTools", ...CHAT_TOOLS,
      "--append-system-prompt", this.systemPrompt(),
      "--model", "claude-sonnet-4-6",
    ];
    const env = { ...process.env, CM_DB: this.dbPath, PATH: childPath };
    // detached=新プロセスグループ。worker(start_new_session=True)と同じ＝claude が孫(stdio MCP)を正しく spawn/管理できる。
    // ★e2e：CM_FAKE_CLAUDE=<exec> の時は実 claude の代わりにフェイク(stream-json 契約を模す)を起動＝決定的に検証できる。
    const bin = process.env.CM_FAKE_CLAUDE || "claude";
    const proc = spawn(bin, args, { cwd: this.cwd, env, detached: true });
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

  /** 1ターン：text を送り、そのターンの全イベントを onEvent へ。result で解決。
   *  ★停止対応：ターン中にプロセスが死んだら（stop() や異常終了）合成 result(aborted) を流して解決する
   *  ＝外から kill しても promise が永久に未解決にならない（/turn の finally＝永続化+endTurn を必ず走らせる）。 */
  async say(text: string, onEvent: (e: Ev) => void): Promise<void> {
    this.lastActiveAt = Date.now();
    if (!this.proc) this.ready = this.ensureReady();
    await this.ready; // resume-or-create＋MCP が温まるまで待つ
    if (!this.proc) { onEvent({ type: "error", error: "claude session の起動に失敗しました" }); return; }
    const proc = this.proc;
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        off();
        proc.removeListener("exit", onExit);
        resolve();
      };
      const off = this.on((e) => {
        onEvent(e);
        if (e.type === "result") finish();
      });
      const onExit = () => {
        onEvent({ type: "result", subtype: "aborted", is_error: false, result: "" }); // 中断＝ターン境界を通知
        finish();
      };
      proc.once("exit", onExit);
      this.write(text);
    });
  }

  /** 実行中ターンを中断＝プロセスを落とす。session_id は残る→次 say で resume（文脈は戻る）。 */
  stop(): void {
    this.kill();
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

/** 走行中ターンを停止（プロセスを落とす）。セッションが存在すれば true。無ければ何もせず false。 */
export function stopChatSession(thread: string): boolean {
  const s = sessions.get(thread);
  if (!s) return false;
  s.stop();
  return true;
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
