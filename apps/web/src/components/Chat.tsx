import { useEffect, useRef, useState } from "react";
import { api, type Neta, type ChatMessage, type ChatThread } from "../api";
import { playNotes, notesForContent, MUSIC_KINDS } from "../music";

interface Opt {
  title: string;
  body: string;
}
interface Ref {
  title: string;
  artist?: string;
  why?: string;
  points?: string;
}
interface Msg {
  role: "user" | "ai";
  text?: string;
  options?: Opt[];
  references?: Ref[];
  jobId?: string;
  saveable?: string;
  neta?: Neta; // #68 作成したネタ（開く/試聴リンク用）
}
type Mode = "consult" | "research";

// consult/content の neta_kind 表示名
const KIND_LABEL: Record<string, string> = {
  melody: "メロディ",
  bass: "ベース",
  chord_progression: "コード進行",
  rhythm: "リズム",
};

// 相談（docs/design.md #19/#20）。target 付きで開くと「このネタについての相談」になり、
// 最初の提案を自動で出す。案は Chat 上で選んでネタ化（from_job で対象に紐づく）。
export function Chat({
  target,
  onChanged,
  onClose,
  onOpenNeta,
}: {
  target?: Neta;
  onChanged?: () => void;
  onClose: () => void;
  onOpenNeta?: (neta: Neta) => void; // #68 ネタを開く（Chatは閉じる）
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("consult");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false); // #70 履歴ロード完了（自動初回提案はこの後）
  const started = useRef(false);
  // 複数会話セッション（フリーChatのみ。Claude/ChatGPT風に作って切替/見返す）。
  const [sessionId, setSessionId] = useState(() =>
    target ? "" : (localStorage.getItem("cm-chat-session") ?? "global"),
  );
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions] = useState<ChatThread[]>([]);

  const targetLabel = target ? (target.title ?? target.text ?? "(無題)") : null;

  // #70 スレッド＝対象ネタ id（無ければフリーChatの会話セッションid）。
  const thread = target?.id ?? sessionId;

  // #70 永続化（後退ゼロ）：保存に失敗してもメモリだけで従来どおり動く。
  // 構造化ペイロード（options/references/neta/jobId/saveable）は data へ畳む。
  function persistMsg(m: Msg) {
    const { role, text, ...rest } = m;
    const data = Object.keys(rest).length ? rest : undefined;
    const kind = m.options
      ? "options"
      : m.references
        ? "research"
        : m.neta
          ? "content"
          : "chat";
    void api.addChatMessage(thread, { role, kind, text: text ?? null, data }).catch(() => {});
  }
  // 保存しつつ画面にも積む（送受信の両方でこれを使う）。
  function pushMsg(m: Msg) {
    setMsgs((prev) => [...prev, m]);
    persistMsg(m);
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

  async function run(text: string) {
    pushMsg({ role: "user", text });
    setBusy(true);
    try {
      const ctx = target ? (target.title ?? target.text ?? "") : "";
      const intent = mode === "research" ? "research" : "consult";
      const params =
        mode === "research"
          ? { topic: text }
          : { context: ctx, instruction: text, target_kind: target?.kind };
      const job = await api.createJob({ intent, target_neta_id: target?.id, params });
      for (let i = 0; i < 80; i++) {
        const j = await api.getJob(job.id);
        if (j.status === "done") {
          if (mode === "research") {
            const r = j.result as { summary?: string; references?: Ref[] } | null;
            const summary = r?.summary ?? "";
            const references = Array.isArray(r?.references) ? r!.references : [];
            pushMsg({ role: "ai", text: summary, saveable: summary, references, jobId: job.id });
          } else {
            await handleConsult(j.result, job.id); // #61 判別ユニオン
          }
          return;
        }
        if (j.status === "failed") {
          pushMsg({ role: "ai", text: j.error ?? "失敗しました" });
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      setBusy(false);
    }
  }

  // #61 consult の判別ユニオン: chat / options / content(生成→正しいkindでネタ化) / plan
  async function handleConsult(result: unknown, jobId: string) {
    const r = result as {
      type?: string;
      text?: string;
      options?: Opt[];
      neta_kind?: string;
      content?: unknown;
      plan?: string;
      items?: unknown[];
    } | null;
    if (r?.type === "options") {
      pushMsg({ role: "ai", options: r.options ?? [], jobId });
    } else if (r?.type === "items") {
      // #86 S2b agentic：ツールで作った一式。materialize は server(reap)が担うので一覧/トレイに出る。
      const n = Array.isArray(r.items) ? r.items.filter((it) => (it as { kind?: string }).kind !== "section").length : 0;
      pushMsg({ role: "ai", text: `${n}個のパーツを作りました（一覧 / トレイ 📥 に届きます）` });
      onChanged?.();
    } else if (r?.type === "content" && r.neta_kind) {
      const neta = await api.createNeta({ kind: r.neta_kind, content: r.content, from_job: jobId });
      onChanged?.();
      const label = KIND_LABEL[r.neta_kind] ?? r.neta_kind;
      pushMsg({ role: "ai", text: `「${label}」を作りました`, neta });
    } else if (r?.type === "plan") {
      pushMsg({
        role: "ai",
        text: `${r.plan ?? "分解しました"}（結果は受け取りトレイ 📥 に届きます）`,
      });
    } else {
      const t = r?.text ?? "";
      pushMsg({ role: "ai", text: t, saveable: t || undefined });
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await run(text);
  }

  // 対象付きで開いたら最初の提案を自動で出す
  useEffect(() => {
    if (loaded && target && !started.current) {
      started.current = true;
      void run("この内容を発展させる方向性の案を出して");
    }
  }, [target, loaded]);

  async function pick(o: Opt, jobId?: string) {
    const neta = await api.createNeta({
      kind: target?.kind ?? "knowledge", // #61 other 廃止（無targetは知見として）
      title: o.title || undefined,
      text: o.body,
      from_job: jobId,
    });
    onChanged?.();
    pushMsg({ role: "ai", text: `「${o.title || "案"}」をネタ化しました`, neta });
  }

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

  async function saveKnowledge(text: string) {
    await api.createNeta({ kind: "knowledge", text });
    onChanged?.();
    pushMsg({ role: "ai", text: "知見として保存しました" });
  }

  // #9 参考曲を1曲だけ reference ネタとして保存
  async function saveRef(r: Ref, jobId?: string) {
    const body = [r.why, r.points].filter(Boolean).join("\n");
    await api.createNeta({
      kind: "reference",
      title: r.artist ? `${r.title} / ${r.artist}` : r.title,
      text: body,
      content: { references: [r] },
      from_job: jobId,
    });
    onChanged?.();
    pushMsg({ role: "ai", text: `参考曲「${r.title}」を保存しました` });
  }

  // #70 履歴クリア（サーバ＋画面）。失敗してもメモリだけクリア＝従来挙動。
  function clearHistory() {
    setMsgs([]);
    void api.clearChatThread(thread).catch(() => {});
  }

  // 会話セッション：一覧を開く／新規作成／切替（フリーChatのみ）。
  function openSessions() {
    setShowSessions(true);
    void api.listChatThreads().then(setSessions).catch(() => {});
  }
  function pickSession(id: string) {
    localStorage.setItem("cm-chat-session", id);
    setSessionId(id);
    setShowSessions(false);
  }
  function newSession() {
    const id = "chat:" + (crypto.randomUUID?.() ?? Date.now().toString(36));
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
              <strong>会話</strong>
              <button onClick={newSession}>＋ 新しい会話</button>
              <button aria-label="close-sessions" onClick={() => setShowSessions(false)}>
                ✕
              </button>
            </div>
            {sessions.length === 0 && <p className="muted">まだ会話がありません</p>}
            {sessions.map((s) => (
              <button
                key={s.thread}
                type="button"
                className={"chat-session-item" + (s.thread === thread ? " on" : "")}
                onClick={() => pickSession(s.thread)}
              >
                <span className="chat-session-title">
                  {s.preview ?? (s.thread === "global" ? "(最初の会話)" : "(無題の会話)")}
                </span>
                <span className="muted">{new Date(s.last).toLocaleString()} · {s.count}</span>
              </button>
            ))}
          </div>
        )}
        {targetLabel && <div className="chat-target">「{targetLabel.slice(0, 30)}」についての相談</div>}
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
              {m.text && <div className="chat-text">{m.text}</div>}
              {m.saveable && (
                <button type="button" className="bs-btn" onClick={() => void saveKnowledge(m.saveable!)}>
                  知見化
                </button>
              )}
              {m.options && (
                <div className="bs-options">
                  {m.options.map((o, k) => (
                    <button
                      key={k}
                      type="button"
                      className="bs-option"
                      onClick={() => void pick(o, m.jobId)}
                    >
                      <strong>{o.title || "案"}</strong>
                      <span>{o.body}</span>
                    </button>
                  ))}
                </div>
              )}
              {m.references && m.references.length > 0 && (
                <div className="ref-list">
                  {m.references.map((r, k) => (
                    <div key={k} className="ref-card">
                      <div className="ref-head">
                        <strong>{r.title}</strong>
                        {r.artist && <span className="ref-artist">{r.artist}</span>}
                      </div>
                      {r.why && <p className="ref-why">{r.why}</p>}
                      {r.points && <p className="ref-points">{r.points}</p>}
                      <button
                        type="button"
                        className="bs-btn"
                        aria-label={`save-ref-${k}`}
                        onClick={() => void saveRef(r, m.jobId)}
                      >
                        参考曲を保存
                      </button>
                    </div>
                  ))}
                </div>
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
            </div>
          ))}
          {busy && (
            <div className="chat-msg ai" aria-label="thinking">
              <div className="chat-text thinking">
                考え中<span className="dots" aria-hidden="true" />
              </div>
            </div>
          )}
        </div>
        <div className="chat-input">
          <input
            aria-label="chat-input"
            placeholder={mode === "research" ? "調べる…" : "相談を入力…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
          />
          <button onClick={() => void send()} disabled={busy}>
            {busy ? "…" : "送信"}
          </button>
        </div>
      </div>
    </div>
  );
}
