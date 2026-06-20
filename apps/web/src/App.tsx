import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Neta } from "./api";
import { applyColors, loadColors } from "./theme";
import { Capture } from "./components/Capture";
import { NetaList } from "./components/NetaList";
import { NetaDialog } from "./components/NetaDialog";
import { ThemeSettings } from "./settings/ThemeSettings";
import { midiToNotes } from "./music";
import { Chat } from "./components/Chat";
import { Tray } from "./components/Tray";
import { flushOutbox } from "./outbox";

const FILTER_KINDS = [
  "lyric",
  "melody",
  "chord",
  "chord_progression",
  "rhythm",
  "theme",
  "section",
  "song",
];

export function App() {
  const [items, setItems] = useState<Neta[]>([]);
  const [kindFilter, setKindFilter] = useState("");
  const [q, setQ] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<Neta | undefined>(undefined);
  const [trayOpen, setTrayOpen] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [editing, setEditing] = useState<Neta | null>(null);

  async function newSong() {
    const s = await api.createNeta({ kind: "section", title: "新しい曲" });
    await reload();
    setEditing(s); // 配置メインペーン（SectionEditor）を直接開く
  }

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
    const query = q.trim();
    if (!query) {
      setItems(await api.listNeta({ kind: kindFilter || undefined }));
      return;
    }
    try {
      setItems(await api.searchSemantic(query)); // 意味検索
    } catch {
      // 検索サービス不通なら LIKE 絞り込みに退避（出先/オフラインで無音にしない）
      setItems(await api.listNeta({ q: query }));
    }
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

  // 受け取りトレイの通知バッジ＋一覧の自動更新（reap されたネタを出す）
  const lastDone = useRef(-1);
  useEffect(() => {
    const tick = () => {
      void api
        .listJobs({ status: "done" })
        .then((js) => {
          const seen = Number(localStorage.getItem("cm-tray-seen") ?? 0);
          setDoneCount(js.filter((j) => new Date(j.created ?? 0).getTime() > seen).length);
          // 新しく完了したジョブ（裏で reap されたネタ含む）があれば一覧を再読込
          if (lastDone.current >= 0 && js.length > lastDone.current) void reload();
          lastDone.current = js.length;
        })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
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
          <button className="import-btn" onClick={() => void newSong()}>
            ＋曲を組む
          </button>
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
          <button className="gear" aria-label="tray" title="受け取りトレイ" onClick={openTray}>
            📥{doneCount > 0 && <span className="badge">{doneCount}</span>}
          </button>
          <button className="gear" aria-label="chat" title="相談（Chat）" onClick={() => openChat()}>
            💬
          </button>
          <button
            className="gear"
            aria-label="settings"
            title="設定"
            onClick={() => setSettingsOpen(true)}
          >
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
          disabled={!!q.trim()}
          title={q.trim() ? "検索中は種類フィルタは無効" : "種類で絞る"}
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
      {editing && (
        <NetaDialog
          neta={editing}
          onClose={() => setEditing(null)}
          onChanged={() => void reload()}
        />
      )}
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
