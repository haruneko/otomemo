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
}

// プロジェクト全体への相談（docs/design.md #19/#20 Chat）。
// 自然言語を投げる → suggest ジョブ → 案を提示 → 選ぶとネタ化。
export function Chat({ onChanged, onClose }: { onChanged?: () => void; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const job = await api.createJob({ intent: "suggest", params: { context: "", instruction: text } });
      for (let i = 0; i < 60; i++) {
        const j = await api.getJob(job.id);
        if (j.status === "done") {
          const options = (j.result as { options?: Opt[] } | null)?.options ?? [];
          setMsgs((m) => [...m, { role: "ai", options }]);
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

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog chat" role="dialog" aria-label="chat" onClick={(e) => e.stopPropagation()}>
        <header>
          <span>相談（壁打ち）</span>
          <button aria-label="close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="chat-log">
          {msgs.length === 0 && (
            <p className="muted">ざっくり投げてください（例：明るい疾走感のサビのコード進行）</p>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={"chat-msg " + m.role}>
              {m.text && <div className="chat-text">{m.text}</div>}
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
            placeholder="相談を入力…"
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
