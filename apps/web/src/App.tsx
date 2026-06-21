import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { api, type Neta } from "./api";
import { applyColors, loadColors } from "./theme";
import { Capture } from "./components/Capture";
import { NetaList } from "./components/NetaList";
import { NetaDialog } from "./components/NetaDialog";
import { ThemeSettings } from "./settings/ThemeSettings";
import { SoundFontSettings, initSoundFont } from "./settings/SoundFontSettings";
import { prewarmSoundFont } from "./music";
import { parseMusicXml } from "./musicxml";
import { HummingRecorder } from "./components/HummingRecorder";
import { Chat } from "./components/Chat";
import { Tray } from "./components/Tray";
import { flushOutbox } from "./outbox";

const FILTER_KINDS = [
  "lyric",
  "melody",
  "bass",
  "chord",
  "chord_progression",
  "rhythm",
  "theme",
  "section",
  "song",
  "reference",
  "knowledge",
];

export function App() {
  const [items, setItems] = useState<(Neta & { matchType?: string })[]>([]);
  const [kindFilter, setKindFilter] = useState("");
  const [moodFilter, setMoodFilter] = useState("");
  const [q, setQ] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<Neta | undefined>(undefined);
  const [trayOpen, setTrayOpen] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [active, setActive] = useState<Neta | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const [composeSignal, setComposeSignal] = useState(0); // D&D配置でSectionEditorを再読込

  // ドラッグは5px動かしてから開始＝カードのクリック(開く)と両立（#52②c）
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function onDragEnd(e: DragEndEvent) {
    const dragged = e.active.data.current?.neta as Neta | undefined;
    const drop = e.over?.data.current as { kinds?: readonly string[]; position?: number } | undefined;
    if (!dragged || !drop?.kinds || drop.position === undefined) return;
    if (!active || (active.kind !== "section" && active.kind !== "song")) return; // 開いてるのがsectionの時だけ
    if (!drop.kinds.includes(dragged.kind)) return; // レーンのkindに合わなければ無視
    await api.placeChild(active.id, dragged.id, drop.position, 0);
    setComposeSignal((v) => v + 1);
    void reload();
  }

  async function newSong() {
    const s = await api.createNeta({ kind: "section", title: "新しい曲" });
    await reload();
    setActive(s); // メインペーンで開く
  }

  // #46: mood でのクライアント側絞り込み（取得済みリストに対して）
  const shownItems = moodFilter.trim()
    ? items.filter((n) => (n.mood ?? "").toLowerCase().includes(moodFilter.trim().toLowerCase()))
    : items;

  // #10: 過去資産の一括取込（複数ファイル）
  // #81 MIDIはworker(mido)でトラック×チャンネル分割→melody/rhythmネタ化。
  // base64でジョブに載せ、workerが分割→reaperがネタ化。jobのdoneを待って一覧へ反映。
  const [importing, setImporting] = useState(false);
  async function importMidi(files: FileList | null) {
    if (!files) return;
    setImporting(true);
    try {
      const ids: string[] = [];
      for (const file of Array.from(files)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        for (const b of bytes) bin += String.fromCharCode(b);
        const job = await api.createJob({
          intent: "import_midi",
          params: { midi_b64: btoa(bin), filename: file.name },
        });
        ids.push(job.id);
      }
      // 分割→reaper反映を待つ（mido は速い・reaperは5s間隔）。最大~12s、毎秒reload。
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        await reload();
        const st = await Promise.all(
          ids.map((id) => api.getJob(id).then((j) => j.status).catch(() => "")),
        );
        if (st.every((s) => s === "done" || s === "failed")) {
          await new Promise((r) => setTimeout(r, 600));
          await reload();
          break;
        }
      }
    } finally {
      setImporting(false);
    }
  }
  // #56 楽譜(MusicXML)取込：ローカルで解析→melodyネタ化（worker不要）。
  async function importScore(files: FileList | null) {
    if (!files) return;
    setImporting(true);
    try {
      for (const file of Array.from(files)) {
        try {
          const notes = parseMusicXml(await file.text());
          if (notes.length) {
            await api.createNeta({
              kind: "melody",
              title: file.name.replace(/\.(musicxml|xml)$/i, ""),
              content: { notes },
            });
          }
        } catch {
          /* 1ファイルの失敗で全体を止めない */
        }
      }
      await reload();
    } finally {
      setImporting(false);
    }
  }
  async function importLyrics(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const parts = (await file.text())
        .split(/\n\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const p of parts) await api.createNeta({ kind: "lyric", text: p });
    }
    await reload();
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
    // #55a/#55c 選択中SoundFontを再生に反映（設定を開かなくても効く）。
    // 消えた/古いidは最新へ自己修復（永久フォールバック防止）。
    void initSoundFont();
    // #84 最初のユーザー操作で旋律＋標準ドラムを裏で先読み＝初回再生の885ms待ちを解消。
    // 冪等（成功後はno-op）。suspended ctx でも decode/キャッシュは進む。
    const onFirst = () => void prewarmSoundFont();
    window.addEventListener("pointerdown", onFirst);
    return () => window.removeEventListener("pointerdown", onFirst);
  }, []);

  const reload = useCallback(async () => {
    const query = q.trim();
    if (!query) {
      setItems(await api.listNeta({ kind: kindFilter || undefined }));
      return;
    }
    try {
      setItems(await api.search(query)); // #65 ハイブリッド検索（一致∪意味・該当なしが出る）
    } catch {
      // API自体が不通なら LIKE 絞り込みに退避（出先/オフラインで無音にしない）
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
        <button
          className="gear"
          aria-label="toggle-rail"
          title="ネタ帳の開閉"
          onClick={() => setRailOpen((v) => !v)}
        >
          ☰
        </button>
        <h1 className="logo" aria-label="creative_manager" title="creative_manager">
          ♪
        </h1>
        <div className="head-right">
          <button className="gear" aria-label="tray" title="受け取りトレイ" onClick={openTray}>
            📥{doneCount > 0 && <span className="badge">{doneCount}</span>}
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
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragEnd={(e) => void onDragEnd(e)}
      >
        <div className="workspace">
        <aside className={"notebook" + (railOpen ? "" : " closed")} aria-label="notebook">
          <div className="notebook-actions">
            <button className="import-btn accent" onClick={() => void newSong()}>
              ＋曲を組む
            </button>
            <label className="import-btn">
              {importing ? "取り込み中…" : "MIDI取込"}
              <input
                type="file"
                accept=".mid,.midi"
                multiple
                hidden
                disabled={importing}
                onChange={async (e) => {
                  await importMidi(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="import-btn">
              楽譜取込
              <input
                type="file"
                accept=".musicxml,.xml"
                multiple
                hidden
                disabled={importing}
                onChange={async (e) => {
                  await importScore(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <HummingRecorder onCreated={() => void reload()} />
            <label className="import-btn">
              歌詞取込
              <input
                type="file"
                accept=".txt,text/plain"
                multiple
                hidden
                onChange={async (e) => {
                  await importLyrics(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
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
            <input
              aria-label="mood-filter"
              placeholder="mood で絞る…"
              value={moodFilter}
              onChange={(e) => setMoodFilter(e.target.value)}
            />
          </div>
          <NetaList
            items={shownItems}
            onChanged={() => void reload()}
            onChat={openChat}
            onOpen={setActive}
            emptyText={
              q.trim() || moodFilter.trim()
                ? `「${(q.trim() || moodFilter.trim()).slice(0, 20)}」に一致するネタはありません`
                : undefined
            }
          />
        </aside>
        <section className="mainpane" aria-label="mainpane">
          {active ? (
            <NetaDialog
              key={active.id} /* ネタを切り替えたら作り直して内部状態を新ネタで初期化 */
              neta={active}
              reloadSignal={composeSignal}
              onClose={() => setActive(null)}
              onChanged={() => void reload()}
            />
          ) : (
            <div className="mainpane-empty">
              <p className="muted">ネタを選ぶとここで編集できます。または曲を組む。</p>
              <button className="primary" onClick={() => void newSong()}>
                ＋曲を組む
              </button>
            </div>
          )}
        </section>
        </div>
      </DndContext>
      {!chatOpen && (
        <button
          className="chat-bubble"
          aria-label="chat"
          title="相談（Chat）"
          onClick={() => openChat()}
        >
          💬
        </button>
      )}
      {chatOpen && (
        <Chat
          target={chatTarget}
          onClose={() => {
            setChatOpen(false);
            setChatTarget(undefined);
          }}
          onChanged={() => void reload()}
          onOpenNeta={(n) => setActive(n)} // #68 Chatからネタを開く
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
            <SoundFontSettings />
          </div>
        </div>
      )}
    </main>
  );
}
