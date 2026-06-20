import { useCallback, useEffect, useState } from "react";
import { api, type Neta } from "./api";
import { applyColors, loadColors } from "./theme";
import { Capture } from "./components/Capture";
import { NetaList } from "./components/NetaList";
import { ThemeSettings } from "./settings/ThemeSettings";
import { midiToNotes } from "./music";
import { Chat } from "./components/Chat";

const FILTER_KINDS = ["lyric", "melody", "chord", "rhythm", "theme", "song"];

export function App() {
  const [items, setItems] = useState<Neta[]>([]);
  const [kindFilter, setKindFilter] = useState("");
  const [q, setQ] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

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
      <div className="app-head">
        <h1>creative_manager</h1>
        <div className="head-right">
          <label className="import-btn">
            MIDI取込
            <input
              type="file"
              accept=".mid,.midi"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const { notes } = midiToNotes(await file.arrayBuffer());
                await api.createNeta({
                  kind: "melody",
                  title: file.name.replace(/\.midi?$/i, ""),
                  content: { notes },
                });
                e.target.value = "";
                await reload();
              }}
            />
          </label>
          <button className="gear" aria-label="chat" onClick={() => setChatOpen(true)}>
            💬
          </button>
          <button className="gear" aria-label="settings" onClick={() => setSettingsOpen(true)}>
            ⚙
          </button>
        </div>
      </div>
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
      {chatOpen && <Chat onClose={() => setChatOpen(false)} onChanged={() => void reload()} />}
      {settingsOpen && (
        <div className="dialog-backdrop" onClick={() => setSettingsOpen(false)}>
          <div
            className="dialog"
            role="dialog"
            aria-label="settings"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <span>設定</span>
              <button aria-label="close" onClick={() => setSettingsOpen(false)}>
                ✕
              </button>
            </header>
            <ThemeSettings />
          </div>
        </div>
      )}
    </main>
  );
}
