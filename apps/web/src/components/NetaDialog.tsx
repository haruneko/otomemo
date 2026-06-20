import { useState } from "react";
import { api, type Neta } from "../api";
import { PianoRoll } from "./PianoRoll";
import { notesOf, playNotes, downloadMidi, transpose, type Note } from "../music";

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function NetaDialog({
  neta,
  onClose,
  onChanged,
}: {
  neta: Neta;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [title, setTitle] = useState(neta.title ?? "");
  const [text, setText] = useState(neta.text ?? "");
  const [tags, setTags] = useState(neta.tags.join(" "));
  const [notes, setNotes] = useState<Note[]>(notesOf(neta.content));
  const [key, setKey] = useState<number>(neta.key ?? 0);
  const [tempo, setTempo] = useState<number>(neta.tempo ?? 120);
  const [busy, setBusy] = useState(false);
  const isMelody = neta.kind === "melody";

  async function save() {
    setBusy(true);
    try {
      await api.updateNeta(neta.id, {
        title: title.trim() || null,
        text: text.trim() || null,
        tags: tags
          .split(/[,\s]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        ...(isMelody ? { content: { notes }, key, tempo } : {}),
      });
      onChanged?.();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("このネタを削除しますか？")) return;
    setBusy(true);
    try {
      await api.deleteNeta(neta.id);
      onChanged?.();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-label="edit-neta"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <span className="kind" data-kind={neta.kind}>
            {neta.kind}
          </span>
          <button onClick={onClose} aria-label="close">
            ✕
          </button>
        </header>
        <input
          aria-label="title"
          placeholder="タイトル"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea aria-label="text" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
        <input
          aria-label="tags"
          placeholder="タグ（スペース区切り）"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        {isMelody && (
          <div className="melody-editor">
            <div className="melody-meta">
              <label>
                調
                <select
                  aria-label="key"
                  value={key}
                  onChange={(e) => setKey(Number(e.target.value))}
                >
                  {KEY_NAMES.map((nm, i) => (
                    <option key={i} value={i}>
                      {nm}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                テンポ
                <input
                  aria-label="tempo"
                  type="number"
                  min={20}
                  max={300}
                  value={tempo}
                  onChange={(e) => setTempo(Number(e.target.value))}
                />
              </label>
            </div>
            <PianoRoll notes={notes} onChange={setNotes} />
            <div className="melody-actions">
              <button type="button" onClick={() => void playNotes(transpose(notes, key), tempo)}>
                ▶ 再生
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadMidi(transpose(notes, key), `${neta.title ?? "sketch"}.mid`, tempo)
                }
              >
                MIDI書き出し
              </button>
            </div>
          </div>
        )}
        <div className="dialog-actions">
          <button className="danger" onClick={remove} disabled={busy}>
            削除
          </button>
          <span className="spacer" />
          <button onClick={onClose} disabled={busy}>
            閉じる
          </button>
          <button className="primary" onClick={save} disabled={busy}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
