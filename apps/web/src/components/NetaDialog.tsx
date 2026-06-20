import { useState } from "react";
import { api, type Neta } from "../api";

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
  const [busy, setBusy] = useState(false);

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
