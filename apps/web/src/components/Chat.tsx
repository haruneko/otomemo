import { useEffect, useRef, useState } from "react";
import { api, type Neta } from "../api";

interface Opt {
  title: string;
  body: string;
}
interface Msg {
  role: "user" | "ai";
  text?: string;
  options?: Opt[];
  jobId?: string;
  saveable?: string;
}
type Mode = "suggest" | "research" | "plan";

// 相談（docs/design.md #19/#20）。target 付きで開くと「このネタについての相談」になり、
// 最初の提案を自動で出す。案は Chat 上で選んでネタ化（from_job で対象に紐づく）。
export function Chat({
  target,
  onChanged,
  onClose,
}: {
  target?: Neta;
  onChanged?: () => void;
  onClose: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("suggest");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const targetLabel = target ? (target.title ?? target.text ?? "(無題)") : null;

  async function run(text: string) {
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const intent = mode === "research" ? "research" : mode === "plan" ? "plan" : "suggest";
      const ctx = target ? (target.title ?? target.text ?? "") : "";
      const params =
        mode === "research"
          ? { topic: text }
          : mode === "plan"
            ? { instruction: text, context: ctx }
            : { context: ctx, instruction: text };
      const job = await api.createJob({ intent, target_neta_id: target?.id, params });
      for (let i = 0; i < 80; i++) {
        const j = await api.getJob(job.id);
        if (j.status === "done") {
          if (mode === "research") {
            const summary = (j.result as { summary?: string } | null)?.summary ?? "";
            setMsgs((m) => [...m, { role: "ai", text: summary, saveable: summary }]);
          } else if (mode === "plan") {
            const plan = (j.result as { plan?: string } | null)?.plan ?? "計画しました";
            setMsgs((m) => [
              ...m,
              { role: "ai", text: `${plan}（結果は受け取りトレイ 📥 に届きます）` },
            ]);
          } else {
            const options = (j.result as { options?: Opt[] } | null)?.options ?? [];
            setMsgs((m) => [...m, { role: "ai", options, jobId: job.id }]);
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

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await run(text);
  }

  // 対象付きで開いたら最初の提案を自動で出す
  useEffect(() => {
    if (target && !started.current) {
      started.current = true;
      void run("この内容を発展させる方向性の案を出して");
    }
  }, [target]);

  async function pick(o: Opt, jobId?: string) {
    await api.createNeta({
      kind: target?.kind ?? "other",
      title: o.title || undefined,
      text: o.body,
      from_job: jobId,
    });
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
            <button className={mode === "plan" ? "on" : ""} onClick={() => setMode("plan")}>
              おまかせ
            </button>
          </div>
          <button aria-label="close" onClick={onClose}>
            ✕
          </button>
        </header>
        {targetLabel && <div className="chat-target">「{targetLabel.slice(0, 30)}」についての相談</div>}
        <div className="chat-log">
          {msgs.length === 0 && (
            <p className="muted">
              {mode === "research"
                ? "調べたいことを入力"
                : mode === "plan"
                  ? "おまかせで投げる（例：夜の曲のサビを一式そろえて）"
                  : "ざっくり投げてください"}
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
