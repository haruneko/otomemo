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
  disabled,
}: {
  laneKey: string;
  kinds: readonly string[];
  bar: number;
  position: number;
  onTap: (position: number) => void;
  disabled?: boolean; // 単一パートが埋まってる＝置けない（CV3）
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${laneKey}-${bar}`, data: { kinds, position }, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={"lane-cell" + (isOver ? " over" : "") + (disabled ? " locked" : "")}
      aria-label={`place-${laneKey}-${bar}`}
      disabled={disabled}
      onClick={() => !disabled && onTap(position)}
    />
  );
}
import {
  notesForContent,
  compositeNotes,
  downloadMidi,
  downloadMultitrackMidi,
  type Note,
} from "../music";
import { MiniRoll } from "./MiniRoll";

// 配置タイムライン（design #19）。section/song を メロ/コード/ベース/リズムの4レーン×小節 で組む。
// レーンは子の kind から導出（スキーマ変更なし）。空セルをタップ→ネタを選んで置く。
// 調/テンポは section が支配。rhythm(ドラム)は移調しない。
// レーン順＝層モデル（進行が一番上→メロ→コード楽器→ベース→リズム→ネスト）。
// 配置は「占有セルのみ不可」＝同じ位置に二重で置けないだけ（別小節には自由に置ける・CV3 是正）。
const LANES = [
  { key: "chord", label: "コード進行", kinds: ["chord", "chord_progression"] },
  { key: "melody", label: "メロ", kinds: ["melody"] },
  { key: "chord_pattern", label: "コード楽器", kinds: ["chord_pattern"] },
  { key: "bass", label: "ベース", kinds: ["bass"] },
  { key: "rhythm", label: "リズム", kinds: ["rhythm"] },
  { key: "section", label: "セクション", kinds: ["section"] }, // #15 section をネスト配置
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

// #83/#55 曲(song)の段階・次の一手パネル。song overlay を読み込み、編集して保存（blur時）。
function SongStatus({ netaId }: { netaId: string }) {
  const [stage, setStage] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let live = true;
    void api.getSong(netaId).then((s) => {
      if (live && s) {
        setStage(s.stage ?? "");
        setNextAction(s.next_action ?? "");
      }
    });
    return () => {
      live = false;
    };
  }, [netaId]);
  async function save() {
    await api.updateSong(netaId, { stage: stage || null, next_action: nextAction || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  return (
    <div className="song-status">
      <label>
        段階
        <input
          value={stage}
          placeholder="ラフ / アレンジ / 詞 / ミックス…"
          onChange={(e) => setStage(e.target.value)}
          onBlur={save}
        />
      </label>
      <label>
        次の一手
        <input
          value={nextAction}
          placeholder="サビのメロを詰める…"
          onChange={(e) => setNextAction(e.target.value)}
          onBlur={save}
        />
      </label>
      {saved && <span className="song-status-saved">✓</span>}
    </div>
  );
}

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
  const [picker, setPicker] = useState<{ lane: Lane; position: number; all: Neta[] } | null>(null);
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

  // その位置が既にブロックで埋まっているか（レーン全体でなく**占有セルだけ**不可＝別小節には置ける）。
  const occupiedAt = (lane: Lane, position: number) =>
    laneChildren(lane).some((c) => c.position <= position + 1e-6 && position < c.position + childDur(c) - 1e-6);
  async function openPicker(lane: Lane, position: number) {
    if (occupiedAt(lane, position)) return; // 既に埋まってる所には置かせない（CV3・占有セルのみ）
    // project＋library 両方を候補に（library=連想元コーパス・椎名林檎等）。種別は picker 内で切替。
    const all = await api.listNeta({ scope: "all", limit: 2000 });
    setPq("");
    setPicker({ lane, position, all });
  }
  async function placeAt(child: Neta) {
    if (!picker) return;
    try {
      // ライブラリ項目は project にコピーしてから配置（元コーパスを汚さない・編集はコピー側）。
      const target = child.scope === "library" ? await api.copyNeta(child.id) : child;
      await api.placeChild(neta.id, target.id, picker.position, children.length);
    } catch {
      // section ネストで循環になる配置は core が拒否（400）→ そっと無視（配置しない）
      setPicker(null);
      return;
    }
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
    return compositeNotes(children, keyPc, neta.mode);
  }
  // #55 多トラック書出：レーン(メロ/コード/ベース/リズム)別に1トラックずつ。空レーンは省く。
  function laneTracks() {
    return LANES.map((lane) => ({
      name: lane.label,
      notes: compositeNotes(laneChildren(lane), keyPc, neta.mode),
      drum: lane.key === "rhythm",
    })).filter((t) => t.notes.length);
  }

  return (
    <div className="section-editor">
      {neta.kind === "song" && <SongStatus netaId={neta.id} />}
      <div className="section-actions">
        <button
          type="button"
          onClick={() => downloadMidi(composite(), `${neta.title ?? "section"}.mid`, tempo, neta.meter)}
        >
          MIDI
        </button>
        <button
          type="button"
          title="メロ/コード/ベース/リズムを別トラックに分けて書き出す"
          onClick={() =>
            downloadMultitrackMidi(laneTracks(), `${neta.title ?? "section"}-tracks.mid`, tempo, neta.meter)
          }
        >
          MIDI(分割)
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
                  disabled={occupiedAt(lane, b * BPB)}
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
                  <MiniRoll neta={c.node.neta} />
                  <span className="lane-block-label">
                    {c.node.neta.title ?? c.node.neta.text ?? c.node.neta.kind}
                  </span>
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
              <span>{picker.position / BPB + 1} 小節目に置く</span>
              <button aria-label="close" onClick={() => setPicker(null)}>
                ✕
              </button>
            </header>
            {/* 種別を選ぶ（セクション or パート＝メロ/コード/ベース/リズム）。 */}
            <div className="picker-kinds">
              {LANES.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  aria-label={`picker-kind-${l.key}`}
                  className={l.key === picker.lane.key ? "on" : ""}
                  onClick={() => setPicker((p) => (p ? { ...p, lane: l } : p))}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <input
              aria-label="picker-search"
              className="editor-tags"
              placeholder="絞り込み…（曲名・アーティスト）"
              value={pq}
              onChange={(e) => setPq(e.target.value)}
            />
            <div className="picker-list">
              {(() => {
                const q = pq.toLowerCase();
                const list = picker.all.filter(
                  (n) =>
                    inLane(picker.lane, n.kind) &&
                    n.id !== neta.id &&
                    (n.title ?? n.text ?? "").toLowerCase().includes(q),
                );
                if (list.length === 0)
                  return <p className="muted">置ける{picker.lane.label}のネタがありません</p>;
                return list.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="picker-item"
                    data-kind={n.kind}
                    onClick={() => void placeAt(n)}
                  >
                    <div className="picker-item-roll">
                      <MiniRoll neta={n} />
                    </div>
                    <div className="picker-item-meta">
                      <strong>{n.title ?? n.text ?? "(無題)"}</strong>
                      <span className="muted">
                        {n.kind}
                        {n.mood ? ` · ${n.mood}` : ""}
                        {n.key != null ? ` · ${["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][n.key]}` : ""}
                      </span>
                    </div>
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
