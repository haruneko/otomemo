import { useEffect, useState } from "react";
import { api, type Neta } from "../api";
import { moraLines } from "../lyrics";
import { useTransport } from "../useTransport";
import { TransportBar } from "./TransportBar";
import { NumberField } from "./NumberField";
import { PianoRoll } from "./PianoRoll";
import { StepPad } from "./StepPad";
import { ChordEditor } from "./ChordEditor";
import { RhythmEditor } from "./RhythmEditor";
import { SectionEditor } from "./SectionEditor";
import {
  notesOf,
  chordsOf,
  chordsToNotes,
  rhythmOf,
  rhythmToNotes,
  downloadMidi,
  programOf,
  GM_INSTRUMENTS,
  type Note,
  type ChordEntry,
  type RhythmContent,
} from "../music";

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function NetaDialog({
  neta,
  onClose,
  onChanged,
  reloadSignal,
}: {
  neta: Neta;
  onClose: () => void;
  onChanged?: () => void;
  reloadSignal?: number; // D&D配置などの外部更新でSectionEditorを再読込
}) {
  const [title, setTitle] = useState(neta.title ?? "");
  const [text, setText] = useState(neta.text ?? "");
  const [tags, setTags] = useState(neta.tags.join(" "));
  const [notes, setNotes] = useState<Note[]>(notesOf(neta.content));
  const [chords, setChords] = useState<ChordEntry[]>(chordsOf(neta.content));
  const [rhythm, setRhythm] = useState<RhythmContent>(rhythmOf(neta.content));
  const [key, setKey] = useState<number>(neta.key ?? 0);
  const [tempo, setTempo] = useState<number>(neta.tempo ?? 120);
  const [meter, setMeter] = useState<string>(neta.meter ?? "4/4");
  const [program, setProgram] = useState<number>(programOf(neta.content) ?? 0); // #47 GM音色
  const [melodyView, setMelodyView] = useState<"roll" | "pad">("roll"); // #35 ロール/パッド
  const [mood, setMood] = useState(neta.mood ?? "");
  const [len, setLen] = useState(() =>
    Math.max(16, (neta.bars ?? 0) * 4, ...notesOf(neta.content).map((n) => Math.ceil(n.start + n.dur))),
  );
  const [busy, setBusy] = useState(false);
  const [rels, setRels] = useState<{ type: string; neta: Neta | null }[]>([]);
  const [schedId, setSchedId] = useState<string | null>(null); // #80 継続調査スケジュール
  const isMelody = neta.kind === "melody";
  const isBass = neta.kind === "bass"; // #bass S1 絶対モード＝melodyと同型・低域ピアノロール
  const isChord = neta.kind === "chord" || neta.kind === "chord_progression";
  const isRhythm = neta.kind === "rhythm";
  const isContainer = neta.kind === "section" || neta.kind === "song";
  const isMusic = isMelody || isBass || isChord || isRhythm;
  // ソロ編集は見た目=実音（WYSIWYG）＝トランスポーズしない。調支配は合成(SectionEditor)側。
  const playable = isMelody || isBass ? notes : isChord ? chordsToNotes(chords) : rhythmToNotes(rhythm);

  // #57/#58/#59 トランスポート（再生/一時停止/頭出し/ループ＋プレイヘッド＋小節:拍）。
  // melody ロールは span 尺で赤線が走る。単体エディタは拍子を持たない＝小節は4拍既定。
  const span = Math.max(len, ...playable.map((n) => Math.ceil(n.start + n.dur)));
  // #55c rhythm はドラム＝program無関係。melody/chord はネタの音色を SF2 旋律に反映。
  const tp = useTransport(() => playable, tempo, {
    scaleBeats: span,
    bpb: 4,
    program: isRhythm ? undefined : program,
  });

  // Space=再生/停止（design #58/#59）。入力中は無効。音楽ネタのときだけ。
  useEffect(() => {
    if (!isMusic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      // フォーカスが操作要素(入力/ボタン/リンク)にある時はその native 動作を優先（横取りしない）
      const t = e.target as HTMLElement;
      if (t.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
      e.preventDefault();
      tp.playPause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMusic, tp.playPause]);

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

  // #80 テキスト系ネタは「継続して調べる」テーマになりうる（見てない間に research を回す）
  const isThemeable = !isMusic && !isContainer;
  useEffect(() => {
    if (!isThemeable) return;
    let on = true;
    void Promise.resolve(api.listSchedules?.(neta.id))
      .then((ss) => {
        if (on && ss) setSchedId(ss.find((s) => s.intent === "research" && s.enabled)?.id ?? null);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [neta.id, isThemeable]);

  async function toggleSchedule() {
    if (schedId) {
      await api.deleteSchedule(schedId).catch(() => {});
      setSchedId(null);
    } else {
      const s = await api.addSchedule({ neta_id: neta.id, intent: "research" });
      setSchedId(s.id);
    }
  }

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
        ...(isMelody || isBass
          ? { content: { notes, program }, key, tempo, bars: Math.ceil(len / 4) }
          : isChord
            ? { content: { chords, program }, key, tempo }
            : isRhythm
              ? { content: { rhythm }, tempo }
              : isContainer
                ? { key, tempo, meter }
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

  // メインペーンの中身として描画（design #19：選択中netaの種類で中身が入れ替わる）。
  // 旧：音楽=全画面オーバーレイ／テキスト=中央モーダル → 1つのペーン内容に統一。
  const showKey = (isMusic || isContainer) && !isRhythm; // 調（rhythm以外の音楽/section）
  const showMeta = isMusic || isContainer; // テンポ

  return (
    <div className="mainpane-editor" role="dialog" aria-label="edit-neta">
      <div className="editor-bar">
        <button className="back" onClick={onClose} aria-label="close">
          ← 戻る
        </button>
        <span className="kind" data-kind={neta.kind}>
          {neta.kind}
        </span>
        <input
          aria-label="title"
          className="editor-title"
          placeholder="タイトル"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {showKey && (
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
        {showMeta && (
          <label className="meta">
            ♩
            <NumberField aria-label="tempo" min={20} max={300} value={tempo} onChange={setTempo} />
          </label>
        )}
        {isContainer && (
          <label className="meta">
            拍子
            <select aria-label="meter" value={meter} onChange={(e) => setMeter(e.target.value)}>
              {["4/4", "3/4", "6/8", "2/4", "5/4", "12/8"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
        {(isMelody || isChord) && (
          <label className="meta">
            音色
            <select
              aria-label="program"
              value={program}
              onChange={(e) => setProgram(Number(e.target.value))}
            >
              {GM_INSTRUMENTS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {isMusic && (
          <button
            type="button"
            onClick={() =>
              downloadMidi(
                playable,
                `${neta.title ?? "sketch"}.mid`,
                tempo,
                null,
                isRhythm ? undefined : program,
              )
            }
          >
            MIDI
          </button>
        )}
        {isThemeable && (
          <button
            type="button"
            className={schedId ? "primary" : ""}
            aria-label="continuous-research"
            title="このテーマを見てない間も継続して調べ、参考をトレイに溜める"
            onClick={() => void toggleSchedule()}
          >
            {schedId ? "🔁 継続調査中" : "🔁 継続して調べる"}
          </button>
        )}
        <span className="spacer" />
        <button className="danger" onClick={remove} disabled={busy}>
          削除
        </button>
        <button className="primary" onClick={save} disabled={busy}>
          保存
        </button>
      </div>
      <div className="editor-meta-row">
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
      </div>
      <div className="editor-body">
        {isMelody || isBass ? (
          <div className="melody-input">
            <div className="input-toggle">
              <button
                type="button"
                className={melodyView === "roll" ? "on" : ""}
                onClick={() => setMelodyView("roll")}
              >
                ロール
              </button>
              <button
                type="button"
                className={melodyView === "pad" ? "on" : ""}
                onClick={() => setMelodyView("pad")}
              >
                パッド
              </button>
            </div>
            {melodyView === "roll" ? (
              <PianoRoll
                notes={notes}
                onChange={setNotes}
                beats={len}
                low={isBass ? 28 : undefined}
                high={isBass ? 55 : undefined}
                playheadRef={tp.lineRef}
                scrollerRef={tp.scrollerRef}
              />
            ) : (
              <StepPad
                notes={notes}
                onChange={setNotes}
                playheadRef={tp.lineRef}
                scrollerRef={tp.scrollerRef}
              />
            )}
          </div>
        ) : isChord ? (
          <ChordEditor chords={chords} onChange={setChords} beatRef={tp.beatRef} playing={tp.playing} />
        ) : isRhythm ? (
          <RhythmEditor
            rhythm={rhythm}
            onChange={setRhythm}
            playheadRef={tp.lineRef}
            scrollerRef={tp.scrollerRef}
          />
        ) : isContainer ? (
          <SectionEditor
            neta={neta}
            keyPc={key}
            tempo={tempo}
            meter={meter}
            reloadSignal={reloadSignal}
            onChanged={onChanged}
          />
        ) : (
          <div className="text-editor">
            <textarea
              aria-label="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
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
          </div>
        )}
      </div>
      {isMusic && (
        <TransportBar
          state={tp.state}
          loopOn={tp.loopOn}
          timeRef={tp.timeRef}
          onPlayPause={tp.playPause}
          onRewind={tp.rewind}
          onToggleLoop={tp.toggleLoop}
        />
      )}
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
    </div>
  );
}
