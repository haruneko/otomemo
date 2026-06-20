import { useState } from "react";
import { api, type Neta } from "../api";

interface Opt {
  title: string;
  body: string;
}
type BS =
  | { state: "idle" }
  | { state: "running" }
  | { state: "options"; options: Opt[] }
  | { state: "error"; text: string };

export function NetaCard({ neta, onChanged }: { neta: Neta; onChanged?: () => void }) {
  const label = neta.title ?? neta.text ?? "(無題)";
  const [bs, setBs] = useState<BS>({ state: "idle" });

  async function suggest() {
    setBs({ state: "running" });
    try {
      const job = await api.createJob({
        intent: "suggest",
        target_neta_id: neta.id,
        params: { context: neta.title ?? neta.text ?? "" },
      });
      for (let i = 0; i < 60; i++) {
        const j = await api.getJob(job.id);
        if (j.status === "done") {
          const options = ((j.result as { options?: Opt[] } | null)?.options ?? []).filter(Boolean);
          setBs({ state: "options", options });
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

  async function choose(o: Opt) {
    const created = await api.createNeta({
      kind: neta.kind,
      title: o.title || undefined,
      text: o.body,
    });
    await api.link(neta.id, created.id, "suggestion").catch(() => {});
    setBs({ state: "idle" });
    onChanged?.();
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
      <button className="bs-btn" onClick={suggest} disabled={bs.state === "running"}>
        {bs.state === "running" ? "考え中…" : "壁打ち"}
      </button>
      {bs.state === "error" && <pre className="bs-result">{bs.text}</pre>}
      {bs.state === "options" && (
        <div className="bs-options" aria-label="suggestions">
          {bs.options.map((o, i) => (
            <button key={i} type="button" className="bs-option" onClick={() => choose(o)}>
              <strong>{o.title || "案"}</strong>
              <span>{o.body}</span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

export function NetaList({ items, onChanged }: { items: Neta[]; onChanged?: () => void }) {
  if (items.length === 0) return <p>まだネタがありません。</p>;
  return (
    <section aria-label="neta-list">
      {items.map((n) => (
        <NetaCard key={n.id} neta={n} onChanged={onChanged} />
      ))}
    </section>
  );
}
