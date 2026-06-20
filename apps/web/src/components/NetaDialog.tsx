import { useEffect, useState } from "react";
import { api, type Neta } from "../api";
import { moraLines } from "../lyrics";
import { PianoRoll } from "./PianoRoll";
import { ChordEditor } from "./ChordEditor";
import { RhythmEditor } from "./RhythmEditor";
import { SectionEditor } from "./SectionEditor";
import {
  notesOf,
  chordsOf,
  chordsToNotes,
  rhythmOf,
  rhythmToNotes,
  playNotes,
  downloadMidi,
  type Note,
  type ChordEntry,
  type RhythmContent,
} from "../music";

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
  const [chords, setChords] = useState<ChordEntry[]>(chordsOf(neta.content));
  const [rhythm, setRhythm] = useState<RhythmContent>(rhythmOf(neta.content));
  const [key, setKey] = useState<number>(neta.key ?? 0);
  const [tempo, setTempo] = useState<number>(neta.tempo ?? 120);
  const [mood, setMood] = useState(neta.mood ?? "");
  const [len, setLen] = useState(() =>
    Math.max(16, (neta.bars ?? 0) * 4, ...notesOf(neta.content).map((n) => Math.ceil(n.start + n.dur))),
  );
  const [busy, setBusy] = useState(false);
  const [rels, setRels] = useState<{ type: string; neta: Neta | null }[]>([]);
  const isMelody = neta.kind === "melody";
  const isChord = neta.kind === "chord" || neta.kind === "chord_progression";
  const isRhythm = neta.kind === "rhythm";
  const isContainer = neta.kind === "section" || neta.kind === "song";
  const isMusic = isMelody || isChord || isRhythm;
  // ソロ編集は見た目=実音（WYSIWYG）＝トランスポーズしない。調支配は合成(SectionEditor)側。
  const playable = isMelody ? notes : isChord ? chordsToNotes(chords) : rhythmToNotes(rhythm);

  // 連関（このネタから生成/関連したネタ）を表示
  useEffect(() => {
    let on = true;
    void Promise.resolve(api.getRelations?.(neta.id))
      .then((r) => {
        if (on && r) setRels(r);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [neta.id]);

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
        mood: mood.trim() || null,
        ...(isMelody
          ? { content: { notes }, key, tempo, bars: Math.ceil(len / 4) }
          : isChord
            ? { content: { chords }, key, tempo }
            : isRhythm
              ? { content: { rhythm }, tempo }
              : isContainer
                ? { key, tempo }
                : {}),
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

  // 音楽の編集は面が要るので全画面オーバーレイ（design.md GUI #19 の決定）
  if (isMusic || isContainer) {
    return (
      <div className="editor-full" role="dialog" aria-label="edit-neta">
        <div className="editor-bar">
          <button className="back" onClick={onClose} aria-label="close">
            ← 戻る
          </button>
          <input
            aria-label="title"
            className="editor-title"
            placeholder="タイトル"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {!isRhythm && (
            <label className="meta">
              調
              <select aria-label="key" value={key} onChange={(e) => setKey(Number(e.target.value))}>
                {KEY_NAMES.map((nm, i) => (
                  <option key={i} value={i}>
                    {nm}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isMelody && (
            <button type="button" onClick={() => setLen(len + 4)}>
              ＋4拍
            </button>
          )}
          <label className="meta">
            ♩
            <input
              aria-label="tempo"
              type="number"
              min={20}
              max={300}
              value={tempo}
              onChange={(e) => setTempo(Number(e.target.value))}
            />
          </label>
          {isMusic && (
            <>
              <button type="button" onClick={() => void playNotes(playable, tempo)}>
                ▶ 再生
              </button>
              <button
                type="button"
                onClick={() => downloadMidi(playable, `${neta.title ?? "sketch"}.mid`, tempo)}
              >
                MIDI
              </button>
            </>
          )}
          <button className="danger" onClick={remove} disabled={busy}>
            削除
          </button>
          <button className="primary" onClick={save} disabled={busy}>
            保存
          </button>
        </div>
        <input
          aria-label="tags"
          className="editor-tags"
          placeholder="タグ（スペース区切り）"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <input
          aria-label="mood"
          className="editor-tags"
          placeholder="ムード（任意・例：切ない/疾走）"
          value={mood}
          onChange={(e) => setMood(e.target.value)}
        />
        <div className="editor-body">
          {isMelody ? (
            <PianoRoll notes={notes} onChange={setNotes} beats={len} />
          ) : isChord ? (
            <ChordEditor chords={chords} onChange={setChords} />
          ) : isRhythm ? (
            <RhythmEditor rhythm={rhythm} onChange={setRhythm} />
          ) : (
            <SectionEditor neta={neta} keyPc={key} tempo={tempo} onChanged={onChanged} />
          )}
        </div>
      </div>
    );
  }

  // 軽い編集（歌詞・テーマ等のテキスト）は中央ダイアログ
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
        {neta.kind === "lyric" && text.trim() && (
          <div className="mora-panel" aria-label="mora">
            {moraLines(text).map((m, i) => (
              <div key={i} className="mora-line">
                <span className="mora-count">{m.count}</span>
                <span className="mora-text">{m.line || "　"}</span>
              </div>
            ))}
          </div>
        )}
        <input
          aria-label="tags"
          placeholder="タグ（スペース区切り）"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <input
          aria-label="mood"
          placeholder="ムード（任意・例：切ない/疾走）"
          value={mood}
          onChange={(e) => setMood(e.target.value)}
        />
        {rels.length > 0 && (
          <div className="relations">
            <span className="rel-label">関連</span>
            {rels.map(
              (r, i) =>
                r.neta && (
                  <span key={i} className="rel-item">
                    {r.neta.kind}: {(r.neta.title ?? r.neta.text ?? "(無題)").slice(0, 16)}
                  </span>
                ),
            )}
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
