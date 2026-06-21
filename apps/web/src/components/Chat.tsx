import { useEffect, useRef, useState } from "react";
import { api, type Neta } from "../api";

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
}
type Mode = "consult" | "research";

// consult/content の neta_kind 表示名
const KIND_LABEL: Record<string, string> = {
  melody: "メロディ",
  chord_progression: "コード進行",
  rhythm: "リズム",
};

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
  const [mode, setMode] = useState<Mode>("consult");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const targetLabel = target ? (target.title ?? target.text ?? "(無題)") : null;

  async function run(text: string) {
    setMsgs((m) => [...m, { role: "user", text }]);
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
            setMsgs((m) => [
              ...m,
              { role: "ai", text: summary, saveable: summary, references, jobId: job.id },
            ]);
          } else {
            await handleConsult(j.result, job.id); // #61 判別ユニオン
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

  // #61 consult の判別ユニオン: chat / options / content(生成→正しいkindでネタ化) / plan
  async function handleConsult(result: unknown, jobId: string) {
    const r = result as {
      type?: string;
      text?: string;
      options?: Opt[];
      neta_kind?: string;
      content?: unknown;
      plan?: string;
    } | null;
    if (r?.type === "options") {
      setMsgs((m) => [...m, { role: "ai", options: r.options ?? [], jobId }]);
    } else if (r?.type === "content" && r.neta_kind) {
      await api.createNeta({ kind: r.neta_kind, content: r.content, from_job: jobId });
      onChanged?.();
      const label = KIND_LABEL[r.neta_kind] ?? r.neta_kind;
      setMsgs((m) => [...m, { role: "ai", text: `「${label}」を作りました（ネタ帳に追加）` }]);
    } else if (r?.type === "plan") {
      setMsgs((m) => [
        ...m,
        { role: "ai", text: `${r.plan ?? "分解しました"}（結果は受け取りトレイ 📥 に届きます）` },
      ]);
    } else {
      const t = r?.text ?? "";
      setMsgs((m) => [...m, { role: "ai", text: t, saveable: t || undefined }]);
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
      kind: target?.kind ?? "knowledge", // #61 other 廃止（無targetは知見として）
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
    setMsgs((m) => [...m, { role: "ai", text: `参考曲「${r.title}」を保存しました` }]);
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
          <button aria-label="close" onClick={onClose}>
            ✕
          </button>
        </header>
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
