import { useState } from "react";
import { api, type Neta } from "../api";

type BrainstormState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; text: string }
  | { state: "error"; text: string };

export function NetaCard({ neta }: { neta: Neta }) {
  const label = neta.title ?? neta.text ?? "(無題)";
  const [bs, setBs] = useState<BrainstormState>({ state: "idle" });

  async function brainstorm() {
    setBs({ state: "running" });
    try {
      const job = await api.createJob({
        intent: "brainstorm",
        target_neta_id: neta.id,
        params: { context: neta.title ?? neta.text ?? "" },
      });
      for (let i = 0; i < 60; i++) {
        const j = await api.getJob(job.id);
        if (j.status === "done") {
          const text =
            (j.result && "suggestions" in j.result && (j.result.suggestions as string)) ||
            JSON.stringify(j.result);
          setBs({ state: "done", text });
          return;
        }
        if (j.status === "failed") {
          setBs({ state: "error", text: j.error ?? "失敗しました" });
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setBs({ state: "error", text: "タイムアウト" });
    } catch (e) {
      setBs({ state: "error", text: String(e) });
    }
  }

  return (
    <article aria-label="neta-card" data-kind={neta.kind}>
      <header>
        <span className="kind">{neta.kind}</span>
        <code className="id">{neta.id.slice(0, 8)}</code>
      </header>
      <div className="body">{label}</div>
      {neta.tags.length > 0 && (
        <footer>
          {neta.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </footer>
      )}
      <button className="bs-btn" onClick={brainstorm} disabled={bs.state === "running"}>
        {bs.state === "running" ? "壁打ち中…" : "壁打ち"}
      </button>
      {(bs.state === "done" || bs.state === "error") && <pre className="bs-result">{bs.text}</pre>}
    </article>
  );
}

export function NetaList({ items }: { items: Neta[] }) {
  if (items.length === 0) return <p>まだネタがありません。</p>;
  return (
    <section aria-label="neta-list">
      {items.map((n) => (
        <NetaCard key={n.id} neta={n} />
      ))}
    </section>
  );
}
