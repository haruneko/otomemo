import { useEffect, useRef, useState } from "react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, type Neta } from "../api";
import { useAlive, pollJobContent } from "../poll";
import { MUSIC_KINDS, CONTAINER_KINDS, KIND_LABEL } from "../kinds";
import { isProjectTag } from "../project";
import { MiniRoll, SectionMini } from "./MiniRoll";
import { KindIcon } from "./KindIcon";
import {
  playNotes,
  notesForContent,
  compositeNotes,
  programOf,
  type Note,
  type PlaybackHandle,
} from "../music";


// #65 検索結果の一致種別→質的ラベル（スコア数値は出さない）
const MATCH_LABEL: Record<string, string> = { exact: "一致", both: "一致", semantic: "近い" };

export function NetaCard({
  neta,
  scope = "project",
  dense = false,
  sortDisabled = false,
  projects = [],
  onChanged,
  onChat,
  onOpen,
}: {
  neta: Neta & { matchType?: string };
  scope?: "project" | "library";
  dense?: boolean;
  sortDisabled?: boolean;
  projects?: string[]; // 入れ先候補の器（名前一覧）。カードの「器へ」ピッカーに使う。
  onChanged?: () => void;
  onChat?: (neta: Neta) => void;
  onOpen?: (neta: Neta) => void;
}) {
  const label = neta.title ?? neta.text ?? "(無題)";
  const [gen, setGen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  // LV2: 副アクション（複製/ライブラリへ/生成）は既定で畳む＝主要2つ(▶/相談)＋「…」に整理。
  const [moreOpen, setMoreOpen] = useState(false);
  // P3: 器ピッカーの開閉（入れ先はフィルタと独立＝どの器へでも入れられる）。
  const [assignOpen, setAssignOpen] = useState(false);
  // 手動並べ替え(sortable)＋セクションのレーンへドラッグ配置(#52②c)を1つのハンドルで兼ねる。
  // 一覧内で別カードにドロップ→reorder（App.onDragEnd）／レーンにドロップ→placeChild。
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: neta.id,
    data: { neta },
    disabled: sortDisabled,
  });
  const sortStyle = { transform: CSS.Transform.toString(transform), transition };

  const intentOf = {
    melody: "gen_melody",
    chord_progression: "gen_chord",
    rhythm: "gen_rhythm",
  } as const;
  const ctx = () => neta.title ?? neta.text ?? "";

  // 再生/停止トグル（#73+停止）。playNotes は単一Transportなので別ネタ再生で自動停止。
  const [playing, setPlaying] = useState(false);
  const handleRef = useRef<PlaybackHandle | null>(null);
  const alive = useAlive(); // 生成ポーリングは長い＝アンマウント後 setState を防ぐ（poll.ts 共通）
  useEffect(() => () => handleRef.current?.stop(), []); // アンマウントで再生停止

  async function toggle(getNotes: () => Note[] | Promise<Note[]>, program?: number) {
    if (playing) {
      handleRef.current?.stop();
      handleRef.current = null;
      setPlaying(false);
      return;
    }
    const notes = await getNotes();
    if (!notes.length) return;
    setPlaying(true);
    handleRef.current = await playNotes(notes, neta.tempo ?? 120, {
      program,
      onEnd: () => {
        setPlaying(false);
        handleRef.current = null;
      },
    });
  }

  // #73 section/song を合成（子をsection調へ移調＋位置オフセット）
  async function sectionNotes(): Promise<Note[]> {
    const tree = await api.getComposition(neta.id).catch(() => null);
    return tree ? compositeNotes(tree.children, neta.key ?? 0, neta.mode) : [];
  }

  // 生成ジョブの done を待って content を取る（poll.ts 共通・worker timeout超まで待つ／reaper も拾う）
  const pollContent = (jobId: string) => pollJobContent(jobId, alive);

  async function generate(kind: keyof typeof intentOf) {
    setGenOpen(false);
    setGen(true);
    try {
      const job = await api.createJob({
        intent: intentOf[kind],
        target_neta_id: neta.id,
        params: { context: ctx() },
      });
      const content = await pollContent(job.id);
      if (content == null || !alive.current) return; // 失敗/タイムアウト/アンマウント：空ネタを作らない
      await api.createNeta({ kind, title: neta.title ?? "案", content, from_job: job.id });
      if (alive.current) onChanged?.();
    } finally {
      if (alive.current) setGen(false);
    }
  }

  // 全体作例：メロ+コード+リズムを生成して section に composeする
  async function generateSection() {
    setGenOpen(false);
    setGen(true);
    try {
      const section = await api.createNeta({ kind: "section", title: `${ctx() || "作例"} 一式` });
      for (const kind of ["melody", "chord_progression", "rhythm"] as const) {
        const job = await api.createJob({
          intent: intentOf[kind],
          target_neta_id: neta.id,
          params: { context: ctx() },
        });
        const content = await pollContent(job.id);
        if (content == null || !alive.current) continue; // 失敗/アンマウントの子は作らない
        const child = await api.createNeta({ kind, title: kind, content, from_job: job.id });
        await api.placeChild(section.id, child.id, 0, 0).catch(() => {});
      }
      if (alive.current) onChanged?.();
    } finally {
      if (alive.current) setGen(false);
    }
  }

  // 再生ボタン（カード/リスト両モードで共用）。楽器ネタ=単独再生／器ネタ=合成プレビュー。
  const playBtn = MUSIC_KINDS.includes(neta.kind) ? (
    <button
      className="bs-btn"
      aria-label={`play-${neta.id}`}
      title={playing ? "停止" : "このネタを単独再生（C基準そのまま）"}
      onClick={() =>
        void toggle(
          () => notesForContent(neta.kind, neta.content, { key: neta.key ?? 0 }),
          neta.kind === "rhythm" ? undefined : (programOf(neta.content) ?? 0),
        )
      }
    >
      {playing ? "⏹" : "▶"}
    </button>
  ) : CONTAINER_KINDS.includes(neta.kind) ? (
    <button
      className="bs-btn"
      aria-label={`play-${neta.id}`}
      title={playing ? "停止" : "合成プレビュー再生"}
      onClick={() => void toggle(sectionNotes)}
    >
      {playing ? "⏹" : "▶"}
    </button>
  ) : null;

  // 器への出し入れ（P3）＝入れ先はフィルタと独立。既存器チップ（✓=在籍→押すと出す）＋新しい器。
  const memberOf = (p: string) => neta.tags.includes(`prj:${p}`);
  async function toggleProject(p: string, member: boolean) {
    await api.assignProject(neta.id, p, member);
    onChanged?.();
  }
  async function assignNewProject() {
    const name = window.prompt("新しい器（プロジェクト）名")?.trim();
    if (!name) return;
    await toggleProject(name, true);
  }

  const assignMenu =
    scope === "project" ? (
      <div className="assign-wrap">
        <button
          className="bs-btn"
          aria-label={`assign-${neta.id}`}
          title="この曲/ネタを器（プロジェクト）へ入れる・出す"
          onClick={() => setAssignOpen((v) => !v)}
        >
          器へ ▾
        </button>
        {assignOpen && (
          <div className="assign-menu" aria-label={`assign-menu-${neta.id}`}>
            {projects.map((p) => (
              <button
                key={p}
                className={"bs-btn" + (memberOf(p) ? " on" : "")}
                onClick={() => void toggleProject(p, !memberOf(p))}
                title={memberOf(p) ? "この器から出す" : `「${p}」へ入れる`}
              >
                {memberOf(p) ? "✓ " : ""}
                {p}
              </button>
            ))}
            <button className="bs-btn" aria-label={`assign-new-${neta.id}`} onClick={() => void assignNewProject()}>
              ＋新しい器
            </button>
          </div>
        )}
      </div>
    ) : null;

  // リスト（コンパクト）表示：1行に圧縮＝左色帯＋アイコン＋タイトル主役＋種別小＋▶のみ。
  if (dense) {
    return (
      <article
        ref={setNodeRef}
        style={sortStyle}
        aria-label="neta-card"
        data-kind={neta.kind}
        className={"dense" + (isDragging ? " dragging" : "")}
      >
        <button
          {...listeners}
          {...attributes}
          className="drag-handle dense-handle"
          aria-label={`drag-${neta.id}`}
          title="ドラッグで並べ替え"
        >
          ⠿
        </button>
        <div
          className="card-main"
          role="button"
          tabIndex={0}
          onClick={() => onOpen?.(neta)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onOpen?.(neta);
          }}
        >
          <span className="dense-icon" aria-hidden="true">
            <KindIcon kind={neta.kind} />
          </span>
          <span className="dense-title">{label}</span>
          {neta.matchType && MATCH_LABEL[neta.matchType] && (
            <span className={"match-badge " + neta.matchType}>{MATCH_LABEL[neta.matchType]}</span>
          )}
          <span className="kind dense-kind">{KIND_LABEL[neta.kind] ?? neta.kind}</span>
        </div>
        <div className="bs-tools">{playBtn}</div>
      </article>
    );
  }

  return (
    <article
      ref={setNodeRef}
      style={sortStyle}
      aria-label="neta-card"
      data-kind={neta.kind}
      className={isDragging ? "dragging" : ""}
    >
      <button
        {...listeners}
        {...attributes}
        className="drag-handle"
        aria-label={`drag-${neta.id}`}
        title="ドラッグで並べ替え／セクションのレーンへ配置"
      >
        ⠿
      </button>
      <div
        className="card-main"
        role="button"
        tabIndex={0}
        onClick={() => onOpen?.(neta)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen?.(neta);
        }}
      >
        <header>
          <span className="kind">{KIND_LABEL[neta.kind] ?? neta.kind}</span>
          {neta.matchType && MATCH_LABEL[neta.matchType] && (
            <span className={"match-badge " + neta.matchType}>{MATCH_LABEL[neta.matchType]}</span>
          )}
          <code className="id">{neta.id.slice(0, 8)}</code>
        </header>
        <div className="body">{label}</div>
        {CONTAINER_KINDS.includes(neta.kind) ? <SectionMini neta={neta} /> : <MiniRoll neta={neta} />}
        {/* プロジェクト所属(prj:)は別軸＝ピッカーに出すので意味タグのチップ列からは外す */}
        {(() => {
          const tags = neta.tags.filter((t) => !isProjectTag(t));
          return tags.length > 0 ? (
            <footer>
              {tags.map((t) => (
                <span key={t} className="tag">
                  #{t}
                </span>
              ))}
            </footer>
          ) : null;
        })()}
      </div>
      <div className="bs-tools">
        {playBtn}
        <button className="bs-btn" onClick={() => onChat?.(neta)}>
          相談
        </button>
        {!moreOpen && (
          <button
            className="bs-btn more"
            aria-label={`more-${neta.id}`}
            title="他の操作（複製・ライブラリ・生成）"
            onClick={() => setMoreOpen(true)}
          >
            …
          </button>
        )}
        {moreOpen &&
          (scope === "library" ? (
          <button
            className="bs-btn"
            title="このライブラリ進行をプロジェクトにコピー（編集可・元は不変）"
            onClick={async () => {
              await api.copyNeta(neta.id);
              onChanged?.();
            }}
          >
            ＋プロジェクトへ
          </button>
        ) : (
          <>
            {assignMenu}
            <button
              className="bs-btn"
              title="複製（バリエーションの素体に）"
              onClick={async () => {
                await api.copyNeta(neta.id);
                onChanged?.();
              }}
            >
              複製
            </button>
            <button
              className="bs-btn"
              title="ライブラリ（連想元）へ移す＝この曲/進行を連想の素材にする"
              onClick={async () => {
                await api.setScope(neta.id, "library");
                onChanged?.();
              }}
            >
              ライブラリへ
            </button>
          </>
          ))}
        {moreOpen &&
          (gen ? (
          <span className="bs-btn">生成中…</span>
        ) : genOpen ? (
          <>
            <button className="bs-btn" onClick={() => generate("melody")}>
              メロ
            </button>
            <button className="bs-btn" onClick={() => generate("chord_progression")}>
              コード
            </button>
            <button className="bs-btn" onClick={() => generate("rhythm")}>
              リズム
            </button>
            <button className="bs-btn" onClick={generateSection}>
              全体
            </button>
          </>
        ) : (
          <button className="bs-btn" onClick={() => setGenOpen(true)}>
            生成 ▾
          </button>
          ))}
      </div>
    </article>
  );
}

