import { useEffect, useRef, useState } from "react";
import { useAlive } from "../poll";
import { api, type Neta, type ChatMessage, type ChatThread } from "../api";
import { playNotes, notesForContent } from "../music";
import { MUSIC_KINDS, KIND_LABEL } from "../kinds";
import { MiniRoll } from "./MiniRoll";
import { parseTurnEvent, toolCardFromResult, type ToolCard, type ToolCardItem } from "../chat-stream";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// #100④ Chat 本文の描画：AI はマークダウン（表/見出し/箇条書きを読める形に）。user は素のまま（入力をいじらない）。
function ChatText({ text, ai }: { text: string; ai: boolean }) {
  if (!ai) return <div className="chat-text">{text}</div>;
  return (
    <div className="chat-text chat-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

interface Msg {
  role: "user" | "ai";
  text?: string;
  saveable?: string;
  neta?: Neta; // #68 作成したネタ（開く/試聴リンク用）
  cards?: ToolCard[]; // #100④-S3b turn 中の tool_use 結果（生成候補/書込）
  netas?: { id: string; kind?: string; title?: string }[]; // #S8 サーバが永続化した「このターンで作られたネタ」参照（開き直しで復元）
}
type Mode = "consult" | "research";

// #100④-S3b turn 中の tool 結果カード。候補（generate/fit…）＝試聴＋保存／書込（capture）＝開く＋取り消す(可逆)。
function ChatToolCard({
  card,
  onOpen,
  onSaveItem,
  onUndo,
}: {
  card: ToolCard;
  onOpen: (neta: Neta) => void;
  onSaveItem: (it: ToolCardItem) => Promise<void>;
  onUndo: (id: string) => Promise<void>;
}) {
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [undone, setUndone] = useState(false);

  if (card.klass === "candidate" && card.items && card.items.length > 0) {
    return (
      <div className="tool-card" aria-label="candidate-card">
        <div className="tool-card-head muted">{card.label}＝候補</div>
        {card.items.map((it, k) => {
          const isMusic = MUSIC_KINDS.includes(it.kind);
          return (
            <div key={k} className="tool-card-item">
              <span className="muted">{KIND_LABEL[it.kind] ?? it.kind}</span>
              {isMusic && <MiniRoll neta={{ id: "", kind: it.kind, content: it.content } as Neta} />}
              {isMusic && (
                <button
                  type="button"
                  className="bs-btn"
                  aria-label="play-candidate"
                  onClick={() => void playNotes(notesForContent(it.kind, it.content, { key: 0 }), 120)}
                >
                  ▶ 試聴
                </button>
              )}
              <button
                type="button"
                className="bs-btn"
                aria-label="save-candidate"
                disabled={saved.has(k)}
                onClick={() => void onSaveItem(it).then(() => setSaved((s) => new Set(s).add(k)))}
              >
                {saved.has(k) ? "保存しました" : "保存"}
              </button>
            </div>
          );
        })}
      </div>
    );
  }
  if (card.klass === "write" && card.neta?.id) {
    const neta = card.neta;
    const kindLabel = KIND_LABEL[neta.kind ?? ""] ?? neta.kind ?? "ネタ";
    return (
      <div className="tool-card" aria-label="write-card">
        <div className="tool-card-head">
          {kindLabel} を{card.tool === "capture" ? "作成" : "更新"}しました
        </div>
        <div className="chat-neta-actions">
          <button type="button" className="bs-btn" aria-label="open-card-neta" onClick={() => onOpen(neta as Neta)}>
            ✎ 開く
          </button>
          {card.tool === "capture" && !undone && (
            <button
              type="button"
              className="bs-btn"
              aria-label="undo-card"
              onClick={() => void onUndo(neta.id!).then(() => setUndone(true))}
            >
              ↩ 取り消す
            </button>
          )}
          {undone && <span className="muted">取り消しました</span>}
        </div>
      </div>
    );
  }
  return null;
}

// 相談（docs/design.md #19/#20）。target 付きで開くと「このネタについての相談」になり、
// 最初の提案を自動で出す。案は Chat 上で選んでネタ化（from_job で対象に紐づく）。
export function Chat({
  target,
  onChanged,
  onClose,
  onOpenNeta,
  activeProject,
  projectInstructions,
  initialText,
  gear,
}: {
  target?: Neta;
  onChanged?: () => void;
  onClose: () => void;
  onOpenNeta?: (neta: Neta) => void; // #68 ネタを開く（Chatは閉じる）
  activeProject?: string; // プロジェクト＝一曲(or組曲)の器：新規セッションをこの器に束ね、一覧もこの器で絞る
  projectInstructions?: string; // 器のAIへの指示（効いている実感バナー）
  initialText?: string; // 開いた瞬間に入力欄へ載せる最初の一言（プロジェクト画面の起点入力など）
  gear?: boolean; // ④ 機材モード：全曲共通のグローバル相談（器に束ねない・thread固定="gear"）
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState(initialText ?? "");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 長文向け：入力量に応じてテキストエリアの高さを内容フィット（CSS max-height で頭打ち→内部スクロール）。
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);
  const [mode, setMode] = useState<Mode>("consult");
  const [busy, setBusy] = useState(false);
  const [thinkSec, setThinkSec] = useState(0); // 「考え中」(分解前 planning)の経過秒＝沈黙の不安を解消。
  const [thinkLabel, setThinkLabel] = useState(""); // #99 実況：job.progress（「メロを作ってる」等）。空=ラベル無し。
  const [streamText, setStreamText] = useState(""); // #100④-S3 常駐 claude の途中テキスト（ストリーミング表示）。
  const [liveCards, setLiveCards] = useState<ToolCard[]>([]); // #100④-S3b turn 中に出た候補/書込カード（確定でメッセージへ畳む）。
  const [inflight, setInflight] = useState(0); // 裏で実行中のジョブ数（リロードで待ち状態が消えても可視化）。
  const [loaded, setLoaded] = useState(false); // #70 履歴ロード完了（自動初回提案はこの後）
  const started = useRef(false);
  const alive = useAlive(); // ワーカー待ちは長い＝閉じた後に setState しないためのガード（poll.ts 共通）

  // busy の間（特に分解前の「考え中」planning）に経過秒を刻む＝無進捗の沈黙をなくす。
  useEffect(() => {
    if (!busy) {
      setThinkSec(0);
      setThinkLabel("");
      return;
    }
    setThinkSec(0);
    const t = setInterval(() => setThinkSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  // 待ち中にリロードすると待ち状態(busy/waitInfo)が消える。実行中ジョブを定期確認してバナー表示＝
  // 「まだ動いてるのか不明」をなくす。0に戻ったら一覧を更新（結果が reap されてトレイ📥/ネタ帳へ）。
  useEffect(() => {
    let on = true;
    let prev = 0;
    const check = async () => {
      try {
        const [q, r] = await Promise.all([api.listJobs({ status: "queued" }), api.listJobs({ status: "running" })]);
        if (!on) return;
        const n = q.length + r.length;
        if (prev > 0 && n === 0) onChanged?.(); // 実行中→0：結果が届いた→ネタ帳/トレイ更新
        prev = n;
        setInflight(n);
      } catch {
        /* ネットワーク揺れは無視 */
      }
    };
    void check();
    const t = setInterval(check, 4000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [onChanged]);
  // 複数会話セッション（フリーChatのみ。Claude/ChatGPT風に作って切替/見返す）。
  const [sessionId, setSessionId] = useState(() =>
    target ? "" : (localStorage.getItem("cm-chat-session") ?? "global"),
  );
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions] = useState<ChatThread[]>([]);

  const targetLabel = target ? (target.title ?? target.text ?? "(無題)") : null;

  // #70 スレッド＝対象ネタ id（無ければフリーChatの会話セッションid）。
  const thread = gear ? "gear" : (target?.id ?? sessionId); // ④ 機材は固定グローバルthread

  // #70 永続化（後退ゼロ）：保存に失敗してもメモリだけで従来どおり動く。
  // 構造化ペイロード（neta/saveable/cards）は data へ畳む。
  function persistMsg(m: Msg) {
    const { role, text, ...rest } = m;
    const data = Object.keys(rest).length ? rest : undefined;
    const kind = m.neta ? "content" : "chat";
    void api.addChatMessage(thread, { role, kind, text: text ?? null, data }).catch(() => {});
  }
  // 保存しつつ画面にも積む（ユーザー発言・非ターンの確定メッセージ用）。
  function pushMsg(m: Msg) {
    setMsgs((prev) => [...prev, m]);
    persistMsg(m);
    // 器（プロジェクト）への束ねは「ユーザーが実際に発言した時」だけ＝空会話がゴミ化しない（upsert冪等）。
    if (m.role === "user" && !target && !gear && activeProject) {
      void api.setChatThread(thread, { project: activeProject }).catch(() => {});
    }
  }
  // 画面にだけ積む（永続化しない）。★claude ターンの assistant 返信はサーバ側で chat_message に
  // 永続化する（/turn 完了時）ので、ここで二重保存しない＝閉じても消えず・戻っても重複しない。
  function renderMsg(m: Msg) {
    setMsgs((prev) => [...prev, m]);
  }

  // サーバのスレッド履歴から再描画（生成結果は reaper がサーバ側で記録済＝クライアント非依存・fb-3）。
  async function reloadMsgs() {
    try {
      const rows = await api.listChatMessages(thread);
      if (!alive.current) return;
      setMsgs(
        rows.map((r) => ({
          role: r.role === "user" ? "user" : "ai",
          text: r.text ?? undefined,
          ...((r.data as Partial<Msg>) ?? {}),
        })),
      );
    } catch {
      /* 取得失敗＝現状維持 */
    }
  }

  // #70 開いたとき該当スレッドの履歴を復元（失敗＝空のまま＝従来挙動）。
  // セッション切替でも thread が変わり、ここで一旦クリア→復元する。
  useEffect(() => {
    let alive = true;
    setMsgs([]);
    started.current = false;
    setLoaded(false);
    void api
      .listChatMessages(thread)
      .then((rows: ChatMessage[]) => {
        if (!alive || rows.length === 0) return;
        setMsgs(
          rows.map((r) => ({
            role: r.role === "user" ? "user" : "ai",
            text: r.text ?? undefined,
            ...((r.data as Partial<Msg>) ?? {}),
          })),
        );
        started.current = true; // 復元したら自動初回提案は出さない（二重防止）
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [thread]);

  // ★再アタッチ（2026-07-05・ストリーム切れ対策）：開き直した時に**走行中ターンがあれば途中から**購読して
  // 描画を復帰する。走行中でなければサーバは即 done＝完全な no-op。履歴ロード後(loaded)にだけ試みる
  // ＝復元済みメッセージを消さない。assistant 返信はサーバが永続化済なので、ここでの表示は renderMsg（非永続）。
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    void (async () => {
      const { out, cards, sawAny } = await consumeTurn(
        (cb) => api.chatTurnLiveStream(thread, cb),
        () => { if (!cancelled) { started.current = true; setBusy(true); } }, // 走行中ターン検知→busy表示
      );
      if (cancelled) return;
      if (sawAny) {
        setBusy(false);
        if (out || cards.length) {
          renderMsg({ role: "ai", text: out || undefined, saveable: out || undefined, cards: cards.length ? cards : undefined });
        }
        onChanged?.();
      }
    })();
    return () => { cancelled = true; };
    // loaded/thread が変わった時だけ（＝開いた/切替えた時）。busy 依存にすると送信の度に再アタッチしてしまう。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread, loaded]);

  // #100④-S3 ディスパッチ：consult は常駐 claude（SSE）／research は当面 旧ジョブ経路（フォールバック）。
  // #100④-S3/research：consult も research も常駐 claude（/turn）へ。脳は Claude＝自作ルーティング無し。
  async function run(text: string) {
    return runStream(text);
  }

  // stream-json を逐次描画しつつ、result（or 最後の text）と候補/書込カードを集める共通ループ。
  // /turn（新規ターン）と /turn/live（再アタッチ）の両方でこれを使う＝描画ロジックを一本化。
  // onFirst：最初のイベントが来た時に1回だけ呼ぶ（再アタッチで「走行中ターン有り」を検知して busy 表示に入る用）。
  async function consumeTurn(
    start: (onEvent: (e: unknown) => void) => Promise<void>,
    onFirst?: () => void,
  ): Promise<{ out: string; cards: ToolCard[]; errored: boolean; sawAny: boolean }> {
    setStreamText("");
    setThinkLabel("");
    setLiveCards([]);
    const toolNames = new Map<string, string>(); // tool_use id → name（tool_result と突合）
    const cards: ToolCard[] = [];
    let acc = "";
    let finalText = "";
    let errored = false;
    let sawAny = false;
    try {
      await start((ev) => {
        if (!alive.current) return;
        if (!sawAny) { sawAny = true; onFirst?.(); }
        for (const a of parseTurnEvent(ev as Parameters<typeof parseTurnEvent>[0])) {
          if (a.kind === "text") { acc = a.text; setStreamText(acc); }
          else if (a.kind === "tool") { setThinkLabel(a.label); if (a.id) toolNames.set(a.id, a.name); }
          else if (a.kind === "toolResult") {
            const name = a.id ? toolNames.get(a.id) : undefined;
            if (name) {
              const card = toolCardFromResult(name, a.payload);
              // 読取(search/analyze)はカードにしない＝実況のみ。候補/書込だけ見せる。
              if (card.klass !== "read" && (card.items?.length || card.neta)) { cards.push(card); setLiveCards([...cards]); }
            }
          } else if (a.kind === "result") { finalText = a.text; errored = a.isError; }
        }
      });
    } catch {
      errored = true;
    } finally {
      setStreamText("");
      setThinkLabel("");
      setLiveCards([]);
    }
    return { out: finalText || acc, cards, errored, sawAny };
  }

  // #100④-S3 常駐 claude に1ターン。stream-json を逐次描画し、result（or 最後の text）を AI 発言として確定。
  // 脳は Claude＝自然文＋ツール選択。書込(capture/revise/assemble)は事前承認済で可逆（#100 a）。
  // research モードはユーザー文を「リサーチ依頼」にだけ薄く包む（脳は持たない＝Claude が自由に調べ/記録）。
  // ★assistant 返信の永続化はサーバ側（/turn 完了時）＝閉じても消えない。ここは画面表示だけ（renderMsg）。
  async function runStream(text: string) {
    pushMsg({ role: "user", text }); // ユーザー発言は即永続化（開始時＝切断前に残る）
    setBusy(true);
    const sendText =
      mode === "research"
        ? `【リサーチ依頼】${text}\n参考になる実在の曲・コード進行・テクニックを挙げて。良ければ参考ネタとして記録(capture)してOK。`
        : text;
    const { out, cards, errored } = await consumeTurn((cb) => api.chatTurnStream(thread, sendText, cb));
    setBusy(false);
    if (out || cards.length) {
      renderMsg({ role: "ai", text: out || undefined, saveable: out || undefined, cards: cards.length ? cards : undefined });
    } else {
      // 空/失敗はサーバも永続化しない（out空）→次に開いても残らない。ここはその場の案内だけ。
      renderMsg({ role: "ai", text: errored ? "うまくいきませんでした（もう一度試してください）" : "（応答がありませんでした）" });
    }
    onChanged?.();
  }

  // #100④-S3b カードの操作：候補を保存（capture 相当）／書込を取り消す（可逆・undo）。
  async function saveCandidate(it: ToolCardItem) {
    await api.createNeta({ kind: it.kind, content: it.content });
    onChanged?.();
  }
  async function undoWrite(id: string) {
    await api.deleteNeta(id);
    onChanged?.();
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await run(text);
  }

  // ★停止：走行中の claude ターンを落とす。サーバが部分テキストを履歴に残し、SSE は DONE で閉じる
  // ＝consumeTurn が解決して busy が下りる（ここでは busy を触らない＝二重制御を避ける）。
  async function stopTurn() {
    try {
      await api.chatTurnStop(thread);
    } catch {
      /* 停止要求の失敗は握る（次善＝そのまま待てる） */
    }
  }

  // 対象付きで開いたら最初の提案を自動で出す
  useEffect(() => {
    if (loaded && target && !started.current) {
      started.current = true;
      void run("この内容を発展させる方向性の案を出して");
    }
  }, [target, loaded]);

  // #68 ネタを開く＝Chatを閉じて編集画面へ
  function openNeta(neta: Neta) {
    onOpenNeta?.(neta);
    onClose();
  }
  // #68 試聴プレビュー（音楽kindのみ）
  function preview(neta: Neta) {
    // 相対bass は neta の key を tonic に解決して試聴（#bass S2）。
    void playNotes(notesForContent(neta.kind, neta.content, { key: neta.key ?? 0 }), neta.tempo ?? 120);
  }
  // #S8 履歴復元のネタカード：スナップショット(id/kind/title)しか無いので、開く/試聴の直前に本体を取り直す。
  async function openNetaById(id: string) {
    try { openNeta(await api.getNeta(id)); } catch { /* 削除済み等＝黙って無視 */ }
  }
  async function previewById(id: string) {
    try { preview(await api.getNeta(id)); } catch { /* 削除済み等 */ }
  }

  async function saveKnowledge(text: string) {
    await api.createNeta({ kind: "knowledge", text });
    onChanged?.();
    pushMsg({ role: "ai", text: "知見として保存しました" });
  }

  // #70 履歴クリア（サーバ＋画面）。失敗してもメモリだけクリア＝従来挙動。
  function clearHistory() {
    setMsgs([]);
    void api.clearChatThread(thread).catch(() => {});
  }

  // 会話セッション：一覧を開く／新規作成／切替（フリーChatのみ）。
  // アクティブな器（プロジェクト）があれば、その器に束ねたセッションのみを一覧（横断は器を外す）。
  function openSessions() {
    setShowSessions(true);
    void api.listChatThreads(activeProject).then(setSessions).catch(() => {});
  }
  function pickSession(id: string) {
    localStorage.setItem("cm-chat-session", id);
    setSessionId(id);
    setShowSessions(false);
  }
  function newSession() {
    const id = "chat:" + (crypto.randomUUID?.() ?? Date.now().toString(36));
    // 器への束ねは最初の発言時に遅延（pushMsg）＝発言ゼロの空会話を作らない。
    pickSession(id);
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog chat" role="dialog" aria-label="chat" onClick={(e) => e.stopPropagation()}>
        <header>
          <div className="chat-mode">
            <button className={mode === "consult" ? "on" : ""} onClick={() => setMode("consult")}>
              相談
            </button>
            <button className={mode === "research" ? "on" : ""} onClick={() => setMode("research")}>
              調べる
            </button>
          </div>
          <div className="chat-actions">
            {!target && (
              <>
                <button aria-label="sessions" title="会話一覧" onClick={openSessions}>
                  ☰
                </button>
                <button aria-label="new-session" title="新しい会話" onClick={newSession}>
                  ＋
                </button>
              </>
            )}
            <button aria-label="clear-history" title="履歴を消す" onClick={clearHistory}>
              🗑
            </button>
            <button aria-label="close" onClick={onClose}>
              ✕
            </button>
          </div>
        </header>
        {showSessions && !target && (
          <div className="chat-sessions" role="dialog" aria-label="chat-sessions">
            <div className="chat-sessions-head">
              <strong>{activeProject ? `会話 · ${activeProject}` : "会話"}</strong>
              <button onClick={newSession}>＋ 新しい会話</button>
              <button aria-label="close-sessions" onClick={() => setShowSessions(false)}>
                ✕
              </button>
            </div>
            {sessions.length === 0 && (
              <p className="muted">
                {activeProject ? `「${activeProject}」の会話はまだありません` : "まだ会話がありません"}
              </p>
            )}
            {sessions.map((s) => (
              <button
                key={s.thread}
                type="button"
                className={"chat-session-item" + (s.thread === thread ? " on" : "")}
                onClick={() => pickSession(s.thread)}
              >
                <span className="chat-session-title">
                  {s.title ?? s.preview ?? (s.thread === "global" ? "(最初の会話)" : "(無題の会話)")}
                </span>
                <span className="muted">
                  {s.last ? new Date(s.last).toLocaleString() : "新規"} · {s.count}
                </span>
              </button>
            ))}
          </div>
        )}
        {!target && activeProject && projectInstructions && (
          <div className="chat-instr" aria-label="project-instructions-active" title={projectInstructions}>
            📌 「{activeProject}」の指示が効いています：{projectInstructions.slice(0, 60)}
            {projectInstructions.length > 60 ? "…" : ""}
          </div>
        )}
        {gear && <div className="chat-target">🎛 機材の相談（全曲共通・器に紐づかない）</div>}
        {targetLabel && <div className="chat-target">「{targetLabel.slice(0, 30)}」についての相談</div>}
        {/* リロード等で待ち状態が消えても、裏で動いてるジョブを可視化（待ちか不明をなくす）。 */}
        {inflight > 0 && !busy && (
          <div className="chat-inflight" aria-label="inflight">
            🔄 {inflight}件 実行中…（できたら受け取りトレイ 📥 とネタ帳に届きます）
          </div>
        )}
        <div className="chat-log">
          {msgs.length === 0 && (
            <p className="muted">
              {mode === "research"
                ? "調べたいことを入力（参考曲・手法など）"
                : "相談・発展・「コード進行作って」「一式そろえて」など何でも"}
            </p>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={"chat-msg " + m.role}>
              {m.text && <ChatText text={m.text} ai={m.role === "ai"} />}
              {m.cards?.map((card, k) => (
                <ChatToolCard key={k} card={card} onOpen={openNeta} onSaveItem={saveCandidate} onUndo={undoWrite} />
              ))}
              {m.saveable && (
                <button type="button" className="bs-btn" onClick={() => void saveKnowledge(m.saveable!)}>
                  知見化
                </button>
              )}
              {m.neta && (
                <div className="chat-neta-actions">
                  <button
                    type="button"
                    className="bs-btn"
                    aria-label="open-neta"
                    onClick={() => openNeta(m.neta!)}
                  >
                    ✎ 開く
                  </button>
                  {MUSIC_KINDS.includes(m.neta.kind) && (
                    <button
                      type="button"
                      className="bs-btn"
                      aria-label="preview-neta"
                      onClick={() => preview(m.neta!)}
                    >
                      ▶ 試聴
                    </button>
                  )}
                </div>
              )}
              {/* #S8 このターンで作られたネタ＝カードで残す（開き直しても消えない）。ネタ帳と同じ体裁。 */}
              {m.netas?.map((n) => (
                <div key={n.id} className="chat-neta-card">
                  <span className="kind" data-kind={n.kind}>{KIND_LABEL[n.kind ?? "other"] ?? n.kind}</span>
                  <span className="chat-neta-card-title">{n.title || "(無題)"}</span>
                  <button type="button" className="bs-btn" aria-label="open-neta" onClick={() => void openNetaById(n.id)}>✎ 開く</button>
                  {n.kind && MUSIC_KINDS.includes(n.kind) && (
                    <button type="button" className="bs-btn" aria-label="preview-neta" onClick={() => void previewById(n.id)}>▶ 試聴</button>
                  )}
                </div>
              ))}
            </div>
          ))}
          {busy && (streamText || liveCards.length > 0) && (
            <div className="chat-msg ai" aria-label="streaming">
              {streamText && <ChatText text={streamText} ai />}
              {liveCards.map((card, k) => (
                <ChatToolCard key={k} card={card} onOpen={openNeta} onSaveItem={saveCandidate} onUndo={undoWrite} />
              ))}
            </div>
          )}
          {busy && (
            <div className="chat-msg ai" aria-label="thinking">
              {/* 実況：ツール名/経過秒＋不確定バーで「動いてる」ことを示す（無進捗の沈黙を解消）。 */}
              <div className="chat-wait">
                <div className="chat-text thinking">
                  {thinkLabel || "考え中"}
                  <span className="dots" aria-hidden="true" />
                  <span className="wait-sec"> {thinkSec}s</span>
                </div>
                <div className="wait-bar" aria-hidden="true">
                  <div className="wait-bar-indet" />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="chat-input">
          <textarea
            ref={inputRef}
            aria-label="chat-input"
            rows={1}
            placeholder={busy ? "待ち中（待たずに戻れます）…" : mode === "research" ? "調べる…（Shift+Enterで改行）" : "相談を入力…（Shift+Enterで改行）"}
            value={input}
            disabled={busy} // 待ち中はこのチャットをロック（要望どおり）
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter=送信 / Shift+Enter=改行（長文向け）。日本語IME変換中のEnterは送信しない。
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
          {busy ? (
            <button className="chat-stop" aria-label="stop-turn" title="生成を止める" onClick={() => void stopTurn()}>
              ■ 停止
            </button>
          ) : (
            <button onClick={() => void send()}>送信</button>
          )}
        </div>
      </div>
    </div>
  );
}
