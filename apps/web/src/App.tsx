import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
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
import { KIND_LABEL, kindColor } from "./kinds";
import { applyColors, loadColors } from "./theme";
import { Icon } from "./components/Icon";
import { NetaList } from "./components/NetaList";
import { NetaDialog } from "./components/NetaDialog";
import { ThemeSettings } from "./settings/ThemeSettings";
import { SoundFontSettings, initSoundFont } from "./settings/SoundFontSettings";
import { prewarmSoundFont } from "./music";
import { useIsMobile } from "./useIsMobile";
import { CreateShelf, SHELF_KINDS } from "./components/CreateShelf";
import { FilterDrawer } from "./components/FilterDrawer";
import { KindTiles } from "./components/KindTiles";
import { HomeHub } from "./components/HomeHub";
// 重い二次画面は遅延ロード＝初回バンドルを軽くする（perf 耳FB 2026-07-09。Chatはreact-markdown 170KB）。
// NetaDialog(セクション/メロ編集の本体)は最頻操作なので**同梱のまま**＝開く時に取得待ちを出さない。
const AnalysisWorkbench = lazy(() => import("./components/AnalysisWorkbench").then((m) => ({ default: m.AnalysisWorkbench })));
const StudyView = lazy(() => import("./components/StudyView").then((m) => ({ default: m.StudyView })));
const Chat = lazy(() => import("./components/Chat").then((m) => ({ default: m.Chat })));
const Tray = lazy(() => import("./components/Tray").then((m) => ({ default: m.Tray })));
const ProjectScreen = lazy(() => import("./components/ProjectScreen").then((m) => ({ default: m.ProjectScreen })));
// #20 S6骨格の机：骨格ブロック→全画面の机（ベッド上で編集・レンズA/B）。二次画面＝遅延ロード。
const SkeletonDesk = lazy(() => import("./components/SkeletonDesk").then((m) => ({ default: m.SkeletonDesk })));
import type { SkeletonDeskTarget } from "./components/SkeletonDesk";
import { projectTag } from "./project";

