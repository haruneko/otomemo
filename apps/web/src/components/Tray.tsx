import { useEffect, useState } from "react";
import { api, type Job } from "../api";

// 受け取りトレイ（design「投げて→進めて→受け取る」の受け取り面）。最近のジョブと結果の覗き見。
function peek(j: Job): string {
  const r = j.result as Record<string, unknown> | null;
  if (!r) return j.error ? `失敗: ${j.error}` : "";
  if (typeof r.summary === "string") return r.summary.slice(0, 80);
  if (typeof r.plan === "string") return r.plan;
  if (Array.isArray(r.subtasks)) return `${r.subtasks.length}個のタスクに分解`;
  if (Array.isArray(r.options) && r.options[0]) return String((r.options[0] as { title?: string }).title ?? "");
  if (r.content) return "（生成結果→ネタ化されました）";
  if (typeof r.suggestions === "string") return r.suggestions.slice(0, 80);
  return "";
}

export function Tray({ onClose }: { onClose: () => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const reload = () =>
    api
      .listJobs()
      .then(setJobs)
      .catch(() => {});
  useEffect(() => {
    void reload();
  }, []);

  async function answer(id: string) {
    const a = (answers[id] ?? "").trim();
    if (!a) return;
    await api.answerJob(id, a); // #45: 継続ジョブが積まれる
    setAnswers((m) => ({ ...m, [id]: "" }));
    await reload();
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog tray" role="dialog" aria-label="tray" onClick={(e) => e.stopPropagation()}>
        <header>
          <span>受け取りトレイ</span>
          <button aria-label="close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="tray-list">
          {jobs.length === 0 && <p className="muted">ジョブはまだありません</p>}
          {jobs.map((j) => (
            <div key={j.id} className={"tray-job" + (j.status === "waiting" ? " waiting" : "")}>
              <span className="tray-intent">{j.intent}</span>
              <span className={"tray-status " + j.status}>{j.status}</span>
              {j.notify_level && <span className="tray-notify">{j.notify_level}</span>}
              <span className="tray-peek">{peek(j)}</span>
              {j.status === "waiting" && j.question && (
                <div className="tray-question">
                  <p>{j.question}</p>
                  <input
                    aria-label={`answer-${j.id}`}
                    value={answers[j.id] ?? ""}
                    onChange={(e) => setAnswers((m) => ({ ...m, [j.id]: e.target.value }))}
                    placeholder="回答…"
                  />
                  <button className="primary" onClick={() => void answer(j.id)}>
                    回答
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
