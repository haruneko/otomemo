import { useCallback, useEffect, useState } from "react";
import { api, type Neta, type CompositionNode } from "../api";
import { notesForContent, playNotes, downloadMidi, type Note } from "../music";

// つなぎ込み（design #19 配置タイムライン）。section/song に子を時間配置し、合成して鳴らす。
// 調/テンポは section が支配（design #14）。子の content を位置オフセットで合成。
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
  const [children, setChildren] = useState<CompositionNode["children"]>([]);
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Neta[]>([]);

  const load = useCallback(async () => {
    const tree = await api.getComposition(neta.id);
    setChildren(tree.children);
  }, [neta.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function search(v: string) {
    setQ(v);
    if (!v.trim()) {
      setMatches([]);
      return;
    }
    const r = await api.listNeta({ q: v.trim() });
    const have = new Set(children.map((c) => c.node.neta.id));
    setMatches(r.filter((n) => n.id !== neta.id && !have.has(n.id)).slice(0, 6));
  }

  async function add(child: Neta) {
    const pos = children.length ? Math.max(...children.map((c) => c.position)) + 4 : 0;
    await api.placeChild(neta.id, child.id, pos, children.length);
    setQ("");
    setMatches([]);
    await load();
    onChanged?.();
  }

  async function remove(childId: string) {
    await api.removeChild(neta.id, childId);
    await load();
    onChanged?.();
  }

  async function setPos(childId: string, pos: number) {
    const ch = children.find((c) => c.node.neta.id === childId);
    await api.placeChild(neta.id, childId, pos, ch?.ord ?? 0); // ord を保持（潰さない）
    await load();
  }

  function childDur(c: CompositionNode["children"][number]): number {
    const ns = notesForContent(c.node.neta.kind, c.node.neta.content);
    return ns.length ? Math.max(...ns.map((n) => n.start + n.dur)) : 4;
  }

  // 合成：子を section の調へ移調＋位置オフセット。ただし rhythm(GMドラム)は移調しない。
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

  const total = Math.max(8, ...children.map((c) => c.position + childDur(c)));

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
      {children.length > 0 && (
        <div className="section-timeline" aria-label="timeline">
          {children.map((c) => (
            <div
              key={c.node.neta.id}
              className="tl-bar"
              data-kind={c.node.neta.kind}
              style={{
                left: `${(c.position / total) * 100}%`,
                width: `${(childDur(c) / total) * 100}%`,
              }}
              title={`${c.node.neta.kind} @${c.position}拍`}
            />
          ))}
        </div>
      )}
      <div className="section-children">
        {children.length === 0 && <p className="muted">子ネタを検索して追加</p>}
        {children.map((c) => (
          <div className="section-child" key={c.node.neta.id} data-kind={c.node.neta.kind}>
            <span className="kind">{c.node.neta.kind}</span>
            <span className="section-child-label">
              {c.node.neta.title ?? c.node.neta.text ?? "(無題)"}
            </span>
            <label>
              位置
              <input
                type="number"
                aria-label={`pos-${c.node.neta.id}`}
                value={c.position}
                onChange={(e) => void setPos(c.node.neta.id, Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              aria-label={`remove-${c.node.neta.id}`}
              onClick={() => void remove(c.node.neta.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <input
        aria-label="add-child"
        placeholder="ネタを検索して追加…"
        value={q}
        onChange={(e) => void search(e.target.value)}
      />
      {matches.length > 0 && (
        <div className="section-matches">
          {matches.map((m) => (
            <button key={m.id} type="button" onClick={() => void add(m)}>
              [{m.kind}] {(m.title ?? m.text ?? "").slice(0, 24)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