const ACTIVE_PROJECT_KEY = "cm-active-project";
// アプリ表示名（ヘッダ左のロゴ）＝リポジトリ名 otomemo と一致。「音メモ＝手早く音を出してメモ」。
const APP_NAME = "Otomemo";

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
  // トップ再設計 S2：作る/絞るは扉の奥（ボトムシート）。既定=閉＝ファーストビューは実データが主役。
  // ※宣言は closeTop/anyOpen より前に置く必要がある（戻るガードの対象＝監査2026-07-15のバグ修正）。
  const [shelfOpen, setShelfOpen] = useState(false); // ＋作る▾ → 作成の棚（CreateShelf）
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false); // 絞る▾ → 絞り込み引き出し
  const [projectView, setProjectView] = useState(false); // メインペーンにプロジェクト画面を出す
  const [fromProject, setFromProject] = useState(false); // プロジェクト画面からネタを開いた＝閉じたら画面へ戻す
  const [chatSeed, setChatSeed] = useState(""); // Chatを開くときの最初の一言（プロジェクト画面の起点入力から）
  const [doneCount, setDoneCount] = useState(0);
  const [active, setActive] = useState<Neta | null>(null);
  // Section から子ネタへ潜った履歴（← 戻るで親 Section に戻す）。トップ階層の open は空にする。
  const [navStack, setNavStack] = useState<Neta[]>([]);
  // #20 S6骨格の机：骨格ブロック→全画面の机（active の SectionEditor の上に載る焦点）。
  const [deskTarget, setDeskTarget] = useState<SkeletonDeskTarget | null>(null);
  // 一覧(GET /neta)は巨大content(study/analysis 等)を content:null に落として初回ロードを軽くしている。
  // エディタは全文が要る(StudyView=content.common / AnalysisWorkbench=content.raw)ので、開く時に content が
  // 欠けていれば /neta/:id で取り直す。小さい music content は一覧にも載っているので追加取得は起きない。
  const ensureFullContent = async (n: Neta): Promise<Neta> =>
    n.content == null ? ((await api.getNeta(n.id).catch(() => null)) ?? n) : n;
  // トップ階層で開く（一覧/Chat/プロジェクト）＝履歴をリセット。content 欠けは全文を取り直してから開く
  // （AnalysisWorkbench は content 前提で初期化するため null で開けない）。
  const openTop = (n: Neta) => {
    setNavStack([]);
    if (n.content == null) void ensureFullContent(n).then(setActive);
    else setActive(n);
  };
  // 潜る（Section のブロックから子ネタへ）＝今の active を積んでから開く。
  const drillNeta = (n: Neta) => {
    setNavStack((s) => (active ? [...s, active] : s));
    if (n.content == null) void ensureFullContent(n).then(setActive);
    else setActive(n);
  };

  // Android/ブラウザの「戻る」で最前面の画面を1つ閉じる（アプリを抜けない）。オーバーレイ数だけ
  // history に guard を積み、popstate（戻る）で1レイヤ閉じる。UIの×で閉じた分は自前で history.back()
  // して guard を消費（trim）。優先順＝トレイ > チャット > 潜り(navStack) > 編集(active) > プロジェクト画面。
  const closeTop = (): boolean => {
    if (trayOpen) { setTrayOpen(false); return true; }
    if (chatOpen) { setChatOpen(false); setChatTarget(undefined); setGearMode(false); return true; }
    // 作る棚/絞る引き出し＝ボトムシートも1レイヤ（従来対象外で、SPの戻るがアプリを抜けるバグだった）。
    if (shelfOpen) { setShelfOpen(false); return true; }
    if (filterDrawerOpen) { setFilterDrawerOpen(false); return true; }
    if (deskTarget) { closeDesk(); return true; } // #20 S6：机を1レイヤとして戻るで閉じる（下の SectionEditor へ）
    if (navStack.length) {
      const parent = navStack[navStack.length - 1]!;
      setNavStack(navStack.slice(0, -1));
      void api.getNeta(parent.id).then((fresh) => setActive(fresh ?? parent)).catch(() => setActive(parent));
      return true;
    }
    if (active) {
      setActive(null);
      if (fromProject) { setProjectView(true); setFromProject(false); }
      return true;
    }
    if (projectView) { setProjectView(false); return true; }
    return false;
  };
  // ★単一 guard 方式（層の"数"を数えない）：オーバーレイが1つでも開いていれば guard を"1件だけ"積む。
  //   戻る(popstate)で1レイヤ閉じ、まだ開いていれば reconcile が再 arm する。数を数える旧方式は
  //   非同期オープン(newSong の await reload 中に depth が一瞬0になる)で guard がズレてアプリを早期に抜ける
  //   バグがあった（監査 BUG-1）。bool の armed にしたので瞬間的な 0→再オープンでも壊れない。
  const anyOpen =
    trayOpen || chatOpen || shelfOpen || filterDrawerOpen ||
    !!deskTarget || navStack.length > 0 || !!active || projectView;
  const anyOpenRef = useRef(false); anyOpenRef.current = anyOpen;
  const closeTopRef = useRef(closeTop); closeTopRef.current = closeTop;
  const armedRef = useRef(false); // guard を1件積んでいるか
  const skipRef = useRef(0);      // 自前 history.back() の保留分（その popstate は閉じずに消費）
  useEffect(() => {
    const onPop = () => {
      if (skipRef.current > 0) { skipRef.current -= 1; return; } // 自前の戻し＝消費のみ
      armedRef.current = false; // ユーザーの戻る＝guard1件が消費された
      if (anyOpenRef.current) closeTopRef.current(); // 1レイヤ閉じる（まだ開いていれば下の effect が再 arm）
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // ★毎レンダで reconcile（ref ガードで冪等）。[anyOpen] 依存だと closeTop が active→projectView へ
  //   すり替えて anyOpen が true のまま変わらない時に再 arm されず、戻るで guard が枯れてアプリを抜けた（BUG-1）。
  useEffect(() => {
    if (anyOpen && !armedRef.current) {
      window.history.pushState({ cmOverlay: true }, ""); armedRef.current = true; // 開いてるのに guard 無→積む
    } else if (!anyOpen && armedRef.current) {
      skipRef.current += 1; armedRef.current = false; window.history.back(); // 全部閉じた→余った guard を消費
    }
  });

  const [railOpen, setRailOpen] = useState(true);
  const isMobile = useIsMobile();
  const [composeSignal, setComposeSignal] = useState(0); // D&D配置でSectionEditorを再読込
  // 机を閉じる＝焦点を落とし、下の SectionEditor を再読込（机での編集を反映）。deskTarget は closeTop/anyOpen
  // より前で宣言する必要があるため上部（active/navStack 付近）に置く。
  const closeDesk = useCallback(() => {
    setDeskTarget(null);
    setComposeSignal((v) => v + 1);
  }, []);

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

  // 種別の「実在集合」と件数＝facets(GET /facets)の kind / kindCounts（DB上の権威・件数窓に依存しない）。
  // トップの一覧(listNeta)は updated DESC の最新100件で頭打ち＝古い kind(analysis/study 等)がその窓から
  // 漏れるとクライアント集計では0件になり、絞る▾で非タップの「0件ゴースト」に化けてタップ不能だった
  // （＝古データの kind に絞り込めない）。実データ規模で破綻したため実在判定・件数とも facets へ移す（2026-07-15監査）。
  // 正典 docs/research/2026-07-14-topview-redesign-fable.md は「クライアント集計」契約だが、その前提が
  // 実データ規模で崩れたのでここは facets に依る。facets は kindCounts で kind別件数を返す（GROUP BY・窓非依存）ので
  // バッジは正確な実数（旧「最新100件窓の best-effort」を解消）。限界：全プロジェクト横断・library除外＝
  // activeProject を絞らない（他器だけに在る kind も実在・件数に含む）。per-project の厳密件数が要るなら API に
  // scope/project 引数追加（docs/backlog）。件数の鮮度は facets 再取得時（マウント/器切替/loadProjects）に追従。
  const [facetKinds, setFacetKinds] = useState<string[]>([]);

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
    api
      .facets()
      .then((f) => {
        setFacetKinds(f.kind);
        setKindCounts(f.kindCounts); // kind別件数（DB権威・窓非依存）。バッジ/上位6/実在判定の元。
      })
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

  // トップ再設計 S3：種別タイルの件数は facets の kindCounts＝DB権威・件数窓非依存（起票漏れ消化・2026-07-15）。
  // 旧「ロード済み items からのクライアント集計」は最新100件窓の近似で、窓落ちの kind が 0 に化けていた。
  // facets(GET /facets)は GROUP BY で正確な kind別件数を返す＝バッジがそのまま実数。loadProjects() で setKindCounts。
  const [kindCounts, setKindCounts] = useState<Record<string, number>>({});
  // S4 つづき行＝現スコープ最終更新の1件（一覧の上にピン・tap→openTop）。ロード済み items から導出＝
  //   絞り込み中(q/kindFilter/mood)は直前スナップショットを維持（絞るとピンが入れ替わるチラつきを防ぐ）。
  const [resumeNeta, setResumeNeta] = useState<Neta | null>(null);
  useEffect(() => {
    if (q.trim() || kindFilter || moodFilter.trim()) return; // 絞り込み中＝スナップショット固定
    setResumeNeta(
      items.length ? items.reduce((a, b) => ((b.updated ?? "") > (a.updated ?? "") ? b : a)) : null,
    );
  }, [items, q, kindFilter, moodFilter]);
  // トップの種別行＝件数降順・上位6・実在(>0)のみ（0件kindはトップ非表示＝絞る▾引き出しの「まだ0件」に居る）。
  const topKinds: [string, number][] = Object.entries(kindCounts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  // 種別の「実在集合」＝facets（DB全体の権威）。kind と kindCounts は同母集団なので両者由来を束ねる
  // （どちらも facets 由来＝DB実在）。絞る▾の 0件ゴースト判定を実在に依らせる＝窓から漏れた古い kind もタップ可能に。
  const existsKinds = new Set<string>([...facetKinds, ...Object.keys(kindCounts).filter((k) => kindCounts[k]! > 0)]);
  // S5 検索合流（B-lite）＝検索語が種別名に前方一致したら一覧先頭に「＋『◯◯』を作る」行（createBlank/newSong を呼ぶだけ）。
  const createHintKind = q.trim()
    ? SHELF_KINDS.find((k) => (KIND_LABEL[k] ?? "").startsWith(q.trim()))
    : undefined;

  // 手動並べ替えが効くのは「素のプロジェクト一覧」だけ＝検索/種別/mood 絞り込み中は無効
  // （部分集合を並べ替えると position が疎になり混乱する）。この時 items===表示順で楽観更新が安全。
  const reorderable =
    scope === "project" && !unassignedOnly && !q.trim() && !kindFilter && !moodFilter.trim();

  // 過去資産の取込パネル（MIDI/楽譜/音源/URL/歌詞/ハミング）は <ImportPanel> に分離（負債D6）。
  // App が持つのは開閉状態だけ（トグルタイルは create タイル群に残す）。
  const [importOpen, setImportOpen] = useState(false); // 取込ボタン群を畳む（既定=閉）
  // shelfOpen/filterDrawerOpen は戻るガードの都合で上部（trayOpen 付近）に宣言済み。

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
    // #84 SoundFont 先読み。温めは Tone/smplr(~410KB)＋SF2本体の fetch/decode を誘発するので、
    // ロード直後(初期描画とバンドルパースに競合)に走らせない。かといって「最初のタップまで待つ」だと
    // 温めが再生直前に始まり**初回の音出しが遅い**（耳FB 2026-07-09）。折衷＝**初期描画が済んだ後の
    // アイドルで裏読み開始**＝初期表示は軽いまま、再生する頃には温まっている。加えて最初のタップでも
    // 温める(アイドルより早く操作が来た時の保険)。warmed で二重起動を防ぐ（冪等）。
    let warmed = false;
    const warm = () => {
      if (warmed) return;
      warmed = true;
      void initSoundFont().then(() => void prewarmSoundFont());
    };
    window.addEventListener("pointerdown", warm);
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const idle = typeof ric === "function" ? ric(warm, { timeout: 2000 }) : (setTimeout(warm, 1200) as unknown as number);
    return () => {
      window.removeEventListener("pointerdown", warm);
      const cic = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      if (typeof cic === "function") cic(idle);
      else clearTimeout(idle);
    };
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
          {/* ★トップ契約（再発防止の本体・正典＝docs/research/2026-07-14-topview-redesign-fable.md §2.2）：
              ファーストビューの固定行は6つだけ＝ヘッダ／器チップ／アクション行(＋作る/検索/絞る)／種別行(≤1)／
              つづき(≤1)／一覧ヘッダ。残り全部が一覧＝実データが主役。
              ・新 kind が増えた → 作成の棚(CreateShelf)にタイル+1のみ。トップの種別行にはそのkindのネタを
                実際に作った時だけ件数順で現れる＝トップの DOM 増分＋0。
              ・アクション行に足してよいものは無し（＋作る/検索/絞る▾の3枠で打ち止め）。 */}
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
          {/* アクション行＝「作る」「探す」「絞る」の3つの扉を1行に統合（トップ契約§2.2＝この3枠で打ち止め）。
              検索は常時入力欄（1タップ死守）。＋作る/絞る▾ はボトムシートの扉。 */}
          <div className="action-row">
            <button
              type="button"
              className="act-create"
              aria-label="open-create-shelf"
              title="新しいネタを作る"
              onClick={() => setShelfOpen(true)}
            >
              ＋作る ▾
            </button>
            <input
              className="search-main"
              aria-label="search"
              placeholder="検索…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              type="button"
              className={"act-filter" + (kindFilter || moodFilter.trim() ? " set" : "")}
              aria-label="open-filter-drawer"
              aria-pressed={!!(kindFilter || moodFilter.trim())}
              title="種別・mood で絞り込む"
              onClick={() => setFilterDrawerOpen(true)}
            >
              絞る ▾
            </button>
          </div>
          {searchDegraded && q.trim() && (
            // フェイルサイレント解消：意味検索(cm-search)不通時は黙って劣化せず、キーワードのみと明示。
            <div className="search-degraded" aria-label="search-degraded">
              ⚠ 意味検索が使えません。キーワード一致のみで検索中（「近い」候補は出ません）
            </div>
          )}
          {/* 種別行（S3）＝実在kindだけを件数降順・上位6のミニタイル（作成タイルと同じ絵＋件数バッジ）。
              露出∝実利用＝0件kindは出ない。検索中は種別絞りが無効（検索が絞りの主体）なので隠す。 */}
          {!q.trim() && topKinds.length > 0 && (
            <KindTiles entries={topKinds} kindFilter={kindFilter} setKindFilter={setKindFilter} variant="row" />
          )}
          {/* つづき行（S4）＝現スコープ最終更新の1件を一覧の上にピン（作業の続きへ1タップ）。
              絞り込み/検索中は出さない（純ブラウズの続き動線）。 */}
          {!q.trim() && !kindFilter && !moodFilter.trim() && resumeNeta && (
            <button
              type="button"
              className="resume-row"
              aria-label="resume"
              style={{ ["--k" as string]: kindColor(resumeNeta.kind) }}
              onClick={() => openTop(resumeNeta)}
            >
              <span className="resume-bar" aria-hidden="true" />
              <span className="resume-body">
                <b className="resume-title">{resumeNeta.title ?? resumeNeta.text ?? "（無題）"}</b>
                <small className="resume-sub">つづきから · {KIND_LABEL[resumeNeta.kind] ?? resumeNeta.kind}</small>
              </span>
              <span className="resume-go" aria-hidden="true">▸</span>
            </button>
          )}
          {/* 検索合流（S5・B-lite）＝「メロ」等の入力で作成行を出す＝検索から作成へ地続き。 */}
          {createHintKind && (
            <button
              type="button"
              className="create-suggest"
              aria-label="create-suggest"
              style={{ ["--k" as string]: kindColor(createHintKind) }}
              onClick={() =>
                createHintKind === "song"
                  ? void newSong()
                  : void createBlank(createHintKind, `新しい${KIND_LABEL[createHintKind]}`)
              }
            >
              ＋「{KIND_LABEL[createHintKind]}」を作る
            </button>
          )}
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
          {/* 作成の棚（S2＝ボトムシート）。＋作る▾ で開き、タイルtap＝createBlank/newSong→閉じる。 */}
          {shelfOpen && (
            <CreateShelf
              createBlank={createBlank}
              newSong={newSong}
              importOpen={importOpen}
              setImportOpen={setImportOpen}
              reload={reload}
              projectTags={projectTags}
              onClose={() => setShelfOpen(false)}
            />
          )}
          {/* 絞り込み引き出し（S2＝ボトムシート）。絞る▾ で開く。S3 でデータ導出のタイル格子＋0件ゾーンへ。 */}
          {filterDrawerOpen && (
            <FilterDrawer
              kindFilter={kindFilter}
              setKindFilter={setKindFilter}
              moodFilter={moodFilter}
              setMoodFilter={setMoodFilter}
              kindCounts={kindCounts}
              existsKinds={existsKinds}
              onClose={() => setFilterDrawerOpen(false)}
            />
          )}
        </aside>
        <section className="mainpane" aria-label="mainpane">
          <Suspense fallback={<div className="mainpane-empty"><p className="muted">読み込み中…</p></div>}>
          {deskTarget ? (
            // #20 S6骨格の机（全画面）。開いている間は下の SectionEditor はアンマウント相当（handoff §2.2）。
            <SkeletonDesk
              key={`${deskTarget.skelNetaId}@${deskTarget.skelPosition}`}
              {...deskTarget}
              onClose={closeDesk}
              /* C：①ドラムブロック/分岐一覧のメロをタップ→机を閉じて（unmount flush で保存）そのネタを開く。
                 drillNeta は active(=section) を navStack に積むので、開いたネタを閉じれば section に戻る。 */
              onOpenNeta={(n) => { closeDesk(); drillNeta(n); }}
            />
          ) : projectView && activeProject ? (
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
          ) : active && active.kind === "analysis" ? (
            <AnalysisWorkbench
              key={active.id}
              neta={active}
              onChanged={() => void reload()}
              onClose={() => setActive(null)}
            />
          ) : active && active.kind === "study" ? (
            <StudyView key={active.id} neta={active} onClose={() => setActive(null)} />
          ) : active ? (
            <NetaDialog
              key={active.id} /* ネタを切り替えたら作り直して内部状態を新ネタで初期化 */
              neta={active}
              reloadSignal={composeSignal}
              /* CoW（分家の安全弁・S2）：潜って開いた子は直近の親を知る＝共有子の初回編集で分家先になる。
                 トップから開いた（navStack 空）＝親不明＝ガード無し（従来どおり通常保存）。 */
              parentId={navStack.length ? navStack[navStack.length - 1]!.id : undefined}
              onForked={(branch) => { setActive(branch); void reload(); }} /* 分家に載せ替え（navStack=親はそのまま・key変化で分家を再初期化） */
              onOpenNeta={drillNeta} /* Section のブロックタップ→子ネタへ潜る */
              onOpenSkeletonDesk={(t) => setDeskTarget(t)} /* #20 S6：骨格ブロック→机（全画面） */
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
            // #5 空状態を「次の一手」ハブに＝最終更新/最近の更新の実データで再開動線を出す（HomeHub）。
            //   items が空なら HomeHub 内で従来の空文言＋曲を組むに退避＝挙動不変。SP は mv-home で mainpane 非表示。
            <HomeHub
              items={items}
              activeProject={activeProject || undefined}
              onOpen={openTop}
              onCreateSong={() => void newSong()}
              onCreateMelody={() => void createBlank("melody", "新しいメロディ")}
            />
          )}
          </Suspense>
        </section>
        </div>
      </DndContext>
      {/* Fable UX監査⑤：ネタを開いている間（active＝NetaDialog/AnalysisWorkbench/StudyView）は FAB を隠す
          ＝エディタの「左手」ボタンやプレビューを覆わない。既存の「オーバーレイ中は隠す」条項に !active を1つ足す最小工事。 */}
      {!active && !chatOpen && !deskTarget && !shelfOpen && !filterDrawerOpen && (
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
        <Suspense fallback={null}>
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
        </Suspense>
      )}
      {trayOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
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
