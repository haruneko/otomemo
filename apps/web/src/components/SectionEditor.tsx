import { useCallback, useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { api, type Neta, type CompositionNode } from "../api";
import { useTransport } from "../useTransport";
import { TransportBar } from "./TransportBar";

// レーンの1セル＝ドロップ先（#52②c）。kind が合えばカードを落として配置。
function LaneCell({
  laneKey,
  kinds,
  bar,
  position,
  onTap,
}: {
  laneKey: string;
  kinds: readonly string[];
  bar: number;
  position: number;
  onTap: (position: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${laneKey}-${bar}`, data: { kinds, position } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={"lane-cell" + (isOver ? " over" : "")}
      aria-label={`place-${laneKey}-${bar}`}
      onClick={() => onTap(position)}
    />
  );
}
import { notesForContent, compositeNotes, downloadMidi, type Note } from "../music";

// 配置タイムライン（design #19）。section/song を メロ/コード/リズムの3レーン×小節 で組む。
// レーンは子の kind から導出（スキーマ変更なし）。空セルをタップ→ネタを選んで置く。
// 調/テンポは section が支配。rhythm(ドラム)は移調しない。
const LANES = [
  { key: "melody", label: "メロ", kinds: ["melody"] },
  { key: "chord", label: "コード", kinds: ["chord", "chord_progression"] },
  { key: "rhythm", label: "リズム", kinds: ["rhythm"] },
] as const;
const BARS = 8;

// #51: 拍子(meter "n/d")から1小節の拍数を導出。beat=四分=1.0 基準で num*4/den。
// 4/4→4.0、6/8→3.0、3/4→3.0。未指定/不正は 4/4。
export function beatsPerBar(meter: string | null | undefined): number {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
  if (!m) return 4;
  const num = Number(m[1]);
  const den = Number(m[2]);
  return num > 0 && den > 0 ? (num * 4) / den : 4;
}

type Lane = (typeof LANES)[number];
type Child = CompositionNode["children"][number];

export function SectionEditor({
  neta,
  keyPc,
  tempo,
  meter,
  reloadSignal,
  onChanged,
}: {
  neta: Neta;
  keyPc: number;
  tempo: number;
  meter?: string; // 編集中ライブ反映用（未指定は neta.meter）
  reloadSignal?: number; // 外部(D&D配置)からの再読込トリガ
  onChanged?: () => void;
}) {
  const [children, setChildren] = useState<Child[]>([]);
  const [picker, setPicker] = useState<{ lane: Lane; position: number; cands: Neta[] } | null>(null);
  const [pq, setPq] = useState(""); // ピッカーの絞り込み
  const BPB = beatsPerBar(meter ?? neta.meter); // 1小節の拍数（#51・編集中はprop優先）
  const TOTAL = BARS * BPB;
  // #49/#58/#59 トランスポート。合成結果を再生／プレイヘッドは TOTAL(グリッド全体)尺・拍子BPB。
  const tp = useTransport(() => composite(), tempo, { scaleBeats: TOTAL, bpb: BPB });

  // Space=合成再生/一時停止（design #59）。入力中は無効。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement;
      if (t.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
      e.preventDefault();
      tp.playPause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tp.playPause]);

  const load = useCallback(async () => {
    const tree = await api.getComposition(neta.id);
    setChildren(tree.children);
  }, [neta.id]);
  useEffect(() => {
    void load();
  }, [load, reloadSignal]);

  const inLane = (lane: Lane, kind: string) => (lane.kinds as readonly string[]).includes(kind);
  const laneOf = (kind: string) => LANES.find((l) => inLane(l, kind));
  const laneChildren = (lane: Lane) => children.filter((c) => inLane(lane, c.node.neta.kind));
  const others = children.filter((c) => !laneOf(c.node.neta.kind));

  function childDur(c: Child): number {
    const ns = notesForContent(c.node.neta.kind, c.node.neta.content);
    return ns.length ? Math.max(...ns.map((n) => n.start + n.dur)) : BPB;
  }

  async function openPicker(lane: Lane, position: number) {
    const all = await api.listNeta({});
    // #54: 既配置のネタも候補に出す（同じネタを別位置へ反復配置できる）。自分自身だけ除外。
    const cands = all.filter((n) => inLane(lane, n.kind) && n.id !== neta.id);
    setPq("");
    setPicker({ lane, position, cands });
  }
  async function placeAt(child: Neta) {
    if (!picker) return;
    await api.placeChild(neta.id, child.id, picker.position, children.length);
    setPicker(null);
    await load();
    onChanged?.();
  }
  async function remove(childId: string, position?: number) {
    await api.removeChild(neta.id, childId, position);
    await load();
    onChanged?.();
  }

  // 合成：子を section の調へ移調（rhythm除く）＋位置オフセット（共有: compositeNotes）
  function composite(): Note[] {
    return compositeNotes(children, keyPc);
  }

  return (
    <div className="section-editor">
      <div className="section-actions">
        <button
          type="button"
          onClick={() => downloadMidi(composite(), `${neta.title ?? "section"}.mid`, tempo, neta.meter)}
        >
          MIDI
        </button>
      </div>

      <div className="lanes" aria-label="timeline" ref={tp.scrollerRef}>
        <div className="playhead" aria-hidden="true" ref={tp.lineRef} />
        <div className="lane-ruler">
          <div className="lane-label" />
          <div className="ruler-bars">
            {Array.from({ length: BARS }, (_, b) => (
              <div key={b} className="bar-num">
                {b + 1}
              </div>
            ))}
          </div>
        </div>
        {LANES.map((lane) => (
          <div className="lane" key={lane.key}>
            <div className="lane-label">{lane.label}</div>
            <div className="lane-track">
              {Array.from({ length: BARS }, (_, b) => (
                <LaneCell
                  key={b}
                  laneKey={lane.key}
                  kinds={lane.kinds}
                  bar={b}
                  position={b * BPB}
                  onTap={(pos) => void openPicker(lane, pos)}
                />
              ))}
              {laneChildren(lane).map((c) => (
                <button
                  key={`${c.node.neta.id}@${c.position}`}
                  type="button"
                  className="lane-block"
                  data-kind={c.node.neta.kind}
                  aria-label={`block-${c.node.neta.id}@${c.position}`}
                  title={`${c.node.neta.title ?? c.node.neta.text ?? ""} @${c.position}拍 — タップで外す`}
                  style={{
                    left: `${(c.position / TOTAL) * 100}%`,
                    width: `${(Math.min(childDur(c), TOTAL - c.position) / TOTAL) * 100}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(c.node.neta.id, c.position);
                  }}
                >
                  {(c.node.neta.title ?? c.node.neta.text ?? "").slice(0, 8)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="muted lanes-hint">空きをタップ→置くネタを選ぶ／ブロックをタップで外す</p>

      {others.length > 0 && (
        <div className="section-others">
          <span className="muted">その他：</span>
          {others.map((c) => (
            <span key={`${c.node.neta.id}@${c.position}`} className="rel-item">
              {c.node.neta.kind} @{c.position}
              <button
                type="button"
                aria-label={`remove-${c.node.neta.id}@${c.position}`}
                onClick={() => void remove(c.node.neta.id, c.position)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {picker && (
        <div className="dialog-backdrop" onClick={() => setPicker(null)}>
          <div
            className="dialog"
            role="dialog"
            aria-label="place-picker"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <span>
                {picker.lane.label}を {picker.position / BPB + 1} 小節目に置く
              </span>
              <button aria-label="close" onClick={() => setPicker(null)}>
                ✕
              </button>
            </header>
            <input
              aria-label="picker-search"
              className="editor-tags"
              placeholder="絞り込み…"
              value={pq}
              onChange={(e) => setPq(e.target.value)}
            />
            <div className="picker-list">
              {(() => {
                const list = picker.cands.filter((n) =>
                  (n.title ?? n.text ?? "").toLowerCase().includes(pq.toLowerCase()),
                );
                if (list.length === 0)
                  return <p className="muted">置ける{picker.lane.label}のネタがありません</p>;
                return list.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="bs-option"
                    onClick={() => void placeAt(n)}
                  >
                    <strong>{n.title ?? n.text ?? "(無題)"}</strong>
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
      <TransportBar
        state={tp.state}
        loopOn={tp.loopOn}
        timeRef={tp.timeRef}
        onPlayPause={tp.playPause}
        onRewind={tp.rewind}
        onToggleLoop={tp.toggleLoop}
      />
    </div>
  );
}
