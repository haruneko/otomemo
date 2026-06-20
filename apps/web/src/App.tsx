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
    // 検索語があれば意味検索、無ければ kind 絞り込みで一覧（更新順）
    const list = q.trim()
      ? await api.searchSemantic(q.trim())
      : await api.listNeta({ kind: kindFilter || undefined });
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
      <NetaList items={items} onChanged={() => void reload()} />
    </main>
  );
}
