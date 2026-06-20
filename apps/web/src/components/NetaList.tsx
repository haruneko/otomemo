import { useState } from "react";
import { api, type Neta } from "../api";

export function NetaCard({
  neta,
  onChanged,
  onChat,
  onOpen,
}: {
  neta: Neta;
  onChanged?: () => void;
  onChat?: (neta: Neta) => void;
  onOpen?: (neta: Neta) => void;
}) {
  const label = neta.title ?? neta.text ?? "(無題)";
  const [gen, setGen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);

  const intentOf = {
    melody: "gen_melody",
    chord_progression: "gen_chord",
    rhythm: "gen_rhythm",
  } as const;
  const ctx = () => neta.title ?? neta.text ?? "";

  async function pollContent(jobId: string): Promise<unknown> {
    // worker の claude_prompt timeout(120s)を超えるまで待つ（落ちても api 側 reaper が拾う）
    for (let i = 0; i < 90; i++) {
      const j = await api.getJob(jobId);
      if (j.status === "done") return (j.result as { content?: unknown } | null)?.content;
      if (j.status === "failed") return undefined;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return undefined;
  }

  async function generate(kind: keyof typeof intentOf) {
    setGenOpen(false);
    setGen(true);
    try {
      const job = await api.createJob({
        intent: intentOf[kind],
        target_neta_id: neta.id,
        params: { context: ctx() },
      });
      const content = await pollContent(job.id);
      if (content == null) return; // 失敗/タイムアウト：空ネタを作らない（トレイに失敗が出る）
      await api.createNeta({ kind, title: neta.title ?? "案", content, from_job: job.id });
      onChanged?.();
    } finally {
      setGen(false);
    }
  }

  // 全体作例：メロ+コード+リズムを生成して section に composeする
  async function generateSection() {
    setGenOpen(false);
    setGen(true);
    try {
      const section = await api.createNeta({ kind: "section", title: `${ctx() || "作例"} 一式` });
      for (const kind of ["melody", "chord_progression", "rhythm"] as const) {
        const job = await api.createJob({
          intent: intentOf[kind],
          target_neta_id: neta.id,
          params: { context: ctx() },
        });
        const content = await pollContent(job.id);
        if (content == null) continue; // 失敗の子は作らない
        const child = await api.createNeta({ kind, title: kind, content, from_job: job.id });
        await api.placeChild(section.id, child.id, 0, 0).catch(() => {});
      }
      onChanged?.();
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
        onClick={() => onOpen?.(neta)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen?.(neta);
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
            <button className="bs-btn" onClick={generateSection}>
              全体
            </button>
          </>
        ) : (
          <button className="bs-btn" onClick={() => setGenOpen(true)}>
            生成 ▾
          </button>
        )}
      </div>
    </article>
  );
}

export function NetaList({
  items,
  onChanged,
  onChat,
  onOpen,
}: {
  items: Neta[];
  onChanged?: () => void;
  onChat?: (neta: Neta) => void;
  onOpen?: (neta: Neta) => void;
}) {
  if (items.length === 0) return <p>まだネタがありません。</p>;
  return (
    <section aria-label="neta-list">
      {items.map((n) => (
        <NetaCard key={n.id} neta={n} onChanged={onChanged} onChat={onChat} onOpen={onOpen} />
      ))}
    </section>
  );
}
