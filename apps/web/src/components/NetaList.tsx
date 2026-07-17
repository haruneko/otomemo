import { useCallback, useEffect, useRef, useState } from "react";
import { useDismiss } from "../useDismiss";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, type Neta } from "../api";
import { useAlive } from "../poll";
import { MUSIC_KINDS, CONTAINER_KINDS, KIND_LABEL } from "../kinds";
import { isProjectTag } from "../project";
import { MiniRoll, SectionMini, LazyPreview } from "./MiniRoll";
import { ErrorBoundary } from "./ErrorBoundary";
import { KindIcon } from "./KindIcon";
import { Icon } from "./Icon";
import { PrepStatus } from "../usePrepPending";
import {
  playNotes,
  notesForContent,
  compositeNotes,
  feelOf,
  isCompoundMeter,
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
  const [deleting, setDeleting] = useState(false);
  // LV2: 副アクション（複製/ライブラリへ/生成）は既定で畳む＝主要2つ(▶/相談)＋「…」に整理。
  const [moreOpen, setMoreOpen] = useState(false);
  // P3: 器ピッカーの開閉（入れ先はフィルタと独立＝どの器へでも入れられる）。
  const [assignOpen, setAssignOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const assignRef = useRef<HTMLDivElement>(null);
  useDismiss(moreRef, moreOpen, useCallback(() => setMoreOpen(false), [])); // 外タップ/Escで閉じる
  useDismiss(assignRef, assignOpen, useCallback(() => setAssignOpen(false), []));
  // 手動並べ替え(sortable)＋セクションのレーンへドラッグ配置(#52②c)を1つのハンドルで兼ねる。
  // 一覧内で別カードにドロップ→reorder（App.onDragEnd）／レーンにドロップ→placeChild。
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: neta.id,
    data: { neta },
    disabled: sortDisabled,
  });
  const sortStyle = { transform: CSS.Transform.toString(transform), transition };

  const ctx = () => neta.title ?? neta.text ?? "";

  // 再生/停止トグル（#73+停止）。playNotes は単一Transportなので別ネタ再生で自動停止。
  const [playing, setPlaying] = useState(false);
  // F1 再生ローディング（設計2026-07-17・#8）：押下→発音までの「開始中」窓。section は getComposition の
  // fetch 待ち、単独メロは SF2/sampler 準備待ちがここに入る。この間は▶を busy 表示＋再押下 no-op（TransportBar
  // と体験を揃える）。グローバルの「音源読込中…/楽器準備中…」文言は <PrepStatus/> が別途出す。
  const [starting, setStarting] = useState(false);
  const handleRef = useRef<PlaybackHandle | null>(null);
  const alive = useAlive(); // 生成ポーリングは長い＝アンマウント後 setState を防ぐ（poll.ts 共通）
  useEffect(() => () => handleRef.current?.stop(), []); // アンマウントで再生停止

  async function toggle(getNotes: () => Note[] | Promise<Note[]>, program?: number) {
    if (starting) return; // 準備中の再押下は no-op（二重発火を防ぐ）
    if (playing) {
      handleRef.current?.stop();
      handleRef.current = null;
      setPlaying(false);
      return;
    }
    // 押下直後に先に反応（#8）：section は getNotes 内の getComposition fetch が走る＝ここで starting/playing を
    // 立てておくと fetch 待ちの間もスピナーが出る（旧＝fetch 解決後まで無反応だった）。
    setStarting(true);
    setPlaying(true);
    try {
      const notes = await getNotes();
      if (!notes.length) {
        setPlaying(false);
        return;
      }
      handleRef.current = await playNotes(notes, neta.tempo ?? 120, {
        program,
        feel: feelOf(neta.content), // フィール層：単一メロ card の content.feel でスイング（section card は SectionEditor 側で）。
        compound: isCompoundMeter(neta.meter),
        onEnd: () => {
          setPlaying(false);
          handleRef.current = null;
        },
      });
    } finally {
      setStarting(false);
    }
  }

  // #73 section/song を合成（子をsection調へ移調＋位置オフセット）
  async function sectionNotes(): Promise<Note[]> {
    const tree = await api.getComposition(neta.id).catch(() => null);
    return tree ? compositeNotes(tree.children, neta.key ?? 0, neta.mode) : [];
  }

  // 全体作例＝決定的 /gen/section（純TS・worker不要/クォータ0）で section＋各パート(コード/コード楽器/
  // メロ/ベース/ドラム)を即生成し compose。旧実装は gen_* ジョブを worker に投げ pollContent で待つ設計で、
  // worker 非稼働時に「生成中…」のまま無限ハングしていた（監査 GN-08）。カードは決定的な一式作例に一本化し、
  // パート単位のいじり(この進行にメロ生成 等)はコード文脈のある section エディタの「いじる▾」に委ねる。
  async function generateSection() {
    setGen(true);
    try {
      await api.genSection({
        frame: { key: neta.key ?? 0, tempo: neta.tempo ?? undefined, meter: neta.meter ?? undefined },
        title: `${ctx() || "作例"} 一式`,
      });
      if (alive.current) onChanged?.();
    } finally {
      if (alive.current) setGen(false);
    }
  }

  // ゴミ箱（一覧から直接削除）。破壊的＝確認必須。エディタ header の削除（useNetaEditor.remove）と
  // 同じ確認文言／同じ api.deleteNeta を流用（二重実装しない）。削除は配置(parent-child)へ CASCADE で
  // 波及し、配置済みネタも自動で外れる（既存の削除挙動そのまま・新挙動を発明しない）。削除後は onChanged
  // で一覧が再取得され当カードは消える。
  async function remove() {
    if (deleting) return;
    if (!window.confirm("このネタを削除しますか？")) return;
    setDeleting(true);
    try {
      await api.deleteNeta(neta.id);
      if (alive.current) onChanged?.();
    } finally {
      if (alive.current) setDeleting(false);
    }
  }
  // 薄い赤のゴミ箱アイコン（叫ばない）。カード本体タップ（開く）と別領域の bs-tools に置く＝誤タップしにくい。
  const delBtn = (
    <button
      className="bs-btn card-del"
      aria-label={`delete-${neta.id}`}
      title="このネタを削除"
      disabled={deleting}
      onClick={() => void remove()}
    >
      <Icon name="trash" size={16} />
    </button>
  );

  // ▶ボタン内グリフ。F1: 開始中（starting）はスピナー＝押下直後の反応（fetch/準備待ちも含む）。
  const playGlyph = starting ? <span className="tp-spin prep-spin" aria-hidden="true" /> : playing ? "⏹" : "▶";
  // 再生ボタン（カード/リスト両モードで共用）。楽器ネタ=単独再生／器ネタ=合成プレビュー。
  const playBtn = MUSIC_KINDS.includes(neta.kind) ? (
    <button
      className="bs-btn"
      aria-label={`play-${neta.id}`}
      aria-busy={starting || undefined}
      title={starting ? "準備中…" : playing ? "停止" : "このネタを単独再生（C基準そのまま）"}
      onClick={() =>
        void toggle(
          () => notesForContent(neta.kind, neta.content, { key: neta.key ?? 0 }),
          neta.kind === "rhythm" ? undefined : (programOf(neta.content) ?? 0),
        )
      }
    >
      {playGlyph}
    </button>
  ) : CONTAINER_KINDS.includes(neta.kind) ? (
    <button
      className="bs-btn"
      aria-label={`play-${neta.id}`}
      aria-busy={starting || undefined}
      title={starting ? "準備中…" : playing ? "停止" : "合成プレビュー再生"}
      onClick={() => void toggle(sectionNotes)}
    >
      {playGlyph}
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
      <div className="assign-wrap" ref={assignRef}>
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
        <div className="bs-tools">
          {playBtn}
          <PrepStatus />
          {delBtn}
        </div>
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
        <ErrorBoundary fallback={<p className="section-mini-empty muted">（概形を表示できませんでした）</p>}>
          <LazyPreview>
            {CONTAINER_KINDS.includes(neta.kind) ? <SectionMini neta={neta} /> : <MiniRoll neta={neta} />}
          </LazyPreview>
        </ErrorBoundary>
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
      <div className="bs-tools" ref={moreRef}>
        {playBtn}
        <PrepStatus />
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
              title="別物にする＝複製（中身ごと丸ごとコピー・系譜なし・元とは無関係な独立ネタ）"
              onClick={async () => {
                await api.copyNeta(neta.id);
                onChanged?.();
              }}
            >
              複製
            </button>
            {/* 分家＝同じものとして育てる（変奏の一級化・S2）。複製(別物)と対＝子は参照共有＋variant_of で系譜が残る。 */}
            {(MUSIC_KINDS.includes(neta.kind) || CONTAINER_KINDS.includes(neta.kind)) && (
              <button
                className="bs-btn"
                title="同じものとして育てる＝分家（子ネタは参照共有・元との系譜が残る＝2番/転調ラスサビ等の変奏に）"
                onClick={async () => {
                  await api.vary(neta.id);
                  onChanged?.();
                }}
              >
                分家
              </button>
            )}
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
        {/* 作例を生成＝プロジェクトの音楽系ネタ(音楽kind∪コンテナ)だけに露出（監査#3）。
            ライブラリのカードや歌詞/テーマ/知識/参考など非音楽kindでは一式生成が無意味＝出さない。 */}
        {moreOpen &&
          scope === "project" &&
          (MUSIC_KINDS.includes(neta.kind) || CONTAINER_KINDS.includes(neta.kind)) &&
          (gen ? (
            <span className="bs-btn">生成中…</span>
          ) : (
            <button
              className="bs-btn"
              onClick={generateSection}
              title="この調・拍子で一式（コード/コード楽器/メロ/ベース/ドラム）の作例を即生成"
            >
              作例を生成
            </button>
          ))}
        {delBtn}
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
  // 表示密度＝カード（リッチ）/ リスト（圧縮・一覧性）。トップ再設計 S4＝**既定をリスト密度へ**
  // （一覧性の底上げ・正典 §3.3）。ただし保存済みの人は不変＝localStorage 未設定時のみ list を既定に。
  const [dense, setDense] = useState<boolean>(() => {
    const stored = localStorage.getItem("cm-list-density");
    return stored === null ? true : stored === "list";
  });
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
  // #11 ライブラリの同名束ね：連続する同名(title/text 完全一致)を1行に畳む展開状態（先頭 id で持つ）。
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const toggleBundle = (k: string) =>
    setExpandedBundles((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
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
  const card = (n: Neta & { matchType?: string }) => (
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
  );
  // #11 ライブラリのみ、連続する同名を1グループに束ねる（表示だけ＝連想の母集団は不変）。
  // 空ラベルは束ねない（無題同士の誤集約を避ける）。project スコープは束ねずそのまま。
  const groups: (Neta & { matchType?: string })[][] = [];
  if (scope === "library") {
    for (const n of ordered) {
      const last = groups[groups.length - 1];
      const l = labelOf(n);
      if (last && l !== "" && labelOf(last[0]!) === l) last.push(n);
      else groups.push([n]);
    }
  }
  return (
    <>
      {controls}
      <SortableContext items={ordered.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        <section aria-label="neta-list" className={dense ? "dense" : ""}>
          {scope === "library"
            ? groups.map((g) => {
                if (g.length === 1) return card(g[0]!);
                const lead = g[0]!;
                const open = expandedBundles.has(lead.id);
                return (
                  <div key={lead.id} className="neta-bundle" data-open={open}>
                    <div className="bundle-lead">
                      {/* 束ねた行の再生/開くは先頭要素（正典 #11）。 */}
                      {card(lead)}
                      <button
                        className="bundle-toggle"
                        aria-label={`bundle-${lead.id}`}
                        aria-expanded={open}
                        title={`同名 ${g.length} 件（タップで展開）`}
                        onClick={() => toggleBundle(lead.id)}
                      >
                        ×{g.length} {open ? "▾" : "▸"}
                      </button>
                    </div>
                    {open && g.slice(1).map((n) => card(n))}
                  </div>
                );
              })
            : ordered.map((n) => card(n))}
        </section>
      </SortableContext>
    </>
  );
}
