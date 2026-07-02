import { useEffect, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { api, type Neta } from "../api";
import { useAlive, pollJobContent } from "../poll";
import { MUSIC_KINDS, CONTAINER_KINDS } from "../kinds";
import { isProjectTag } from "../project";
import { MiniRoll } from "./MiniRoll";
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
  onChanged,
  onChat,
  onOpen,
}: {
  neta: Neta & { matchType?: string };
  scope?: "project" | "library";
  dense?: boolean;
  onChanged?: () => void;
  onChat?: (neta: Neta) => void;
  onOpen?: (neta: Neta) => void;
}) {
  const label = neta.title ?? neta.text ?? "(無題)";
  const [gen, setGen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  // LV2: 副アクション（複製/ライブラリへ/生成）は既定で畳む＝主要2つ(▶/相談)＋「…」に整理。
  const [moreOpen, setMoreOpen] = useState(false);
  // #52②c: ネタ帳カードをセクションのレーンへドラッグ配置（PC）。ハンドルだけドラッグ可。
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card-${neta.id}`,
    data: { neta },
  });

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

  // リスト（コンパクト）表示：1行に圧縮＝左色帯＋アイコン＋タイトル主役＋種別小＋▶のみ。
  if (dense) {
    return (
      <article
        aria-label="neta-card"
        data-kind={neta.kind}
        className={"dense" + (isDragging ? " dragging" : "")}
      >
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
          <span className="kind dense-kind">{neta.kind}</span>
        </div>
        <div className="bs-tools">{playBtn}</div>
      </article>
    );
  }

  return (
    <article aria-label="neta-card" data-kind={neta.kind} className={isDragging ? "dragging" : ""}>
      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="drag-handle"
        aria-label={`drag-${neta.id}`}
        title="ドラッグでセクションのレーンへ置く（PC）"
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
          <span className="kind">{neta.kind}</span>
          {neta.matchType && MATCH_LABEL[neta.matchType] && (
            <span className={"match-badge " + neta.matchType}>{MATCH_LABEL[neta.matchType]}</span>
          )}
          <code className="id">{neta.id.slice(0, 8)}</code>
        </header>
        <div className="body">{label}</div>
        <MiniRoll neta={neta} />
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
  onChanged,
  onChat,
  onOpen,
  emptyText = "まだネタがありません。",
}: {
  items: (Neta & { matchType?: string })[];
  scope?: "project" | "library";
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
  return (
    <>
      {controls}
      <section aria-label="neta-list" className={dense ? "dense" : ""}>
        {ordered.map((n) => (
          <NetaCard
            key={n.id}
            neta={n}
            scope={scope}
            dense={dense}
            onChanged={onChanged}
            onChat={onChat}
            onOpen={onOpen}
          />
        ))}
      </section>
    </>
  );
}
