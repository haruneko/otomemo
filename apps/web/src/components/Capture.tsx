import { useState, type FormEvent } from "react";
import { api, KINDS, type Neta } from "../api";

// 摩擦ゼロの捕獲（要件）。本文1個＋kind＋任意タグ＋「放り込む」。
const TEXT_KINDS = new Set(["lyric", "theme", "knowledge", "other"]);

export function Capture({ onCreated }: { onCreated?: (n: Neta) => void }) {
  const [kind, setKind] = useState<string>("lyric");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const tagList = tags
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      // 音楽系は title 扱い（中身=contentはエディタで後付け＝S4）、言葉系は text。
      const input = TEXT_KINDS.has(kind)
        ? { kind, text: body.trim(), tags: tagList }
        : { kind, title: body.trim(), tags: tagList };
      const n = await api.createNeta(input);
      setBody("");
      setTags("");
      onCreated?.(n);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form aria-label="capture" onSubmit={submit}>
      <select aria-label="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <textarea
        aria-label="body"
        placeholder="放り込む…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <input
        aria-label="tags"
        placeholder="タグ（スペース区切り）"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />
      <button type="submit" disabled={busy || !body.trim()}>
        放り込む
      </button>
    </form>
  );
}
