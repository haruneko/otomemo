import { useEffect, useState } from "react";
import { api, type Neta, type NetaPatch } from "../api";
import { moraLines } from "../lyrics";
import { useTransport } from "../useTransport";
import { TransportBar } from "./TransportBar";
import { NumberField } from "./NumberField";
import { PianoRoll } from "./PianoRoll";
import { StepPad } from "./StepPad";
import { BassStepEditor } from "./BassStepEditor";
import { ChordEditor } from "./ChordEditor";
import { RhythmEditor } from "./RhythmEditor";
import { BarsControl } from "./BarsControl";
import { SectionEditor } from "./SectionEditor";
import { KindEditorBody } from "./KindEditorBody";
import {
  notesOf,
  chordsOf,
  chordsToNotes,
  rhythmOf,
  rhythmToNotes,
  downloadMidi,
  programOf,
  GM_INSTRUMENTS,
  isRelativeBass,
  resolveRelativeBass,
  isChordPattern,
  resolveChordPattern,
  emptyChordPattern,
  type Note,
  type ChordEntry,
  type RhythmContent,
  type BassStep,
  type ChordPatternContent,
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
  const [mode, setMode] = useState<string>(neta.mode ?? "major"); // 長調/短調（調号。メロ配置の相対移調に効く）
  const [candIdx, setCandIdx] = useState(0); // #9 調推定の候補サイクル位置
  // #9 コードから調(key+mode)を推定して宣言。クリックで候補を順に切替（Cmaj⇄Am 等の相対も選べる）。
  async function detectKey() {
    if (!chords.length) return;
    const r = await api.detectKeyFromChords(chords).catch(() => null);
    const cands = r?.candidates ?? [];
    if (!cands.length) return;
    const c = cands[candIdx % cands.length]!;
    setKey(c.key);
    setMode(c.mode);
    setCandIdx((candIdx + 1) % cands.length); // 次クリックで次候補
  }
  const [tempo, setTempo] = useState<number>(neta.tempo ?? 120);
  const [meter, setMeter] = useState<string>(neta.meter ?? "4/4");
  const [program, setProgram] = useState<number>(
    programOf(neta.content) ?? (neta.kind === "bass" ? 33 : 0), // #47 GM音色（bassは既定フィンガーベース）
  );
  const [melodyView, setMelodyView] = useState<"roll" | "pad">("roll"); // #35 ロール/パッド
  // #bass S2: 絶対(ピアノロール)/相対(度数グリッド)モード切替。content.mode から初期判別。
  const [bassMode, setBassMode] = useState<"absolute" | "relative">(
    isRelativeBass(neta.content) ? "relative" : "absolute",
  );
  const [bassPattern, setBassPattern] = useState<BassStep[]>(
    isRelativeBass(neta.content) ? neta.content.pattern : [],
  );
  const [bassSteps, setBassSteps] = useState<number>(() =>
    isRelativeBass(neta.content) ? (neta.content.steps ?? 32) : 32,
  ); // 相対ベースの小節数（16step=1小節）。既定2小節。
  const [mood, setMood] = useState(neta.mood ?? "");
  const [len, setLen] = useState(() =>
    Math.max(16, (neta.bars ?? 0) * 4, ...notesOf(neta.content).map((n) => Math.ceil(n.start + n.dur))),
  );
  // 弱起（アウフタクト）：拍0の前の lead-in 拍数。既存の負 start を包む値で初期化。
  const [pickup, setPickup] = useState(() => Math.max(0, Math.ceil(-Math.min(0, ...notesOf(neta.content).map((n) => n.start)))));
  const [chordPat, setChordPat] = useState<ChordPatternContent>(() => (isChordPattern(neta.content) ? neta.content : emptyChordPattern()));
  const [busy, setBusy] = useState(false);
  const [rels, setRels] = useState<{ type: string; neta: Neta | null }[]>([]);
  const [schedId, setSchedId] = useState<string | null>(null); // #80 継続調査スケジュール
  const isMelody = neta.kind === "melody";
  const isBass = neta.kind === "bass"; // #bass S1 絶対モード＝melodyと同型・低域ピアノロール
  const isChord = neta.kind === "chord" || neta.kind === "chord_progression";
  const isChordPat = neta.kind === "chord_pattern"; // CP3 コード楽器パターン（進行に解決する相対型）
  const isRhythm = neta.kind === "rhythm";
  const isContainer = neta.kind === "section" || neta.kind === "song";
  const isMusic = isMelody || isBass || isChord || isChordPat || isRhythm;
  const isRelBass = isBass && bassMode === "relative"; // #bass S2 相対モード
  // 弱起ぶんの lead-in（指定 pickup と既存の負 start を包む）。ソロ再生はこの分だけ前へずらして鳴らす
  // ＝弱起→ダウンビートの順で聞こえる（PianoRoll も同じ pre で描画）。
  const pre = Math.max(0, pickup, Math.ceil(-Math.min(0, ...notesOf(neta.content).map((n) => n.start), ...notes.map((n) => n.start))));
  // ソロ編集は見た目=実音（WYSIWYG）＝トランスポーズしない。調支配は合成(SectionEditor)側。
  // 相対bass は単体プレビュー＝調(key)を tonic に度数解決して鳴らす（実音高）。
  const playable = isRelBass
    ? resolveRelativeBass(bassPattern, [], key)
    : isChordPat
      ? resolveChordPattern(chordPat, [], key) // 単体プレビュー＝key の tonic コードに解決
      : isMelody || isBass
        ? notes.map((n) => ({ ...n, start: n.start + pre })) // 弱起ぶん前へ＝負拍も0以降で鳴る
        : isChord
          ? chordsToNotes(chords)
          : rhythmToNotes(rhythm);

  // #57/#58/#59 トランスポート（再生/一時停止/頭出し/ループ＋プレイヘッド＋小節:拍）。
  // melody ロールは span 尺で赤線が走る。単体エディタは拍子を持たない＝小節は4拍既定。
  const span = Math.max(len, ...playable.map((n) => Math.ceil(n.start + n.dur)));
  // #55c rhythm はドラム＝program無関係。melody/chord はネタの音色を SF2 旋律に反映。
  const tp = useTransport(() => playable, tempo, {
    scaleBeats: span,
    bpb: 4,
    program: isRhythm ? undefined : isChord ? 48 : program, // コード進行は抽象＝固定GM49(strings)・選択不可(CP1)
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

  // kind ごとの保存パッチ（旧：5分岐三項ネスト → if-chain で平坦化）。C基準保存・調/拍はヒント。
  function savePatch(): NetaPatch {
    if (isRelBass)
      // #bass S2 相対モード：度数パターンを保存（再生時にコード/調で解決）。
      return { content: { mode: "relative", steps: bassSteps, pattern: bassPattern, program }, key, mode, tempo, bars: Math.max(1, Math.round(bassSteps / 16)) };
    if (isMelody || isBass) return { content: { notes, program }, key, mode, tempo, bars: Math.ceil(len / 4) };
    if (isChordPat) return { content: { ...chordPat, program }, key, mode, tempo }; // コード楽器＝自前音色
    if (isChord) return { content: { chords }, key, mode, tempo }; // 進行は抽象＝program持たない(CP1)
    if (isRhythm) return { content: { rhythm }, tempo };
    if (isContainer) return { key, mode, tempo, meter };
    return {};
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
        ...savePatch(),
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
        {/* 保存/削除は常に右端固定・2つで1グループ＝スマホでも分離せず一緒に右上へ収まる。 */}
        <span className="spacer" />
        <span className="editor-actions">
          <button className="danger" onClick={remove} disabled={busy}>
            削除
          </button>
          <button className="primary" onClick={save} disabled={busy}>
            保存
          </button>
        </span>
      </div>
      {/* 属性行：調→長短→拍子→テンポ→音色→アクション の統一順。非該当kindはその枠を出さないだけ。 */}
      <div className="editor-attrs">
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
            <select aria-label="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="major">長調</option>
              <option value="minor">短調</option>
            </select>
          </label>
        )}
        {isChord && chords.length > 0 && (
          <button
            type="button"
            aria-label="detect-key"
            title="コードから調を推定して設定（クリックで候補=Cmaj/Am 等を順に切替）"
            onClick={() => void detectKey()}
          >
            調を推定
          </button>
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
        {showMeta && (
          <label className="meta">
            ♩
            <NumberField aria-label="tempo" min={20} max={300} value={tempo} onChange={setTempo} />
          </label>
        )}
        {(isMelody || isBass || isChordPat) && (
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
        {isMelody && (
          <button type="button" onClick={() => setLen(len + 4)}>
            ＋4拍
          </button>
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
                isRhythm ? undefined : isChord ? 48 : program, // 進行は固定GM49(CP1)
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
      <KindEditorBody
        neta={neta}
        flags={{ isMelody, isBass, isChord, isChordPat, isRhythm, isContainer, isRelBass }}
        notes={notes} setNotes={setNotes}
        chordPat={chordPat} setChordPat={setChordPat}
        chords={chords} setChords={setChords}
        rhythm={rhythm} setRhythm={setRhythm}
        bassPattern={bassPattern} setBassPattern={setBassPattern}
        bassSteps={bassSteps} setBassSteps={setBassSteps}
        bassMode={bassMode} setBassMode={setBassMode}
        melodyView={melodyView} setMelodyView={setMelodyView}
        len={len} setLen={setLen}
        pickup={pre} setPickup={setPickup}
        text={text} setText={setText}
        keyPc={key} tempo={tempo} meter={meter}
        reloadSignal={reloadSignal} onChanged={onChanged}
        tp={{ lineRef: tp.lineRef, scrollerRef: tp.scrollerRef, beatRef: tp.beatRef, playing: tp.playing }}
      />
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
