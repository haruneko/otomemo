import { useEffect, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { api, type Neta } from "../api";
import { useAlive, pollJobContent } from "../poll";
import { MUSIC_KINDS, CONTAINER_KINDS } from "../kinds";
import { MiniRoll } from "./MiniRoll";
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
  onChanged,
  onChat,
  onOpen,
}: {
  neta: Neta & { matchType?: string };
  scope?: "project" | "library";
  onChanged?: () => void;
  onChat?: (neta: Neta) => void;
  onOpen?: (neta: Neta) => void;
}) {
  const label = neta.title ?? neta.text ?? "(無題)";
  const [gen, setGen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
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
    return tree ? compositeNotes(tree.children, neta.key ?? 0) : [];
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
        {neta.tags.length > 0 && (
          <footer>
            {neta.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          </footer>
        )}
      </div>
      <div className="bs-tools">
        {MUSIC_KINDS.includes(neta.kind) && (
          <button
            className="bs-btn"
            aria-label={`play-${neta.id}`}
            title={playing ? "停止" : "このネタを単独再生（C基準そのまま）"}
            onClick={() =>
              void toggle(
                // 相対bass は neta の key を tonic に解決（#bass S2）。
                () => notesForContent(neta.kind, neta.content, { key: neta.key ?? 0 }),
                neta.kind === "rhythm" ? undefined : (programOf(neta.content) ?? 0),
              )
            }
          >
            {playing ? "⏹" : "▶"}
          </button>
        )}
        {CONTAINER_KINDS.includes(neta.kind) && (
          <button
            className="bs-btn"
            aria-label={`play-${neta.id}`}
            title={playing ? "停止" : "合成プレビュー再生"}
            onClick={() => void toggle(sectionNotes)}
          >
            {playing ? "⏹" : "▶"}
          </button>
        )}
        <button className="bs-btn" onClick={() => onChat?.(neta)}>
          相談
        </button>
        {scope === "library" ? (
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
        )}
        {gen ? (
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
        )}
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
  if (items.length === 0) return <p className="muted">{emptyText}</p>;
  return (
    <section aria-label="neta-list">
      {items.map((n) => (
        <NetaCard key={n.id} neta={n} scope={scope} onChanged={onChanged} onChat={onChat} onOpen={onOpen} />
      ))}
    </section>
  );
}
