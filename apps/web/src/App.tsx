import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { api, type Neta } from "./api";
import { KIND_LABEL } from "./kinds";
import { applyColors, loadColors } from "./theme";
import { KindIcon } from "./components/KindIcon";
import { Icon } from "./components/Icon";
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
// アプリ表示名（ヘッダ左のロゴ）。リポジトリ名(sketch-it)とは別。「音メモ＝手早く音を出してメモ」。
const APP_NAME = "Otomemo";
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
  // ピッカーのチップ件数（P1）＝すべて/未仕分け/器別。
  const [counts, setCounts] = useState<{
    all: number;
    unassigned: number;
    projects: { name: string; count: number }[];
  }>({ all: 0, unassigned: 0, projects: [] });
  const [unassignedOnly, setUnassignedOnly] = useState(false); // 未仕分け(prj:無し)だけ表示（P4）
  const [kindFilter, setKindFilter] = useState("");
  const [moodFilter, setMoodFilter] = useState("");
  const [q, setQ] = useState("");
  const [searchDegraded, setSearchDegraded] = useState(false); // cm-search 不通＝意味検索が効かず keyword-only
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [gearMode, setGearMode] = useState(false); // ④ 機材相談（全曲共通のグローバルチャット）
  const [chatTarget, setChatTarget] = useState<Neta | undefined>(undefined);
  const [trayOpen, setTrayOpen] = useState(false);
  const [projectView, setProjectView] = useState(false); // メインペーンにプロジェクト画面を出す
  const [fromProject, setFromProject] = useState(false); // プロジェクト画面からネタを開いた＝閉じたら画面へ戻す
  const [chatSeed, setChatSeed] = useState(""); // Chatを開くときの最初の一言（プロジェクト画面の起点入力から）
  const [doneCount, setDoneCount] = useState(0);
  const [active, setActive] = useState<Neta | null>(null);
  // Section から子ネタへ潜った履歴（← 戻るで親 Section に戻す）。トップ階層の open は空にする。
  const [navStack, setNavStack] = useState<Neta[]>([]);
  // トップ階層で開く（一覧/Chat/プロジェクト）＝履歴をリセット。
  const openTop = (n: Neta) => {
    setNavStack([]);
    setActive(n);
  };
  // 潜る（Section のブロックから子ネタへ）＝今の active を積んでから開く。
  const drillNeta = (n: Neta) => {
    setNavStack((s) => (active ? [...s, active] : s));
    setActive(n);
  };
  const [railOpen, setRailOpen] = useState(true);
  const isMobile = useIsMobile();
  const [composeSignal, setComposeSignal] = useState(0); // D&D配置でSectionEditorを再読込

  // ドラッグは5px動かしてから開始＝カードのクリック(開く)と両立（#52②c）
  // PC=5pxで即ドラッグ。スマホ=長押し(250ms)で掴む＝タップ再生/カードを開くとの誤爆回避。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

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
    api
      .getProjectCounts()
      .then(setCounts)
      .catch(() => {});
  }, []);

  // 新規ネタに付けるプロジェクトタグ（アクティブが無ければ無し）。create サイト共通。
  const projectTags = activeProject ? [projectTag(activeProject)] : [];

  async function onDragEnd(e: DragEndEvent) {
    const dragged = e.active.data.current?.neta as Neta | undefined;
    const drop = e.over?.data.current as { kinds?: readonly string[]; position?: number; row?: number } | undefined;
    // (1) レーンへのドロップ＝セクションに配置（従来）。
    if (drop?.kinds && drop.position !== undefined) {
      if (!dragged) return;
      if (!active || (active.kind !== "section" && active.kind !== "song")) return; // 開いてるのがsectionの時だけ
      if (!drop.kinds.includes(dragged.kind)) return; // レーンのkindに合わなければ無視
      await api.placeChild(active.id, dragged.id, drop.position, drop.row ?? 0); // ② コード楽器2レーンは row を ord に
      setComposeSignal((v) => v + 1);
      void reload();
      return;
    }
    // (2) 一覧内の並べ替え＝別カードにドロップ（reorderable の時だけ・sortDisabled で他は掴めない）。
    const overId = e.over?.id;
    if (reorderable && overId && e.active.id !== overId) {
      const oldI = items.findIndex((n) => n.id === e.active.id);
      const newI = items.findIndex((n) => n.id === overId);
      if (oldI < 0 || newI < 0) return;
      const next = arrayMove(items, oldI, newI);
      setItems(next); // 楽観更新＝すぐ並ぶ
      await api.reorderNeta(activeProject, next.map((n) => n.id)).catch(() => void reload());
    }
  }

  async function newSong() {
    // #5 「＋曲を組む」＝kind=song（section を並べる編成）。宣言済み階層 Project⊃Song⊃section⊃leaf。
    const s = await api.createNeta({ kind: "song", title: "新しい曲", tags: projectTags });
    await reload();
    setActive(s); // メインペーンで開く
  }
  // 音楽ネタの新規＝空で作ってエディタ直行（放り込むから分離・2026-07-02）。
  async function createBlank(kind: string, title: string) {
    const n = await api.createNeta({ kind, title, tags: projectTags });
    await reload();
    setActive(n);
  }

  // #46: mood でのクライアント側絞り込み（取得済みリストに対して）
  const shownItems = moodFilter.trim()
    ? items.filter((n) => (n.mood ?? "").toLowerCase().includes(moodFilter.trim().toLowerCase()))
    : items;

  // 手動並べ替えが効くのは「素のプロジェクト一覧」だけ＝検索/種別/mood 絞り込み中は無効
  // （部分集合を並べ替えると position が疎になり混乱する）。この時 items===表示順で楽観更新が安全。
  const reorderable =
    scope === "project" && !unassignedOnly && !q.trim() && !kindFilter && !moodFilter.trim();

  // #10: 過去資産の一括取込（複数ファイル）
  // #81 MIDIはworker(mido)でトラック×チャンネル分割→melody/rhythmネタ化。
  // base64でジョブに載せ、workerが分割→reaperがネタ化。jobのdoneを待って一覧へ反映。
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false); // 取込ボタン群を畳む（既定=閉）
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
    setGearMode(false);
    setChatTarget(target);
    setChatSeed(seed);
    setChatOpen(true);
  };
  // ④ 機材相談＝器に紐づかない全曲共通のグローバルチャット（ヘッダ🎛️）。
  const openGear = () => {
    setGearMode(true);
    setChatTarget(undefined);
    setChatSeed("");
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
  async function newProject() {
    const name = window.prompt("新しいプロジェクト名")?.trim();
    if (!name) return;
    // P2: 作成を永続化（setProject）＝空の器でもリロードで消えない（旧 prompt はローカルのみで揮発）。
    await api.setProject(name, {}).catch(() => {});
    setProjects((ps) => (ps.includes(name) ? ps : [...ps, name]));
    setScope("project");
    setUnassignedOnly(false);
    setActiveProject(name);
    loadProjects();
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

  // チップ列で選択中(.on)が端に隠れないよう可視域へ（レビュー M-4）。
  const chipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chipsRef.current?.querySelector(".proj-chip.on");
    try {
      el?.scrollIntoView({ block: "nearest", inline: "center" });
    } catch {
      /* jsdom 等 scrollIntoView 未実装環境では無視 */
    }
  }, [scope, activeProject, unassignedOnly]);

  const reloadSeq = useRef(0);
  const reload = useCallback(async () => {
    // レース対策：複数の reload が並走し得る（初期ロード↔検索入力）。遅い旧結果が速い新結果を
    // 後から上書きしないよう、最新シーケンスの結果だけ採用する（検索が全件表示に戻る不具合の修正）。
    const seq = ++reloadSeq.current;
    const put = (items: (Neta & { matchType?: string })[]) => {
      if (seq === reloadSeq.current) setItems(items);
    };
    const putDegraded = (d: boolean) => {
      if (seq === reloadSeq.current) setSearchDegraded(d);
    };
    putDegraded(false); // 既定＝劣化なし（検索経路のみ true になり得る）
    const query = q.trim();
    // ライブラリ＝連想元コーパスの閲覧（filter のみ・意味検索は project 側）。
    if (scope === "library") {
      put(
        await api.listNeta({ scope: "library", kind: kindFilter || undefined, q: query || undefined, limit: 2000 }),
      );
      return;
    }
    if (!query) {
      // 未仕分け（P4）＝どの器にも属さないネタだけ。器の絞り込みとは排他。
      if (unassignedOnly) {
        put(await api.listNeta({ kind: kindFilter || undefined, unassigned: true }));
        return;
      }
      // project ブラウズ：アクティブプロジェクトがあれば prj: タグでAND絞り込み（横断は検索経路）。
      put(
        await api.listNeta({
          kind: kindFilter || undefined,
          tags: activeProject ? [projectTag(activeProject)] : undefined,
          orderProject: activeProject, // 手動並べ替え(neta_order)を適用。'' は未指定バケツ。
        }),
      );
      return;
    }
    try {
      const r = await api.search(query); // #65 ハイブリッド検索（一致∪意味・該当なしが出る）
      put(r.items);
      putDegraded(!r.semanticOk); // cm-search 不通＝意味検索が効かず keyword-only（下で告知）
    } catch {
      // API自体が不通なら LIKE 絞り込みに退避（出先/オフラインで無音にしない）
      put(await api.listNeta({ q: query }));
    }
  }, [kindFilter, q, scope, activeProject, unassignedOnly]);

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
      {/* 編集中(モバイル)は app-head を隠す＝エディタの「← 戻る」があるので不要・上まで画面を使う。 */}
      {/* パンくず型ヘッダ：[ロゴ=アプリ名→ホーム] › [プロジェクト名→器画面] … [📥][⚙]。
          旧ヘッダの「☰=ホーム(意味ズレ)」「♪飾りロゴ」「🏠でホーム2重」を解消＝現在地と帰り道が明確。 */}
      {!(isMobile && active) && (
      <div className="app-head">
        {/* PC のみ：ネタ帳レールの開閉（☰=サイドバー切替はPCでは慣習的で紛れない）。モバイルはロゴ=ホームで足りる。 */}
        {!isMobile && (
          <button className="rail-toggle" aria-label="toggle-rail" title="ネタ帳の開閉" onClick={() => setRailOpen((v) => !v)}>
            ☰
          </button>
        )}
        <button
          className="app-brand"
          aria-label={APP_NAME}
          title="ホーム（ネタ帳）へ"
          onClick={() => {
            setActive(null);
            setProjectView(false);
          }}
        >
          <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true" width="22" height="22">
            {/* Otomemo ロゴ＝吹き出し(ひとこと)＋♪＝"サッと音のメモ"（C案）。 */}
            <path
              d="M5 4h13a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3h-7.5l-4 3v-3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z"
              fill="var(--accent)"
            />
            <g fill="#fff">
              <ellipse cx="9.2" cy="12" rx="1.8" ry="1.4" />
              <rect x="10.6" y="6.6" width="1.2" height="5.8" />
              <path d="M11.8 6.6c2 .5 2.7 1.7 2.2 3.2-.3-.9-1.1-1.4-2.2-1.5z" />
            </g>
          </svg>
          <span className="brand-name">{APP_NAME}</span>
        </button>
        {activeProject && (
          <button
            className={"app-crumb" + (projectView ? " on" : "")}
            aria-label="project-home"
            title={`${activeProject} のプロジェクト画面（曲・ファイル・会話）`}
            onClick={() => {
              setActive(null);
              setProjectView(true);
            }}
          >
            <span className="crumb-sep" aria-hidden="true">›</span>
            <span className="crumb-project">{activeProject}</span>
          </button>
        )}
        <div className="head-right">
          <button className="gear" aria-label="gear-chat" title="機材の相談（全曲共通）" onClick={openGear}>
            <Icon name="sliders" />
          </button>
          <button className="gear" aria-label="tray" title="受け取りトレイ" onClick={openTray}>
            <Icon name="inbox" />
            {doneCount > 0 && <span className="badge">{doneCount}</span>}
          </button>
          <button
            className="gear"
            aria-label="settings"
            title="設定"
            onClick={() => setSettingsOpen(true)}
          >
            <Icon name="gear" />
          </button>
        </div>
      </div>
      )}
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
          {/* 作成タイル＝グループ分け（案A・2026-07-04）＝パーツ/組み立て・文字/取込。
              section と song を別タイルに分離＝「パーツを組む1ブロック(section)」と「並べる(song)」の混乱を解消。
              組み立てと文字は同じ行(4枚)に（オーナー）。放り込むフォームは撤去（雑な捕獲はチャット）。 */}
          <div className="create-tiles">
            {(() => {
              const tile = ([k, label, title, col]: readonly [string, string, string, string]) => (
                <button
                  key={k}
                  className="create-tile"
                  style={{ ["--k" as string]: col }}
                  onClick={() => (k === "song" ? void newSong() : void createBlank(k, title))}
                >
                  <KindIcon kind={k} />
                  <span>＋{label}</span>
                </button>
              );
              const PARTS = [
                ["melody", "メロ", "新しいメロ", "var(--k-melody)"],
                ["chord_progression", "コード", "新しいコード進行", "var(--k-chord)"],
                ["bass", "ベース", "新しいベース", "var(--k-bass)"],
                ["rhythm", "リズム", "新しいリズム", "var(--k-rhythm)"],
                ["chord_pattern", "コード楽器", "新しいコード楽器", "var(--k-chord)"],
              ] as const;
              const BUILD_TEXT = [
                ["section", "セクション", "新しいセクション", "var(--k-section)"],
                ["song", "曲", "", "var(--k-song)"],
                ["lyric", "歌詞", "新しい歌詞", "var(--k-lyric)"],
                ["theme", "テーマ", "新しいテーマ", "var(--k-theme)"],
              ] as const;
              // グループ見出し(パーツ/組み立て/文字)は撤去＝ラベルはタイル自身が持つので冗長(オーナー)。
              // 行のまとまり(パーツ5列 / 組み立て・文字4列)だけで種別のグループは伝わる。
              return (
                <>
                  <div className="ct-row ct-parts">{PARTS.map(tile)}</div>
                  <div className="ct-row ct-buildtext">{BUILD_TEXT.map(tile)}</div>
                </>
              );
            })()}
            <button
              className={"create-tile import-tile" + (importOpen ? " on" : "")}
              aria-label="toggle-import"
              aria-expanded={importOpen}
              style={{ ["--k" as string]: "var(--muted)" }}
              onClick={() => setImportOpen((v) => !v)}
            >
              <Icon name="inbox" size={22} />
              <span>取込 {importOpen ? "▲" : "▾"}</span>
            </button>
          </div>
          {importOpen && (
          <div className="notebook-actions">
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
          )}
          {/* 案1：スコープ＋器を1行に統合。すべて/未仕分け/器＝作業ネタの絞り込み、区切りの先の
              「ライブラリ」＝連想元の参考素材（別の場所・全プロジェクト共有）。 */}
          <div className="project-picker proj-chips" role="tablist" aria-label="scope" ref={chipsRef}>
              <button
                role="tab"
                aria-selected={scope === "project" && !unassignedOnly && !activeProject}
                className={"proj-chip" + (scope === "project" && !unassignedOnly && !activeProject ? " on" : "")}
                onClick={() => {
                  setScope("project");
                  setUnassignedOnly(false);
                  setActiveProject("");
                }}
              >
                すべて <span className="chip-n">{counts.all}</span>
              </button>
              <button
                role="tab"
                aria-selected={scope === "project" && unassignedOnly}
                className={"proj-chip" + (scope === "project" && unassignedOnly ? " on" : "")}
                title="どの器にも入れていないネタ"
                onClick={() => {
                  setScope("project");
                  setUnassignedOnly(true);
                  setActiveProject("");
                }}
              >
                未仕分け <span className="chip-n">{counts.unassigned}</span>
              </button>
              {counts.projects.map((p) => (
                <button
                  key={p.name}
                  role="tab"
                  aria-selected={scope === "project" && !unassignedOnly && activeProject === p.name}
                  className={"proj-chip" + (scope === "project" && !unassignedOnly && activeProject === p.name ? " on" : "")}
                  onClick={() => {
                    setScope("project");
                    setUnassignedOnly(false);
                    setActiveProject(p.name);
                  }}
                >
                  {p.name} <span className="chip-n">{p.count}</span>
                </button>
              ))}
              <button
                className="proj-chip add"
                aria-label="new-project"
                title="新しい器を作る"
                onClick={() => void newProject()}
              >
                ＋
              </button>
              <span className="proj-divider" aria-hidden="true" />
              <button
                role="tab"
                aria-label="scope-library"
                aria-selected={scope === "library"}
                className={"proj-chip lib" + (scope === "library" ? " on" : "")}
                title="ライブラリ＝連想元の参考素材（全プロジェクト共有）"
                onClick={() => setScope("library")}
              >
                <Icon name="library" size={15} /> ライブラリ
              </button>
          </div>
          {/* 検索を主役に。種別の絞り込みは「作成タイルと同じ絵・同じ順」を常時1行（種別色・ラベル無し）。
              開閉トグルは廃止＝常に見えて分かりやすい。順は作成と一致：パーツ→組み立て→文字。 */}
          <div className="filters">
            <input
              className="search-main"
              aria-label="search"
              placeholder="検索…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {searchDegraded && q.trim() && (
            // フェイルサイレント解消：意味検索(cm-search)不通時は黙って劣化せず、キーワードのみと明示。
            <div className="search-degraded" aria-label="search-degraded">
              ⚠ 意味検索が使えません。キーワード一致のみで検索中（「近い」候補は出ません）
            </div>
          )}
          <div className="filter-kinds" role="group" aria-label="kind-filter">
            {(
              [
                // 作成タイルと同じ順：パーツ(メロ/コード/ベース/リズム/コード楽器)→組み立て(セクション/曲)→文字(歌詞/テーマ)。
                ["melody", "var(--k-melody)"],
                ["chord_progression", "var(--k-chord)"],
                ["bass", "var(--k-bass)"],
                ["rhythm", "var(--k-rhythm)"],
                ["chord_pattern", "var(--k-chord)"],
                ["section", "var(--k-section)"],
                ["song", "var(--k-song)"],
                ["lyric", "var(--k-lyric)"],
                ["theme", "var(--k-theme)"],
              ] as const
            ).map(([k, col]) => (
              <button
                key={k}
                type="button"
                className={"filter-kind" + (kindFilter === k ? " on" : "")}
                style={{ ["--k" as string]: col }}
                aria-label={`kind-filter-${k}`}
                aria-pressed={kindFilter === k}
                disabled={!!q.trim()}
                title={q.trim() ? "検索中は種別フィルタは無効" : `${KIND_LABEL[k] ?? k}で絞る`}
                onClick={() => setKindFilter(kindFilter === k ? "" : k)}
              >
                <KindIcon kind={k} />
              </button>
            ))}
          </div>
          <input
            className="mood-filter-input"
            aria-label="mood-filter"
            placeholder="mood で絞る…"
            value={moodFilter}
            onChange={(e) => setMoodFilter(e.target.value)}
          />
          <NetaList
            items={shownItems}
            scope={scope}
            reorderable={reorderable}
            projects={projects}
            onChanged={() => void reload()}
            onChat={openChat}
            onOpen={openTop}
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
                openTop(n);
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
              onDeleted={() => {
                // 器を消したらホーム(すべて)へ戻り、器チップ一覧と本文を更新。
                setProjectView(false);
                setActiveProject("");
                loadProjects();
                void reload();
              }}
            />
          ) : active ? (
            <NetaDialog
              key={active.id} /* ネタを切り替えたら作り直して内部状態を新ネタで初期化 */
              neta={active}
              reloadSignal={composeSignal}
              onOpenNeta={drillNeta} /* Section のブロックタップ→子ネタへ潜る */
              onClose={() => {
                if (navStack.length) {
                  // 潜っている途中＝親 Section に戻る（一覧に落とさない）。
                  // navStack の親は drill 時のスナップショット＝stale なことがある（新規曲の meter/bars/title 巻き戻り・
                  // DB上書きの原因）。最新を再フェッチして setActive＝古い値での再初期化を防ぐ（評価バグ②）。
                  const parent = navStack[navStack.length - 1]!;
                  setNavStack(navStack.slice(0, -1));
                  void api.getNeta(parent.id).then((fresh) => setActive(fresh ?? parent)).catch(() => setActive(parent));
                  return;
                }
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
          <Icon name="chat" size={24} />
        </button>
      )}
      {chatOpen && (
        <Chat
          target={chatTarget}
          gear={gearMode} // ④ 機材モード（全曲共通）
          activeProject={gearMode ? undefined : activeProject || undefined} // 機材は器に束ねない
          projectInstructions={gearMode ? undefined : projectInstructions} // 器の指示が効いている実感バナー用
          initialText={chatSeed} // プロジェクト画面の起点入力からの最初の一言
          onClose={() => {
            setChatOpen(false);
            setChatTarget(undefined);
            setGearMode(false);
          }}
          onChanged={() => void reload()}
          onOpenNeta={(n) => openTop(n)} // #68 Chatからネタを開く
        />
      )}
      {trayOpen && (
        <Tray
          onClose={() => setTrayOpen(false)}
          onOpenNeta={(n) => {
            setTrayOpen(false);
            openTop(n); // できたネタを開く
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
