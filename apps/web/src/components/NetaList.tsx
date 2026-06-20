import { useState } from "react";
import { api, type Neta } from "../api";
import { NetaDialog } from "./NetaDialog";

export function NetaCard({
  neta,
  onChanged,
  onChat,
}: {
  neta: Neta;
  onChanged?: () => void;
  onChat?: (neta: Neta) => void;
}) {
  const label = neta.title ?? neta.text ?? "(無題)";
  const [editing, setEditing] = useState(false);
  const [gen, setGen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);

  async function generate(kind: "melody" | "chord_progression" | "rhythm") {
    setGenOpen(false);
    setGen(true);
    try {
      const intent =
        kind === "melody" ? "gen_melody" : kind === "chord_progression" ? "gen_chord" : "gen_rhythm";
      const job = await api.createJob({
        intent,
        target_neta_id: neta.id,
        params: { context: neta.title ?? neta.text ?? "" },
      });
      for (let i = 0; i < 60; i++) {
        const j = await api.getJob(job.id);
        if (j.status === "done") {
          const content = (j.result as { content?: unknown } | null)?.content;
          await api.createNeta({ kind, title: neta.title ?? "案", content, from_job: job.id });
          onChanged?.();
          return;
        }
        if (j.status === "failed") return;
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      setGen(false);
    }
  }

  return (
    <article aria-label="neta-card" data-kind={neta.kind}>
      <div
        className="card-main"
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditing(true);
        }}
      >
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
      </div>
      <div className="bs-tools">
        <button className="bs-btn" onClick={() => onChat?.(neta)}>
          壁打ち
        </button>
        {gen ? (
          <span className="bs-btn">生成中…</span>
        ) : genOpen ? (
          <>
            <button className="bs-btn" onClick={() => generate("melody")}>
              メロ
            </button>
            <button className="bs-btn" onClick={() => generate("chord_progression")}>
              コード
            </button>
            <button className="bs-btn" onClick={() => generate("rhythm")}>
              リズム
            </button>
          </>
        ) : (
          <button className="bs-btn" onClick={() => setGenOpen(true)}>
            生成 ▾
          </button>
        )}
      </div>
      {editing && (
        <NetaDialog neta={neta} onClose={() => setEditing(false)} onChanged={onChanged} />
      )}
    </article>
  );
}

export function NetaList({
  items,
  onChanged,
  onChat,
}: {
  items: Neta[];
  onChanged?: () => void;
  onChat?: (neta: Neta) => void;
}) {
  if (items.length === 0) return <p>まだネタがありません。</p>;
  return (
    <section aria-label="neta-list">
      {items.map((n) => (
        <NetaCard key={n.id} neta={n} onChanged={onChanged} onChat={onChat} />
      ))}
    </section>
  );
}
