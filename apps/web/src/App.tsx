import { useCallback, useEffect, useState } from "react";
import { api, type Neta } from "./api";
import { applyColors, loadColors } from "./theme";
import { Capture } from "./components/Capture";
import { NetaList } from "./components/NetaList";

const FILTER_KINDS = ["lyric", "melody", "chord", "rhythm", "theme", "song"];

export function App() {
  const [items, setItems] = useState<Neta[]>([]);
  const [kindFilter, setKindFilter] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    applyColors(loadColors());
  }, []);

  const reload = useCallback(async () => {
    const list = await api.listNeta({ kind: kindFilter || undefined, q: q || undefined });
    setItems(list);
  }, [kindFilter, q]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  return (
    <main>
      <h1>creative_manager</h1>
      <Capture onCreated={() => void reload()} />
      <div className="filters">
        <input
          aria-label="search"
          placeholder="検索…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="kind-filter"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
        >
          <option value="">すべて</option>
          {FILTER_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <NetaList items={items} />
    </main>
  );
}
