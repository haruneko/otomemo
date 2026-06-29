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
import { FILTER_KINDS, MUSIC_KINDS, CONTAINER_KINDS } from "./kinds";
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
import { ProjectScreen } from "./components/ProjectScreen";
import { flushOutbox } from "./outbox";
import { projectTag } from "./project";

const ACTIVE_PROJECT_KEY = "cm-active-project";


// モバイル土台：狭い画面か（≤820px、base.css のブレークポイントと一致）。リサイズ追従。
const MOBILE_MQ = "(max-width: 820px)";
function useIsMobile(): boolean {
  const has = typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [m, setM] = useState(() => has && window.matchMedia(MOBILE_MQ).matches);
  useEffect(() => {
    if (!has) return; // jsdom 等 matchMedia 無し＝デスクトップ既定
    const mq = window.matchMedia(MOBILE_MQ);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [has]);
  return m;
}

export function App() {
  const [items, setItems] = useState<(Neta & { matchType?: string })[]>([]);
  const [scope, setScope] = useState<"project" | "library">("project"); // プロジェクト/ライブラリ タブ
  // 複数プロジェクト：アクティブプロジェクト名（""＝すべて）。クライアント状態＝localStorageに永続。
  const [activeProject, setActiveProject] = useState<string>(
    () => localStorage.getItem(ACTIVE_PROJECT_KEY) ?? "",
  );
  const [projects, setProjects] = useState<string[]>([]); // facets() 由来のプロジェクト名一覧
  const [kindFilter, setKindFilter] = useState("");
  const [moodFilter, setMoodFilter] = useState("");
  const [q, setQ] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<Neta | undefined>(undefined);
  const [trayOpen, setTrayOpen] = useState(false);
  const [projectView, setProjectView] = useState(false); // メインペーンにプロジェクト画面を出す
  const [fromProject, setFromProject] = useState(false); // プロジェクト画面からネタを開いた＝閉じたら画面へ戻す
  const [chatSeed, setChatSeed] = useState(""); // Chatを開くときの最初の一言（プロジェクト画面の起点入力から）
  const [doneCount, setDoneCount] = useState(0);
  const [active, setActive] = useState<Neta | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const isMobile = useIsMobile();
  const [composeSignal, setComposeSignal] = useState(0); // D&D配置でSectionEditorを再読込

  // ドラッグは5px動かしてから開始＝カードのクリック(開く)と両立（#52②c）
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // アクティブプロジェクトの永続化（端末ローカル状態）。
  useEffect(() => {
    if (activeProject) localStorage.setItem(ACTIVE_PROJECT_KEY, activeProject);
    else localStorage.removeItem(ACTIVE_PROJECT_KEY);
  }, [activeProject]);

  // 器のAIへの指示（Chatに「効いている実感」を出す＋将来の文脈に使う）。器が変われば取り直す。
  const [projectInstructions, setProjectInstructions] = useState("");
  useEffect(() => {
    if (!activeProject) return setProjectInstructions("");
    let alive = true;
    void api
      .getProject(activeProject)
      .then((p) => alive && setProjectInstructions(p.instructions ?? ""))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [activeProject]);

  // プロジェクト一覧（prj:タグ ∪ project行＝説明だけ作った空の器も拾う）。reload時に追従。
  const loadProjects = useCallback(() => {
    api
      .listProjectNames()
      .then((names) => setProjects(names))
      .catch(() => {});
  }, []);

  // 新規ネタに付けるプロジェクトタグ（アクティブが無ければ無し）。create サイト共通。
  const projectTags = activeProject ? [projectTag(activeProject)] : [];

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
    const s = await api.createNeta({ kind: "section", title: "新しい曲", tags: projectTags });
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
              tags: projectTags,
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
      for (const p of parts) await api.createNeta({ kind: "lyric", text: p, tags: projectTags });
    }
    await reload();
  }

  const openChat = (target?: Neta, seed = "") => {
    setChatTarget(target);
    setChatSeed(seed);
    setChatOpen(true);
  };

  // プロジェクト画面の「新しい会話を始める」：器に属す新規セッションを開く。器への束ねは
  // 最初の発言時に遅延（Chat.pushMsg）＝送らずに閉じても空会話が残らない。seed を載せて開く。
  function startProjectChat(seed: string) {
    if (!activeProject) return;
    const id = "chat:" + (crypto.randomUUID?.() ?? Date.now().toString(36));
    localStorage.setItem("cm-chat-session", id);
    openChat(undefined, seed);
  }

  // ＋新規プロジェクト：名前を取り、アクティブにする（以降の新規ネタに prj: が付く）。
  // 実体はネタに prj: が付いた時点で facets に現れる＝ここでは選択肢にも即時反映しておく。
  function newProject() {
    const name = window.prompt("新しいプロジェクト名")?.trim();
    if (!name) return;
    setProjects((ps) => (ps.includes(name) ? ps : [...ps, name]));
    setActiveProject(name);
  }

  function openTray() {
    setTrayOpen(true);
    localStorage.setItem("cm-tray-seen", String(Date.now()));
    setDoneCount(0);
  }

  useEffect(() => {
    applyColors(loadColors());
    // #55a/#55c 選択中SoundFontを再生に反映（設定を開かなくても効く）。消えた/古いidは最新へ自己修復。
    // #84 先読みは **画面ロード時**に実行（SF2の fetch/decode は suspended ctx で可能＝gesture 不要）。
    // URL は initSoundFont で非同期確定するので、その後に温める＝初回再生はもう warm。冪等。
    void initSoundFont().then(() => void prewarmSoundFont());
    // 念のためのリトライ網（ロード時に URL 未取得/失敗でも、最初の操作で温め直す。冪等＝成功後no-op）。
    const onFirst = () => void prewarmSoundFont();
    window.addEventListener("pointerdown", onFirst);
    return () => window.removeEventListener("pointerdown", onFirst);
  }, []);

  const reload = useCallback(async () => {
    const query = q.trim();
    // ライブラリ＝連想元コーパスの閲覧（filter のみ・意味検索は project 側）。
    if (scope === "library") {
      setItems(
        await api.listNeta({ scope: "library", kind: kindFilter || undefined, q: query || undefined, limit: 2000 }),
      );
      return;
    }
    if (!query) {
      // project ブラウズ：アクティブプロジェクトがあれば prj: タグでAND絞り込み（横断は検索経路）。
      setItems(
        await api.listNeta({
          kind: kindFilter || undefined,
          tags: activeProject ? [projectTag(activeProject)] : undefined,
        }),
      );
      return;
    }
    try {
      setItems(await api.search(query)); // #65 ハイブリッド検索（一致∪意味・該当なしが出る）
    } catch {
      // API自体が不通なら LIKE 絞り込みに退避（出先/オフラインで無音にしない）
      setItems(await api.listNeta({ q: query }));
    }
  }, [kindFilter, q, scope, activeProject]);

  useEffect(() => {
    reload().catch(() => {});
    loadProjects(); // 新規プロジェクトのネタができたら一覧(facets)に追従
  }, [reload, loadProjects]);

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
          title={isMobile ? "ネタ帳へ" : "ネタ帳の開閉"}
          onClick={() => {
            // モバイル＝一画面ずつ：☰ はホーム(ネタ帳)へ戻る。PC＝レールの開閉。
            if (isMobile) {
              setActive(null);
              setProjectView(false);
            } else setRailOpen((v) => !v);
          }}
        >
          ☰
        </button>
        <h1 className="logo" aria-label="creative_manager" title="creative_manager">
          ♪
        </h1>
        <div className="head-right">
          {activeProject && (
            <button
              className={"gear" + (projectView ? " on" : "")}
              aria-label="project-home"
              title={`${activeProject} のプロジェクト画面（曲・ファイル・会話）`}
              onClick={() => {
                // モバイル土台＝一画面ずつ：projectView で mainpane が主役になる（レール畳みの応急処置は不要に）。
                setActive(null);
                setProjectView(true);
              }}
            >
              🏠
            </button>
          )}
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
        <div
          className={
            "workspace" +
            // モバイルは一画面ずつ：mainpane が主役(編集 or プロジェクト)なら mv-pane、でなければ mv-home。
            (isMobile ? (active || (projectView && activeProject) ? " mv-pane" : " mv-home") : "")
          }
        >
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
          <Capture
            activeProject={activeProject}
            onCreated={(n) => {
              void reload();
              // 音楽/コンテナ kind は中身が空＝そのままエディタを開く（再タップ不要・スマホUX）。
              if (MUSIC_KINDS.includes(n.kind) || CONTAINER_KINDS.includes(n.kind)) setActive(n);
            }}
          />
          <div className="scope-tabs" role="tablist" aria-label="scope">
            <button
              role="tab"
              aria-label="scope-project"
              className={scope === "project" ? "on" : ""}
              onClick={() => setScope("project")}
            >
              プロジェクト
            </button>
            <button
              role="tab"
              aria-label="scope-library"
              className={scope === "library" ? "on" : ""}
              onClick={() => setScope("library")}
            >
              ライブラリ（連想元）
            </button>
          </div>
          {/* プロジェクト・ピッカー：project スコープ時のみ（library は全プロジェクト共有）。 */}
          {scope === "project" && (
            <div className="project-picker">
              <select
                aria-label="project"
                value={activeProject}
                onChange={(e) => setActiveProject(e.target.value)}
              >
                <option value="">すべて</option>
                {projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button className="import-btn" onClick={newProject}>
                ＋新規
              </button>
            </div>
          )}
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
            scope={scope}
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
          {projectView && activeProject ? (
            <ProjectScreen
              project={activeProject}
              onOpenNeta={(n) => {
                setProjectView(false);
                setFromProject(true); // 閉じたらプロジェクト画面へ戻す（特にSPで空ペーンに落ちない）
                setActive(n);
              }}
              onOpenSession={(thread) => {
                localStorage.setItem("cm-chat-session", thread);
                openChat();
              }}
              onStartChat={(seed) => startProjectChat(seed)}
              onCreateSong={() => {
                setFromProject(true); // 組み終えて閉じたら器へ戻る
                setProjectView(false);
                void newSong();
              }}
            />
          ) : active ? (
            <NetaDialog
              key={active.id} /* ネタを切り替えたら作り直して内部状態を新ネタで初期化 */
              neta={active}
              reloadSignal={composeSignal}
              onClose={() => {
                setActive(null);
                if (fromProject) {
                  setProjectView(true); // プロジェクト画面から開いたネタ＝閉じたら器へ戻る
                  setFromProject(false);
                }
              }}
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
          activeProject={activeProject || undefined} // 器＝一曲(or組曲)：新規会話をこの器に束ね一覧も絞る
          projectInstructions={projectInstructions} // 器の指示が効いている実感バナー用
          initialText={chatSeed} // プロジェクト画面の起点入力からの最初の一言
          onClose={() => {
            setChatOpen(false);
            setChatTarget(undefined);
          }}
          onChanged={() => void reload()}
          onOpenNeta={(n) => setActive(n)} // #68 Chatからネタを開く
        />
      )}
      {trayOpen && (
        <Tray
          onClose={() => setTrayOpen(false)}
          onOpenNeta={(n) => {
            setTrayOpen(false);
            setActive(n); // できたネタを開く
          }}
          onOpenChat={(targetId) => {
            setTrayOpen(false);
            if (targetId) void api.getNeta(targetId).then((n) => openChat(n ?? undefined)).catch(() => openChat());
            else openChat();
          }}
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
            <SoundFontSettings />
          </div>
        </div>
      )}
    </main>
  );
}
