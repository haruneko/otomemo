import { type ChordEntry } from "../music";

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const QUALITIES = [
  { v: "", label: "maj" },
  { v: "m", label: "min" },
  { v: "7", label: "7" },
  { v: "maj7", label: "maj7" },
  { v: "m7", label: "m7" },
  { v: "dim", label: "dim" },
  { v: "aug", label: "aug" },
  { v: "sus4", label: "sus4" },
  { v: "6", label: "6" },
  { v: "m6", label: "m6" },
  { v: "9", label: "9" },
];

// コード列の編集（design #19「コード入力（自作＋tonal.js）」）。C基準で root+quality を保存。
export function ChordEditor({
  chords,
  onChange,
}: {
  chords: ChordEntry[];
  onChange: (c: ChordEntry[]) => void;
}) {
  function update(i: number, patch: Partial<ChordEntry>) {
    onChange(chords.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  }
  function add() {
    const last = chords[chords.length - 1];
    const start = last ? last.start + last.dur : 0;
    onChange([...chords, { root: "C", quality: "", start, dur: 4 }]);
  }
  function remove(i: number) {
    onChange(chords.filter((_, k) => k !== i));
  }

  return (
    <div className="chord-editor">
      {chords.length === 0 && <p className="muted">「＋コード」で追加</p>}
      {chords.map((c, i) => (
        <div className="chord-row" key={i}>
          <span className="chord-sym">
            {c.root}
            {c.quality}
          </span>
          <select
            aria-label={`root-${i}`}
            value={c.root}
            onChange={(e) => update(i, { root: e.target.value })}
          >
            {ROOTS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            aria-label={`quality-${i}`}
            value={c.quality}
            onChange={(e) => update(i, { quality: e.target.value })}
          >
            {QUALITIES.map((q) => (
              <option key={q.v} value={q.v}>
                {q.label}
              </option>
            ))}
          </select>
          <label>
            開始
            <input
              type="number"
              aria-label={`start-${i}`}
              value={c.start}
              onChange={(e) => update(i, { start: Number(e.target.value) })}
            />
          </label>
          <label>
            長さ
            <input
              type="number"
              min={1}
              aria-label={`dur-${i}`}
              value={c.dur}
              onChange={(e) => update(i, { dur: Number(e.target.value) })}
            />
          </label>
          <button type="button" aria-label={`remove-chord-${i}`} onClick={() => remove(i)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="bs-btn" onClick={add}>
        ＋コード
      </button>
    </div>
  );
}