export function NetaList({
  items,
  scope = "project",
  reorderable = false,
  projects = [],
  onChanged,
  onChat,
  onOpen,
  emptyText = "まだネタがありません。",
}: {
  items: (Neta & { matchType?: string })[];
  scope?: "project" | "library";
  reorderable?: boolean; // App が「並べ替え可（検索/絞り込み無し）」の時だけ true。
  projects?: string[]; // 入れ先候補の器一覧。カードの「器へ」ピッカーへ渡す。
  onChanged?: () => void;
  onChat?: (neta: Neta) => void;
  onOpen?: (neta: Neta) => void;
  emptyText?: string;
}) {
  // 表示密度＝カード（リッチ）/ リスト（圧縮・一覧性）。既定=card で現状維持。localStorage で永続。
  const [dense, setDense] = useState<boolean>(
    () => localStorage.getItem("cm-list-density") === "list",
  );
  const setDensity = (d: boolean) => {
    setDense(d);
    localStorage.setItem("cm-list-density", d ? "list" : "card");
  };
  // LV2 並べ替え。既定=受信順（検索の関連度順を壊さない）。localStorage で永続。
  const [sortKey, setSortKey] = useState<string>(
    () => localStorage.getItem("cm-list-sort") || "default",
  );
  const changeSort = (k: string) => {
    setSortKey(k);
    localStorage.setItem("cm-list-sort", k);
  };
  const labelOf = (n: Neta) => n.title ?? n.text ?? "";
  const ordered =
    sortKey === "default"
      ? items
      : [...items].sort((a, b) => {
          if (sortKey === "updated") return (b.updated ?? "").localeCompare(a.updated ?? "");
          if (sortKey === "kind")
            return a.kind.localeCompare(b.kind) || (b.updated ?? "").localeCompare(a.updated ?? "");
          if (sortKey === "title") return labelOf(a).localeCompare(labelOf(b), "ja");
          return 0;
        });

  const controls = (
    <div className="list-controls">
      <div className="list-density" role="group" aria-label="表示密度">
        <button
          className={dense ? "" : "on"}
          aria-pressed={!dense}
          title="カード表示（リッチ）"
          onClick={() => setDensity(false)}
        >
          ▦ カード
        </button>
        <button
          className={dense ? "on" : ""}
          aria-pressed={dense}
          title="リスト表示（圧縮・一覧しやすい）"
          onClick={() => setDensity(true)}
        >
          ☰ リスト
        </button>
      </div>
      <select
        className="list-sort"
        aria-label="並べ替え"
        value={sortKey}
        title="並べ替え"
        onChange={(e) => changeSort(e.target.value)}
      >
        <option value="default">既定順</option>
        <option value="updated">更新が新しい順</option>
        <option value="kind">種別ごと</option>
        <option value="title">タイトル順</option>
      </select>
    </div>
  );
  if (items.length === 0)
    return (
      <>
        {controls}
        <p className="muted">{emptyText}</p>
      </>
    );
  // 並べ替えが効くのは「並べ替え可(App)」かつ「既定順表示」の時だけ＝基準ソート中の誤並べ替えを防ぐ。
  const canReorder = reorderable && sortKey === "default";
  return (
    <>
      {controls}
      <SortableContext items={ordered.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        <section aria-label="neta-list" className={dense ? "dense" : ""}>
          {ordered.map((n) => (
            <NetaCard
              key={n.id}
              neta={n}
              scope={scope}
              dense={dense}
              sortDisabled={!canReorder}
              projects={projects}
              onChanged={onChanged}
              onChat={onChat}
              onOpen={onOpen}
            />
          ))}
        </section>
      </SortableContext>
    </>
  );
}
