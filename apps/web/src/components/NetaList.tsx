import type { Neta } from "../api";

export function NetaCard({ neta }: { neta: Neta }) {
  const label = neta.title ?? neta.text ?? "(無題)";
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
