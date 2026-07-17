// 編集画面の"脳"（共通パーツ化 CP3・design「編集画面の共通パーツ化」）。
// NetaDialog が抱えていた state/派生/effect/アクション/history/transport を集約。
// NetaDialog は本フックの返りを各共有UI(EditorHeader/MetaPanel/KindEditorBody/TransportBar/RelationsPanel)へ流す薄い合成に。
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Neta, type NetaPatch } from "./api";
import { useEditHistory } from "./history";
import { useTransport } from "./useTransport";
import {
  notesOf,
  chordsOf,
  chordsToNotes,
  rhythmOf,
  rhythmToNotes,
  beatsPerBar,
  programOf,
  isRelativeBass,
  resolveRelativeBass,
  isChordPattern,
  resolveChordPattern,
  emptyChordPattern,
  feelOf,
  isCompoundMeter,
  isSkeleton,
  singOf,
  CURATED_SING_VOICES,
  PITCH_NAMES as KEY_NAMES,
  type SingVoice,
  type Note,
  type ChordEntry,
  type RhythmContent,
  type BassStep,
  type ChordPatternContent,
  type SkeletonBreakpoint,
  type SkeletonContent,
} from "./music";
import { skeletonPlaybackNotes } from "./skeletonEdit";
import { useVocalRender } from "./useVocal";
import { useCowGuard } from "./useCowGuard";

// 仮歌ジョブ（再生キー＋声）を組む純関数。key に声(speaker)を含める＝声を変えたら別 wav。
// 含めないと古い声の wav キャッシュが再利用され「声を変えても反映されない」（2026-07-17 バグ・SectionEditor は
// 既に {e,s} 込みだが単体エディタ経路が漏れていた）。speaker はライブ選択声を api.sing へ渡す（未選択=既定リツ）。
export function buildVocalJob(
  playable: { pitch: number; start: number; dur: number; syllable?: string }[],
  tempo: number,
  singSpeaker: number | undefined,
) {
  const notes = playable.map((n) => ({ pitch: Math.round(n.pitch), start: n.start, dur: n.dur, syllable: n.syllable }));
  return {
    key: JSON.stringify({ n: notes, t: tempo, s: singSpeaker ?? null }),
    notes,
    bpm: tempo,
    firstNoteBeat: playable.length ? Math.min(...playable.map((n) => n.start)) : 0,
    speaker: singSpeaker,
  };
}

