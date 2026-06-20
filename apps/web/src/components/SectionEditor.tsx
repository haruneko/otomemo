import { useCallback, useEffect, useState } from "react";
import { api, type Neta, type CompositionNode } from "../api";
import { notesForContent, playNotes, downloadMidi, type Note } from "../music";

// 配置タイムライン（design #19）。section/song を メロ/コード/リズムの3レーン×小節 で組む。
// レーンは子の kind から導出（スキーマ変更なし）。空セルをタップ→ネタを選んで置く。
// 調/テンポは section が支配。rhythm(ドラム)は移調しない。
const LANES = [
  { key: "melody", label: "メロ", kinds: ["melody"] },
  { key: "chord", label: "コード", kinds: ["chord", "chord_progression"] },
  { key: "rhythm", label: "リズム", kinds: ["rhythm"] },
] as const;
const BARS = 8;
const BPB = 4; // 4/4 の1小節=4拍
const TOTAL = BARS * BPB;

type Lane = (typeof LANES)[number];
type Child = CompositionNode["children"][number];

export function SectionEditor({
  neta,
  keyPc,
  tempo,
  onChanged,
}: {
  neta: Neta;
  keyPc: number;
  tempo: number;
  onChanged?: () => void;
}) {
  const [children, setChildren] = useState<Child[]>([]);
  const [picker, setPicker] = useState<{ lane: Lane; position: number; cands: Neta[] } | null>(null);
  const [pq, setPq] = useState(""); // ピッカーの絞り込み

  const load = useCallback(async () => {
    const tree = await api.getComposition(neta.id);
    setChildren(tree.children);
  }, [neta.id]);
  useEffect(() => {
    void load();
  }, [load]);

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
    const have = new Set(children.map((c) => c.node.neta.id));
    const cands = all.filter((n) => inLane(lane, n.kind) && n.id !== neta.id && !have.has(n.id));
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
  async function remove(childId: string) {
    await api.removeChild(neta.id, childId);
    await load();
    onChanged?.();
  }

  // 合成：子を section の調へ移調（rhythm除く）＋位置オフセット
  function composite(): Note[] {
    return children.flatMap((c) => {
      const isRhythm = c.node.neta.kind === "rhythm";
      return notesForContent(c.node.neta.kind, c.node.neta.content).map((n) => ({
        ...n,
        pitch: isRhythm ? n.pitch : n.pitch + keyPc,
        start: n.start + c.position,
      }));
    });
  }

  return (
    <div className="section-editor">
      <div className="section-actions">
        <button type="button" onClick={() => void playNotes(composite(), tempo)}>
          ▶ 合成再生
        </button>
        <button
          type="button"
          onClick={() => downloadMidi(composite(), `${neta.title ?? "section"}.mid`, tempo)}
        >
          MIDI
        </button>
      </div>

      <div className="lanes" aria-label="timeline">
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
                <button
                  key={b}
                  type="button"
                  className="lane-cell"
                  aria-label={`place-${lane.key}-${b}`}
                  onClick={() => void openPicker(lane, b * BPB)}
                />
              ))}
              {laneChildren(lane).map((c) => (
                <button
                  key={c.node.neta.id}
                  type="button"
                  className="lane-block"
                  data-kind={c.node.neta.kind}
                  aria-label={`block-${c.node.neta.id}`}
                  title={`${c.node.neta.title ?? c.node.neta.text ?? ""} @${c.position}拍 — タップで外す`}
                  style={{
                    left: `${(c.position / TOTAL) * 100}%`,
                    width: `${(Math.min(childDur(c), TOTAL - c.position) / TOTAL) * 100}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(c.node.neta.id);
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
            <span key={c.node.neta.id} className="rel-item">
              {c.node.neta.kind} @{c.position}
              <button
                type="button"
                aria-label={`remove-${c.node.neta.id}`}
                onClick={() => void remove(c.node.neta.id)}
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
    </div>
  );
}
