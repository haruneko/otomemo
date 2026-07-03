// 編集画面の"脳"（共通パーツ化 CP3・design「編集画面の共通パーツ化」）。
// NetaDialog が抱えていた state/派生/effect/アクション/history/transport を集約。
// NetaDialog は本フックの返りを各共有UI(EditorHeader/MetaPanel/KindEditorBody/TransportBar/RelationsPanel)へ流す薄い合成に。
import { useCallback, useEffect, useState } from "react";
import { api, type Neta, type NetaPatch } from "./api";
import { useEditHistory } from "./history";
import { useTransport } from "./useTransport";
import {
  notesOf,
  chordsOf,
  chordsToNotes,
  rhythmOf,
  rhythmToNotes,
  downloadMidi,
  programOf,
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
} from "./music";

export function useNetaEditor(neta: Neta, opts: { onClose: () => void; onChanged?: () => void }) {
  const { onClose, onChanged } = opts;
  const [title, setTitle] = useState(neta.title ?? "");
  const [text, setText] = useState(neta.text ?? "");
  const [tags, setTags] = useState(neta.tags.join(" "));
  const [notes, setNotes] = useState<Note[]>(notesOf(neta.content));
  // 崩し候補（①道具）：生成した別メロを候補として保持（元 notes は不変）。表示/再生は候補、保存で新ネタ。
  const [candidate, setCandidate] = useState<Note[] | null>(null);
  const [candStrength, setCandStrength] = useState(0.55);
  const [reshaping, setReshaping] = useState(false);
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
  const [rollMode, setRollMode] = useState<"draw" | "select">("draw"); // ロールの描く/選ぶ（ロール/パッドと同じ行に出す）
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
  // 崩し候補モード中は表示/再生を候補メロにする（元 notes は保存用に温存）。
  const activeNotes = candidate ?? notes;
  const pre = Math.max(0, pickup, Math.ceil(-Math.min(0, ...notesOf(neta.content).map((n) => n.start), ...activeNotes.map((n) => n.start))));
  // ソロ編集は見た目=実音（WYSIWYG）＝トランスポーズしない。調支配は合成(SectionEditor)側。
  // 相対bass は単体プレビュー＝調(key)を tonic に度数解決して鳴らす（実音高）。
  const playable = isRelBass
    ? resolveRelativeBass(bassPattern, [], key)
    : isChordPat
      ? resolveChordPattern(chordPat, [], key) // 単体プレビュー＝key の tonic コードに解決
      : isMelody || isBass
        ? activeNotes.map((n) => ({ ...n, start: n.start + pre })) // 弱起ぶん前へ＝負拍も0以降で鳴る
        : isChord
          ? chordsToNotes(chords)
          : rhythmToNotes(rhythm);

  // #57/#58/#59 トランスポート（再生/一時停止/頭出し/ループ＋プレイヘッド＋小節:拍）。
  const span = Math.max(len, ...playable.map((n) => Math.ceil(n.start + n.dur)));
  const tp = useTransport(() => playable, tempo, {
    scaleBeats: span,
    bpb: 4,
    program: isRhythm ? undefined : isChord ? 48 : program, // コード進行は抽象＝固定GM49(strings)・選択不可(CP1)
  });

  // 編集 Undo/Redo（design 決定U1/U2）：単体エディタの content 一式を snapshot 履歴で管理。
  const snapshot = { notes, chords, rhythm, bassPattern, bassSteps, chordPat, key, mode, tempo, program, len, pickup };
  const applySnapshot = useCallback((s: typeof snapshot) => {
    setNotes(s.notes);
    setChords(s.chords);
    setRhythm(s.rhythm);
    setBassPattern(s.bassPattern);
    setBassSteps(s.bassSteps);
    setChordPat(s.chordPat);
    setKey(s.key);
    setMode(s.mode);
    setTempo(s.tempo);
    setProgram(s.program);
    setLen(s.len);
    setPickup(s.pickup);
  }, []);
  const editHist = useEditHistory(snapshot, applySnapshot, { resetKey: neta.id });

  // Space=再生/停止（design #58/#59）。入力中は無効。音楽ネタのときだけ。
  useEffect(() => {
    if (!isMusic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
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

  // kind ごとの保存パッチ（C基準保存・調/拍はヒント）。
  function savePatch(): NetaPatch {
    if (isRelBass)
      return { content: { mode: "relative", steps: bassSteps, pattern: bassPattern, program }, key, mode, tempo, bars: Math.max(1, Math.round(bassSteps / 16)) };
    if (isMelody || isBass) return { content: { notes, program }, key, mode, tempo, bars: Math.ceil(len / 4) };
    if (isChordPat) return { content: { ...chordPat, program }, key, mode, tempo }; // コード楽器＝自前音色
    if (isChord) return { content: { chords }, key, mode, tempo }; // 進行は抽象＝program持たない(CP1)
    if (isRhythm) return { content: { rhythm }, tempo };
    if (isContainer) return { key, mode, tempo, meter };
    return {};
  }

  // 崩し候補：生成→試聴→良ければ保存の道具（①）。元は不変・候補として一時保持。
  async function reshape(strength?: number) {
    if (!isMelody || reshaping) return;
    const s = strength ?? candStrength;
    setCandStrength(s);
    setReshaping(true);
    try {
      const r = await api.reshapeMelody({
        ref: notes,
        frame: { key, meter, tempo, bars: Math.ceil(len / 4), mood: mood.trim() || undefined },
        strength: s,
        seed: Math.floor(Math.random() * 1e6), // 押すたび別案
      });
      const cn = notesOf(r.items?.[0]?.content);
      if (cn.length) setCandidate(cn);
    } finally {
      setReshaping(false);
    }
  }
  async function saveCandidate() {
    if (!candidate) return;
    const created = await api.createNeta({
      kind: "melody",
      title: `${title.trim() || neta.title || "メロ"} 崩し`,
      content: { notes: candidate, program },
      key,
      mode,
      tempo,
      meter,
      mood: mood.trim() || undefined,
      tags: neta.tags, // 同じ器・意味タグを継承
    });
    await api.link(neta.id, created.id, "variation").catch(() => {});
    setCandidate(null);
    onChanged?.();
  }
  function discardCandidate() {
    setCandidate(null);
  }
  // 調推定（①道具）：メロの音から調(key+mode)を推定して設定（決定的・Claude不要）。
  async function detectKeyFromMelody() {
    const r = await api.music<{ key: number; mode: string }>("detect_key", { notes });
    setKey(r.key);
    setMode(r.mode);
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

  const showKey = (isMusic || isContainer) && !isRhythm; // 調（rhythm以外の音楽/section）
  const showMeta = isMusic || isContainer; // テンポ
  const collapsibleMeta = isMusic || isContainer; // メタ折りたたみ対象（MetaPanel）
  // 小節/弱起は roll（メロ・ベース絶対）のみ＝折りたたみ設定(MetaPanel)へ移す対象（縦詰め）。
  const showRollBars = (isMelody || (isBass && bassMode === "absolute")) && melodyView === "roll";
  // #10④ エディタ本体の active 色を kind 色に（chord_pattern は chord 色を流用）。
  const colorKind = neta.kind === "chord_pattern" ? "chord" : neta.kind;

  return {
    // フラグ
    flags: { isMelody, isBass, isChord, isChordPat, isRhythm, isContainer, isRelBass, isMusic, isThemeable, showKey, showMeta, collapsibleMeta, showRollBars, hasChords: chords.length > 0 },
    // 値＋setter
    title, setTitle, text, setText, tags, setTags, mood, setMood,
    key, setKey, mode, setMode, meter, setMeter, tempo, setTempo, program, setProgram,
    notes, setNotes, chords, setChords, rhythm, setRhythm, chordPat, setChordPat,
    bassPattern, setBassPattern, bassSteps, setBassSteps, bassMode, setBassMode,
    melodyView, setMelodyView, rollMode, setRollMode, len, setLen, pickup, setPickup, pre,
    // 崩し候補（①道具）
    candidate, candStrength, reshaping, reshape, saveCandidate, discardCandidate, detectKeyFromMelody,
    // 派生・道具
    playable, tp, editHist, rels, busy, schedId, colorKind,
    // アクション
    save, remove, detectKey, toggleSchedule,
    onExtendLen: () => setLen(len + 4),
    onExportMidi: () => downloadMidi(playable, `${neta.title ?? "sketch"}.mid`, tempo, null, isRhythm ? undefined : isChord ? 48 : program),
  };
}