export function useNetaEditor(
  neta: Neta,
  opts: {
    onClose: () => void;
    onChanged?: () => void;
    // CoW（分家の安全弁・design S2）：この編集画面が「どの親から潜ったか」＝共有子の分家先。
    // 未指定（トップから開いた）＝ガード無し＝従来どおり通常保存（bit-safe）。
    parentId?: string;
    onForked?: (branch: Neta) => void; // 「この曲だけ変える」で分家に差し替えた後、エディタを分家へ載せ替える。
  },
) {
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
  const bpb = beatsPerBar(meter); // 1小節の拍数（6/8=3・4/4=4）＝小節数/尺の換算に（評価修正B）
  const [program, setProgram] = useState<number>(
    programOf(neta.content) ?? (neta.kind === "bass" ? 33 : neta.kind === "skeleton" || neta.kind === "counter" || neta.kind === "section_inst" ? 48 : 0), // #47 GM音色（bass=フィンガーベース・骨格/対旋律/管弦=Strings）
  );
  // #13c 仮歌＝メロの楽器を「歌声」に（content.sing.enabled）。program はフォールバック楽器として保持（歌詞なし時）。
  const [sing, setSing] = useState<boolean>(() => !!singOf(neta.content));
  // 歌わせる声（VOICEVOX frame_decode 声色 id）。初期＝content.sing.speaker（未設定＝undefined＝api 既定 3009・bit一致）。
  const [singSpeaker, setSingSpeaker] = useState<number | undefined>(() => singOf(neta.content)?.speaker);
  // 声の選択肢（案B二段のドロップダウン）。curated を土台に、起動時 GET /sing/voices（frame_decode 全声）を合流。
  const [singVoices, setSingVoices] = useState<SingVoice[]>(CURATED_SING_VOICES);
  const [rollMode, setRollMode] = useState<"draw" | "select" | "erase" | "lyric">("draw"); // ロールの描く/選ぶ/消す/詞（詞=メロのみ・歌詞リタッチ）
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
    Math.max(16, (neta.bars ?? 0) * beatsPerBar(neta.meter), ...notesOf(neta.content).map((n) => Math.ceil(n.start + n.dur))),
  );
  // 弱起（アウフタクト）：拍0の前の lead-in 拍数。既存の負 start を包む値で初期化。
  const [pickup, setPickup] = useState(() => Math.max(0, Math.ceil(-Math.min(0, ...notesOf(neta.content).map((n) => n.start)))));
  const [chordPat, setChordPat] = useState<ChordPatternContent>(() => (isChordPattern(neta.content) ? neta.content : emptyChordPattern()));
  // 骨格（design #20 S2）：ブレークポイント列 tones/bass ＋句 phrases。合成では無音・単体は白玉/対位法プレビュー。
  const skel0 = isSkeleton(neta.content) ? neta.content : null;
  const [tones, setTones] = useState<SkeletonBreakpoint[]>(skel0?.tones ?? []);
  const [skelBass, setSkelBass] = useState<SkeletonBreakpoint[]>(skel0?.bass ?? []);
  const [phrases, setPhrases] = useState<{ endBeat: number; cadence?: string }[]>(skel0?.phrases ?? []);
  const [skelBars, setSkelBars] = useState<number>(skel0?.bars ?? Math.max(2, neta.bars ?? 4));
  // 骨格の単体プレビュー用コード（preview_chords）＝導出ベースの源。無ければ空（key の tonic 相当は導出しない）。
  const skelChords: ChordEntry[] = isSkeleton(neta.content) ? chordsOf((neta.content as { preview_chords?: unknown }).preview_chords ? { chords: (neta.content as { preview_chords?: unknown }).preview_chords } : {}) : [];
  const [skelCounter, setSkelCounter] = useState(true); // 再生＝対位法(ベース+1oct)既定
  const [busy, setBusy] = useState(false);
  const [rels, setRels] = useState<{ type: string; neta: Neta | null }[]>([]);
  const [schedId, setSchedId] = useState<string | null>(null); // #80 継続調査スケジュール
  const isMelody = neta.kind === "melody";
  const isBass = neta.kind === "bass"; // #bass S1 絶対モード＝melodyと同型・低域ピアノロール
  const isCounter = neta.kind === "counter"; // WP-X3a 対旋律＝melody相乗り（単音ライン・ピアノロール）
  const isRiff = neta.kind === "riff"; // WP-X3b リフ＝melody相乗り（反復核の単音ライン・ピアノロール）
  const isChord = neta.kind === "chord" || neta.kind === "chord_progression";
  const isChordPat = neta.kind === "chord_pattern"; // CP3 コード楽器パターン（進行に解決する相対型）
  const isSectionInst = neta.kind === "section_inst"; // WP-X3c 管弦＝1ネタ多声・chord_pattern親戚（進行追従ボイシング）
  const isChordPatLike = isChordPat || isSectionInst; // 多声・進行解決型のエディタ/再生/保存を共有
  const isRhythm = neta.kind === "rhythm";
  const isSkel = neta.kind === "skeleton"; // 骨格層の一級化（design #20）
  const isContainer = neta.kind === "section" || neta.kind === "song";
  const isMusic = isMelody || isBass || isCounter || isRiff || isChord || isChordPatLike || isRhythm || isSkel;
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
    : isChordPatLike
      ? resolveChordPattern(chordPat, [], key) // 単体プレビュー＝key の tonic コードに解決（chord_pattern/管弦 共通・多声）
      : isSkel
        ? skeletonPlaybackNotes({ bars: skelBars, tones, bass: skelBass, phrases }, { counterpoint: skelCounter, chords: skelChords, beatsPerBar: bpb, melProgram: program }) // 骨格＝2声(対位法/実音)
        : isMelody || isBass || isCounter || isRiff
          ? activeNotes.map((n) => ({ ...n, start: n.start + pre })) // 弱起ぶん前へ＝負拍も0以降で鳴る（counter/riff も単音ライン）
          : isChord
            ? chordsToNotes(chords)
            : rhythmToNotes(rhythm);

  // #13c 仮歌（メロの楽器＝歌声）：メロで sing 選択かつ歌詞(syllable)あり＝▶で VOICEVOX 歌唱を伴奏なしで鳴らす。
  // playable は既に pre で弱起を前へ寄せ済み（全 start>=0）＝これを座標系として wav の初音を楽器の初音（=同 playable の
  // 初音時刻）へ合わせる。歌う時は playable のメロ楽器音を muted にし（歌本体は vocal 経路で鳴る＝二重化回避）、notes は
  // 残す＝尺/スペースの計算に効く。歌詞なしで sing のみ＝フォールバック楽器（program）で普通に鳴らす。
  const singingMelody = isMelody && sing;
  const vocalHasLyric = singingMelody && playable.some((n) => !!n.syllable && n.syllable.trim().length > 0);
  const vocalJob = vocalHasLyric ? buildVocalJob(playable, tempo, singSpeaker) : null;
  const playableFinal = vocalHasLyric ? playable.map((n) => ({ ...n, muted: true })) : playable;
  const vocal = useVocalRender();
  const jobsRef = useRef(vocalJob ? [vocalJob] : []);
  jobsRef.current = vocalJob ? [vocalJob] : [];

  // #57/#58/#59 トランスポート（再生/一時停止/頭出し/ループ＋プレイヘッド＋小節:拍）。
  const span = Math.max(len, ...playable.map((n) => Math.ceil(n.start + n.dur)));
  const tp = useTransport(() => playableFinal, tempo, {
    scaleBeats: span,
    bpb: 4,
    program: isRhythm ? undefined : isChord ? 48 : program, // コード進行は抽象＝固定GM49(strings)・選択不可(CP1)
    feel: feelOf(neta.content), // フィール層：この neta の content.feel でスイング/微小揺れ（無ければストレート）。
    compound: isCompoundMeter(neta.meter),
    getVocal: () => vocal.peek(jobsRef.current),
  });
  // 再生＝歌う設定なら先に wav をレンダ（未キャッシュは「歌声を作っています…」busy）→ 同期再生。停止/一時停止は素通し。
  const playPause = useCallback(async () => {
    if (vocal.busy) return; // 仮歌レンダ中の再押下＝no-op（ensure 二重発火防止・設計2026-07-17）。Space 経路も同関数で塞がる
    if (tp.state === "stopped" && jobsRef.current.length) await vocal.ensure(jobsRef.current);
    tp.playPause();
  }, [tp.state, tp.playPause, vocal.ensure, vocal.busy]);

  // 編集 Undo/Redo（design 決定U1/U2）：単体エディタの content 一式を snapshot 履歴で管理。
  const snapshot = { notes, chords, rhythm, bassPattern, bassSteps, chordPat, tones, skelBass, phrases, skelBars, key, mode, tempo, program, sing, singSpeaker, len, pickup };
  const applySnapshot = useCallback((s: typeof snapshot) => {
    setNotes(s.notes);
    setChords(s.chords);
    setRhythm(s.rhythm);
    setBassPattern(s.bassPattern);
    setBassSteps(s.bassSteps);
    setChordPat(s.chordPat);
    setTones(s.tones);
    setSkelBass(s.skelBass);
    setPhrases(s.phrases);
    setSkelBars(s.skelBars);
    setKey(s.key);
    setMode(s.mode);
    setTempo(s.tempo);
    setProgram(s.program);
    setSing(s.sing);
    setSingSpeaker(s.singSpeaker);
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
      void playPause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMusic, playPause]);

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

  // 歌わせる声の一覧（2026-07-17）：メロ編集時に一度取得。engine が起きていれば frame_decode 全声、
  // ダメなら curated（api 側フォールバック）。curated を土台に union＝選択中 id が一覧に無くても option が消えない。
  useEffect(() => {
    if (!isMelody) return;
    let on = true;
    void Promise.resolve(api.singVoices?.())
      .then((vs) => {
        if (!on || !vs || !vs.length) return;
        const byId = new Map<number, SingVoice>();
        for (const v of [...CURATED_SING_VOICES, ...vs]) byId.set(v.id, v); // 後勝ち＝engine の正名を優先
        setSingVoices([...byId.values()]);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [neta.id, isMelody]);

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

  // #13c 仮歌の content 断片＝メロで sing 選択時のみ {sing:{enabled,speaker?}}。声は UI で選べる（案B・2026-07-17）。
  // singSpeaker 未選択（undefined）＝speaker キーを書かない＝api 既定 3009 に委ねる（後方互換 bit一致）。
  // sing 非選択＝空（content から欠落＝従来楽器＝後方互換）。
  function singContent(): { sing?: { enabled: true; speaker?: number } } {
    if (!(isMelody && sing)) return {};
    return { sing: { enabled: true, ...(singSpeaker != null ? { speaker: singSpeaker } : {}) } };
  }
  // kind ごとの保存パッチ（C基準保存・調/拍はヒント）。
  function savePatch(): NetaPatch {
    if (isRelBass)
      return { content: { mode: "relative", steps: bassSteps, pattern: bassPattern, program }, key, mode, tempo, meter, bars: Math.max(1, Math.round(bassSteps / 16)) };
    // meter は単体パートでも保存＝roll のグリッドと MIDI 拍子ヘッダに効く（container 限定を解消・監査 MB-05）。
    if (isMelody || isBass || isCounter || isRiff) return { content: { notes, program, ...singContent() }, key, mode, tempo, meter, bars: Math.ceil(len / bpb) };
    if (isSkel) {
      // 骨格＝ブレークポイント列（dur無し）。bass/phrases は空なら省く。preview_chords は導出ベースの源として保持。
      const content: SkeletonContent & { preview_chords?: ChordEntry[] } = { bars: skelBars, tones };
      if (skelBass.length) content.bass = skelBass;
      if (phrases.length) content.phrases = phrases;
      if (skelChords.length) content.preview_chords = skelChords;
      return { content, key, mode, tempo, meter, bars: skelBars };
    }
    if (isChordPatLike) return { content: { ...chordPat, program }, key, mode, tempo, meter }; // コード楽器/管弦＝自前音色（role 等の付随フィールドは chordPat spread で保持）
    if (isChord) return { content: { chords }, key, mode, tempo, meter }; // 進行は抽象＝program持たない(CP1)
    if (isRhythm) return { content: { rhythm }, tempo, meter };
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
        frame: { key, meter, tempo, bars: Math.ceil(len / bpb), mood: mood.trim() || undefined },
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
      content: { notes: candidate, program, ...singContent() }, // 仮歌設定も崩し候補ネタへ継承
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
  // 調推定（①道具）：メロの音から調候補（相対短調含む複数）を推定。押すごとに候補を巡回して設定
  //（C 長調 ⇔ A 短調 のような曖昧さを"次候補"で切替）。ノート編集で候補はリセット。
  const keyCandsRef = useRef<{ key: number; mode: string }[]>([]);
  const keyCursorRef = useRef(0);
  useEffect(() => {
    keyCandsRef.current = [];
    keyCursorRef.current = 0;
  }, [notes]);
  const [keyReport, setKeyReport] = useState<string | null>(null);
  async function detectKeyFromMelody() {
    if (!keyCandsRef.current.length) {
      const r = await api.music<{ candidates: { key: number; mode: string }[] }>(
        "detect_key_candidates",
        { notes, top: 4 },
      );
      keyCandsRef.current = r.candidates ?? [];
      keyCursorRef.current = 0;
    }
    const cands = keyCandsRef.current;
    const c = cands[keyCursorRef.current % (cands.length || 1)];
    if (!c) return;
    setKey(c.key);
    setMode(c.mode);
    keyCursorRef.current++;
    const name = KEY_NAMES[c.key] ?? c.key;
    setKeyReport(
      `調推定：${name} ${c.mode === "minor" ? "短調" : "長調"}（${keyCursorRef.current}/${cands.length}・いじる→調推定で次候補）`,
    );
  }

  // 保存する全体パッチ（メタ＋kind別content）。自動保存/手動フラッシュ/クローズで共有。
  function fullPatch(): NetaPatch {
    return {
      title: title.trim() || null,
      text: text.trim() || null,
      tags: tags
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      mood: mood.trim() || null,
      ...savePatch(),
    };
  }

  // 自動保存（design「編集は自動保存」2026-07-03・req L174 データを失わない/L66 Undoが安全網）。
  // 明示「保存」は廃止。編集で patch が変わったらデバウンスで PATCH（閉じない）。← 戻る・別ネタ切替
  // (unmount)・リロード(beforeunload) では未保存ぶんをフラッシュ＝取りこぼさない。ミスは Undo で戻す。
  // 候補フロー（崩す＝saveCandidate）は別物＝明示 commit のまま（元notes不変・新ネタ化）。
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "dirty">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const patchRef = useRef(""); // 最新パッチ JSON（unmount/リロードで参照）
  const firstRun = useRef(true);
  const mountedRef = useRef(true); // unmount後の setState を避ける（アンマウント時フラッシュ対策）

  // CoW（分家の安全弁・design「copy-on-write」S2）＝共有された子を**最初に内容変更した瞬間**に一度だけ確認。
  // ロジックは useCowGuard に集約（SectionEditor の直接 updateNeta 経路と共有＝Fix C）。プロンプトは NetaDialog が描く。
  const cow = useCowGuard(neta, { parentId: opts.parentId, onForked: opts.onForked, onChanged });

  /** 保存フラッシュ。返り＝false は「CoW でユーザーがやめた」＝呼び出し側（close）は閉じてはいけない（Fix A-3）。 */
  async function flushSave(saveOpts?: { keepalive?: boolean }): Promise<boolean> {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!dirtyRef.current) return true; // 変更が無ければ書かない（onChanged の空振り連発を防ぐ）

    if (saveOpts?.keepalive) {
      // keepalive（unmount/beforeunload）＝対話できない。共有（or 未解決）かつ未決定なら**原本に書かない**（Fix A-2）
      // ＝「やめる」した（or 選ばせる前の）編集を裏で流さない（エイリアシング事故＞データ喪失の順で重い）。
      if (cow.shouldBlockSilentSave()) return true;
    } else {
      // ── CoW ゲート：親から潜った編集で、この子が共有(placementCount>=2)なら初回だけ確認（判定は先読みキャッシュ）。
      const patch = JSON.parse(patchRef.current) as NetaPatch;
      const res = await cow.guard(patch, (branch) => {
        // Fix B：ユーザーがこのセッションで title を触っていなければ、vary の付けた「元title′」を patch の
        // 原値 title で潰さない（分家の A′ 表示が消える表示バグ）。変えていたらユーザー値を尊重。
        const p = { ...patch };
        if ((p.title ?? null) === (neta.title ?? null)) p.title = branch.title;
        return p;
      });
      if (res.action === "cancel") return false; // 原本無変更（dirty 維持＝次の保存で再確認）・閉じない
      if (res.action === "branched") {
        dirtyRef.current = false; // 編集は分家に載った＝原本分の dirty は解消（onForked が載せ替え）
        if (mountedRef.current) setSaveStatus("saved");
        return true;
      }
    }

    dirtyRef.current = false;
    if (mountedRef.current) setSaveStatus("saving");
    try {
      await api.updateNeta(neta.id, JSON.parse(patchRef.current) as NetaPatch, saveOpts);
      onChanged?.();
      if (mountedRef.current) setSaveStatus("saved");
    } catch {
      dirtyRef.current = true; // 失敗＝未保存へ戻し、次の編集/クローズで再挑戦
      if (mountedRef.current) setSaveStatus("dirty");
    }
    return true;
  }
  const flushRef = useRef(flushSave);
  flushRef.current = flushSave; // 毎レンダで最新の flush（timer/unmount が古い state を掴まないよう）

  const patchStr = JSON.stringify(fullPatch());
  patchRef.current = patchStr;

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false; // 初期値＝既に保存済＝スルー
      return;
    }
    dirtyRef.current = true;
    setSaveStatus("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushRef.current(), 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [patchStr]);

  // 別ネタへ切替(unmount)・リロード/タブ閉じ(beforeunload) でも未保存を落とさない。
  useEffect(() => {
    const onBU = () => void flushRef.current({ keepalive: true });
    window.addEventListener("beforeunload", onBU);
    return () => {
      window.removeEventListener("beforeunload", onBU);
      mountedRef.current = false; // 以降 setState しない
      void flushRef.current({ keepalive: true });
    };
  }, []);

  // ← 戻る：未保存ぶんをフラッシュしてから閉じる。CoW で「やめる」を選んだら**閉じない**
  // （閉じると unmount フラッシュ経由で原本に書く穴があった＝Fix A-3。エディタに留まる＝「やめる」の意味を保つ）。
  async function close() {
    const ok = await flushSave();
    if (!ok) return;
    onClose();
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
  const showRollBars = isMelody || isCounter || isRiff || (isBass && bassMode === "absolute"); // メロ/対旋律/リフ/絶対ベースの roll（パッド撤去でロール一本）
  // #10④ エディタ本体の active 色を kind 色に（chord_pattern は chord 色を流用）。
  const colorKind = neta.kind === "chord_pattern" ? "chord" : neta.kind;

  return {
    // フラグ
    flags: { isMelody, isBass, isCounter, isRiff, isChord, isChordPat, isSectionInst, isRhythm, isSkel, isContainer, isRelBass, isMusic, isThemeable, showKey, showMeta, collapsibleMeta, showRollBars, hasChords: chords.length > 0 },
    // 骨格（design #20 S2）
    tones, setTones, skelBass, setSkelBass, phrases, setPhrases, skelBars, setSkelBars, skelChords, skelCounter, setSkelCounter,
    // 値＋setter
    title, setTitle, text, setText, tags, setTags, mood, setMood,
    key, setKey, mode, setMode, meter, setMeter, tempo, setTempo, program, setProgram, sing, setSing,
    singSpeaker, setSingSpeaker, singVoices,
    notes, setNotes, chords, setChords, rhythm, setRhythm, chordPat, setChordPat,
    bassPattern, setBassPattern, bassSteps, setBassSteps, bassMode, setBassMode,
    rollMode, setRollMode, len, setLen, pickup, setPickup, pre,
    // 崩し候補（①道具）
    candidate, candStrength, reshaping, reshape, saveCandidate, discardCandidate, detectKeyFromMelody,
    keyReport, clearKeyReport: () => setKeyReport(null),
    // 派生・道具（playPause＝▶時に仮歌をレンダしてから再生する wrapper・vocal＝busy/msg 表示用）
    // singNoLyric＝仮歌を選んだが歌詞(syllable)が無い＝フォールバック楽器で鳴る（注記表示用）。
    playable, tp, playPause, vocal, singNoLyric: singingMelody && !vocalHasLyric, editHist, rels, busy, schedId, colorKind,
    // 自動保存：状態＋手動フラッシュ（保存ピル）＋閉じる（← 戻る＝フラッシュしてから）
    saveStatus, onFlush: () => void flushSave(), flush: async () => { await flushSave(); }, close,
    // CoW（分家の安全弁・S2）：ガード一式（プロンプト状態＋決定＋guard）。NetaDialog がモーダルを描き、
    // SectionEditor（bars/レーン設定の直接保存）へも同一インスタンスを配線＝決定はエディタセッションで1つ。
    cow, cowPrompt: cow.cowPrompt, resolveCow: cow.resolveCow,
    // アクション
    remove, detectKey, toggleSchedule,
    onExtendLen: () => setLen(len + bpb),
  };
}
