import { useEffect, useState } from "react";
import { api, type Job, type Neta } from "../api";

// 何のジョブか分かる日本語ラベル（生 intent を出さない・fb-1）。
const INTENT_LABEL: Record<string, string> = {
  consult: "相談", research: "調べる", collect: "収集", brainstorm: "壁打ち",
  gen_melody: "メロ生成", gen_chord: "コード生成", gen_rhythm: "リズム生成",
  gen_pair_rule: "一式生成", gen_chords_rule: "コード生成", gen_variations: "案出し",
  fit_to_chords: "コードに合わせる", transform: "変形", gen_lyric: "歌詞生成", import_midi: "MIDI取込",
};
const intentLabel = (i: string): string => INTENT_LABEL[i] ?? i;
// 依頼文（何を頼んだか）。instruction → params.instruction/topic/context の順。
function asked(j: Job): string {
  const p = (j.params ?? {}) as Record<string, unknown>;
  const s = j.instruction || (p.instruction as string) || (p.topic as string) || (p.context as string) || "";
  return String(s).slice(0, 60);
}
const fromChat = (j: Job): boolean => !!(j.params as Record<string, unknown> | null)?.chat_thread;

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

// #85 S3: AI が枠を聞き返すときの構造化フォーム。question が JSON フォームなら入力欄で答える。
type FormField = { key: string; label?: string; type?: string; placeholder?: string };
function parseForm(q: string): FormField[] | null {
  try {
    const o = JSON.parse(q) as { kind?: string; fields?: FormField[] };
    if (o && o.kind === "form" && Array.isArray(o.fields)) return o.fields;
  } catch {
    /* 普通のテキスト質問 */
  }
  return null;
}
const NUMERIC_KEYS = new Set(["tempo", "bars", "count", "key"]);

export function Tray({
  onClose,
  onOpenNeta,
  onOpenChat,
}: {
  onClose: () => void;
  onOpenNeta?: (n: Neta) => void; // できたネタを開く
  onOpenChat?: (targetId?: string) => void; // 由来のチャットを開く
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [results, setResults] = useState<Record<string, Neta[]>>({}); // jobId→できたネタ
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [forms, setForms] = useState<Record<string, Record<string, string>>>({});

  const reload = () =>
    api
      .listJobs()
      .then(async (js) => {
        setJobs(js);
        // done ジョブの「できたネタ」を取得（何ができたか＝カードで見せる・タップで開く）。
        const done = js.filter((j) => j.status === "done").slice(0, 20);
        const map: Record<string, Neta[]> = {};
        await Promise.all(
          done.map((j) =>
            api
              .jobOutcome(j.id)
              .then((o) => {
                if (o.neta.length) map[j.id] = o.neta;
              })
              .catch(() => {}),
          ),
        );
        setResults(map);
      })
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

  async function answerForm(id: string) {
    const f = forms[id] ?? {};
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) {
      const s = v.trim();
      if (!s) continue;
      payload[k] = NUMERIC_KEYS.has(k) && !Number.isNaN(Number(s)) ? Number(s) : s;
    }
    await api.answerJob(id, payload); // #85 S3: 構造化回答→枠(frame)へ
    setForms((m) => ({ ...m, [id]: {} }));
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
              <div className="tray-head">
                <span className="tray-intent">{intentLabel(j.intent)}</span>
                {fromChat(j) && (
                  <button className="tray-chip" aria-label="open-chat" title="このチャットを開く" onClick={() => onOpenChat?.(j.target_neta_id ?? undefined)}>
                    💬 チャット
                  </button>
                )}
                <span className={"tray-status " + j.status}>{j.status}</span>
                {j.notify_level && <span className="tray-notify">{j.notify_level}</span>}
              </div>
              {asked(j) && <div className="tray-asked">「{asked(j)}」</div>}
              {/* 何ができたか＝ネタをカードで（タップで開く）。 */}
              {(results[j.id] ?? []).length > 0 && (
                <div className="tray-results">
                  {results[j.id]!.map((n) => (
                    <button key={n.id} className="tray-result" aria-label="open-result" onClick={() => onOpenNeta?.(n)}>
                      <span className="kind" data-kind={n.kind}>{n.kind}</span>
                      <span className="tray-result-title">{n.title ?? n.text ?? "(無題)"}</span>
                    </button>
                  ))}
                </div>
              )}
              {results[j.id] === undefined && <span className="tray-peek">{peek(j)}</span>}
              {j.status === "waiting" && j.question && (() => {
                const fields = parseForm(j.question);
                if (fields) {
                  return (
                    <div className="tray-question tray-form">
                      <p>枠を教えてください</p>
                      {fields.map((fld) => (
                        <label key={fld.key} className="tray-form-field">
                          <span>{fld.label ?? fld.key}</span>
                          <input
                            aria-label={`form-${j.id}-${fld.key}`}
                            value={forms[j.id]?.[fld.key] ?? ""}
                            placeholder={fld.placeholder ?? ""}
                            onChange={(e) =>
                              setForms((m) => ({
                                ...m,
                                [j.id]: { ...(m[j.id] ?? {}), [fld.key]: e.target.value },
                              }))
                            }
                          />
                        </label>
                      ))}
                      <button className="primary" onClick={() => void answerForm(j.id)}>
                        この枠で進める
                      </button>
                    </div>
                  );
                }
                return (
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
                );
              })()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
