import { useCallback, useEffect, useState } from "react";
import { api, type Neta } from "./api";
import { applyColors, loadColors } from "./theme";
import { Capture } from "./components/Capture";
import { NetaList } from "./components/NetaList";
import { ThemeSettings } from "./settings/ThemeSettings";
import { midiToNotes } from "./music";
import { Chat } from "./components/Chat";
import { Tray } from "./components/Tray";
import { flushOutbox } from "./outbox";

const FILTER_KINDS = ["lyric", "melody", "chord", "rhythm", "theme", "section", "song"];

export function App() {
  const [items, setItems] = useState<Neta[]>([]);
  const [kindFilter, setKindFilter] = useState("");
  const [q, setQ] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<Neta | undefined>(undefined);
  const [trayOpen, setTrayOpen] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const openChat = (target?: Neta) => {
    setChatTarget(target);
    setChatOpen(true);
  };

  function openTray() {
    setTrayOpen(true);
    localStorage.setItem("cm-tray-seen", String(Date.now()));
    setDoneCount(0);
  }

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

  // オフライン退避分をオンライン復帰時に同期
  useEffect(() => {
    const doFlush = () => {
      void flushOutbox().then((n) => {
        if (n) void reload();
      });
    };
    doFlush();
    window.addEventListener("online", doFlush);
    return () => window.removeEventListener("online", doFlush);
  }, [reload]);

  // 受け取りトレイの通知バッジ：前回見て以降に done になったジョブ数
  useEffect(() => {
    const tick = () => {
      void api
        .listJobs({ status: "done" })
        .then((js) => {
          const seen = Number(localStorage.getItem("cm-tray-seen") ?? 0);
          setDoneCount(js.filter((j) => new Date(j.created ?? 0).getTime() > seen).length);
        })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, []);

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
          <label className="import-btn">
            歌詞取込
            <input
              type="file"
              accept=".txt,text/plain"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const parts = (await file.text())
                  .split(/\n\s*\n/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                for (const p of parts) await api.createNeta({ kind: "lyric", text: p });
                e.target.value = "";
                await reload();
              }}
            />
          </label>
          <button className="gear" aria-label="tray" onClick={openTray}>
            📥{doneCount > 0 && <span className="badge">{doneCount}</span>}
          </button>
          <button className="gear" aria-label="chat" onClick={() => openChat()}>
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
      <NetaList items={items} onChanged={() => void reload()} onChat={openChat} />
      {chatOpen && (
        <Chat
          target={chatTarget}
          onClose={() => {
            setChatOpen(false);
            setChatTarget(undefined);
          }}
          onChanged={() => void reload()}
        />
      )}
      {trayOpen && <Tray onClose={() => setTrayOpen(false)} />}
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
