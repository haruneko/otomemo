import { useState } from "react";
import { api, type Neta } from "../api";
import { PianoRoll } from "./PianoRoll";
import { notesOf, playNotes, downloadMidi, type Note } from "../music";

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
        ...(isMelody ? { content: { notes } } : {}),
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
            <PianoRoll notes={notes} onChange={setNotes} />
            <div className="melody-actions">
              <button type="button" onClick={() => void playNotes(notes)}>
                ▶ 再生
              </button>
              <button
                type="button"
                onClick={() => downloadMidi(notes, `${neta.title ?? "sketch"}.mid`)}
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
