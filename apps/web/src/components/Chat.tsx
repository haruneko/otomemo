import { useState } from "react";
import { api } from "../api";

interface Opt {
  title: string;
  body: string;
}
interface Msg {
  role: "user" | "ai";
  text?: string;
  options?: Opt[];
  saveable?: string;
}
type Mode = "suggest" | "research";

// プロジェクト全体への相談（docs/design.md #19/#20 Chat）。
// 壁打ち：suggest → 案を提示 → 選ぶとネタ化。調べる：research → 要約 → 知見ネタ化。
export function Chat({ onChanged, onClose }: { onChanged?: () => void; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("suggest");
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const intent = mode === "research" ? "research" : "suggest";
      const params = mode === "research" ? { topic: text } : { context: "", instruction: text };
      const job = await api.createJob({ intent, params });
      for (let i = 0; i < 80; i++) {
        const j = await api.getJob(job.id);
        if (j.status === "done") {
          if (mode === "research") {
            const summary = (j.result as { summary?: string } | null)?.summary ?? "";
            setMsgs((m) => [...m, { role: "ai", text: summary, saveable: summary }]);
          } else {
            const options = (j.result as { options?: Opt[] } | null)?.options ?? [];
            setMsgs((m) => [...m, { role: "ai", options }]);
          }
          return;
        }
        if (j.status === "failed") {
          setMsgs((m) => [...m, { role: "ai", text: j.error ?? "失敗しました" }]);
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      setBusy(false);
    }
  }

  async function pick(o: Opt) {
    await api.createNeta({ kind: "other", title: o.title || undefined, text: o.body });
    onChanged?.();
    setMsgs((m) => [...m, { role: "ai", text: `「${o.title || "案"}」をネタ化しました` }]);
  }

  async function saveKnowledge(text: string) {
    await api.createNeta({ kind: "knowledge", text });
    onChanged?.();
    setMsgs((m) => [...m, { role: "ai", text: "知見として保存しました" }]);
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog chat" role="dialog" aria-label="chat" onClick={(e) => e.stopPropagation()}>
        <header>
          <div className="chat-mode">
            <button className={mode === "suggest" ? "on" : ""} onClick={() => setMode("suggest")}>
              壁打ち
            </button>
            <button className={mode === "research" ? "on" : ""} onClick={() => setMode("research")}>
              調べる
            </button>
          </div>
          <button aria-label="close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="chat-log">
          {msgs.length === 0 && (
            <p className="muted">
              {mode === "research"
                ? "調べたいことを入力（例：シューゲイザーのギター音作り）"
                : "ざっくり投げてください（例：明るい疾走感のサビのコード進行）"}
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
                    <button key={k} type="button" className="bs-option" onClick={() => pick(o)}>
                      <strong>{o.title || "案"}</strong>
                      <span>{o.body}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
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
