import { type CSSProperties, type Ref, useRef, useState } from "react";
import { type ChordPatternContent, type ChordLhContent, type ChordEntry, type PlaybackHandle, applyCellTap, chordHitsWithVel, voicingPreviewPitches, pitchName, notesForContent, buildPlayback, CHORD_ACCENT, CHORD_SOFT, isGuitarProgram } from "../music";
import { previewNote } from "../audio";
import { startPlayback } from "../playback";
import { COMP_GENRE_CHIPS } from "../useMelodyGen";
import { PatternPickerBar, type PatternCand } from "./PatternPickerBar";
import { fetchLibraryPatternNetas, netaToPatternCand } from "./patternLibrary";
import { BarsControl } from "./BarsControl";
import { MiniRoll } from "./MiniRoll";
import { NoteValuePicker } from "./NoteValuePicker";
import { DragHud } from "./DragHud";
import { useHoldDrag, type HoldDragState, type HoldDragStart } from "../useHoldDrag";
import type { Neta } from "../api";

const CHORD_BASE_VEL = 100; // 既定ベロシティ（resolveChordPattern の n.vel ?? 100 と一致）＝デテント/普通判定の基準。

// #29 §9 個別セル。ホールドドラッグ（長押し→縦=強さ・**縦のみ**＝分割は arp 軸へ委譲）をセル単位で持つ。
function ChordCell({
  ariaLabel,
  className,
  hv,
  onTap,
  onFire,
  onDrag,
  onCommit,
  onCancel,
}: {
  ariaLabel: string;
  className: string;
  hv: number | null; // onset セルの実効 vel/127（濃淡）。sustain/空は null
  onTap: () => void;
  onFire: (anchor: DOMRect) => HoldDragStart | null;
  onDrag: (s: HoldDragState) => void;
  onCommit: (s: { vel: number; div: number }) => void;
  onCancel: () => void;
}) {
  const hd = useHoldDrag({ axis: "y", onFire, onDrag, onCommit, onCancel });
  const style = hv != null ? ({ "--hv": hv } as CSSProperties) : undefined;
  return <button type="button" aria-label={ariaLabel} className={className} style={style} onClick={onTap} {...hd} />;
}

const NAME_PX = 58;
const BEAT_PX = 88;
const DEFAULT_TOP = 72; // C5（トップ狙い音の既定）
// 奏法UIスライスB：じゃら〜ん（strumMs）の段階。strumMs は弦をずらす「時間差」（ms/弦）＝音量でなく速さ。
// ms が大きいほどロールが遅い＝ゆっくり（design「Fable UX監査」③の訂正・研究doc §3.2・要耳較正）。
const STRUM_MS_STAGES = [0, 8, 14, 25];
const STRUM_MS_LABELS = ["OFF", "速い", "ふつう", "ゆっくり"]; // STRUM_MS_STAGES と同順（0=OFF/8=速い/14=ふつう/25=ゆっくり）
// Task1（2026-07-23）左手 custom パッド＝度数レーン（上から 8/5/3/R＝ピアノロール向き）×ステップ。
// BassStepEditor をモデルにしつつ**同 step 排他を外す＝ポリフォニック**（同 step 複数レーン ON 可＝ピアノ左手）。
// レーン度数＝R/3/5/8（オーナー指定「1,3,5,8」）。approach/next 等ベース固有語彙は無し（左手＝土台＝歩かない）。
type LhLaneDeg = "8" | "5" | "3" | "R";
const LH_LANES: { d: LhLaneDeg; label: string }[] = [
  { d: "8", label: "8" },
  { d: "5", label: "5" },
  { d: "3", label: "3" },
  { d: "R", label: "R" },
];
// プレビュー用：度数→実音高（C 基準・入力FB）。R=C2(36)/3=E2(40)/5=G2(43)/8=C3(48)。実配置の
// オクターブ/LH窓 fold は再生時 resolveLh（L0）が担う＝ここは度数の高さを鳴らすだけ。
const LH_PAD_PREVIEW: Record<LhLaneDeg, number> = { R: 36, "3": 40, "5": 43, "8": 48 };

// 音長（step数・1step=16分）。16/8/4/2/1 を他エディタ(メロ/ベース)と揃える。
const LENGTHS = [
  { label: "16", v: 1 },
  { label: "8", v: 2 },
  { label: "4", v: 4 },
  { label: "2", v: 8 },
  { label: "1", v: 16 },
];

// 拍子→1小節step数（1step=16分）。4/4=16, 6/8=12, 3/4=12。複合(6/8系)はビート=6step。
function meterSteps(meter?: string): { stepsPerBar: number; beatStep: number } {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
  const n = m ? Number(m[1]) : 4;
  const d = m ? Number(m[2]) : 4;
  const stepsPerBar = n > 0 && d > 0 ? Math.round((n * 16) / d) : 16;
  return { stepsPerBar, beatStep: d === 8 && n % 3 === 0 && n >= 6 ? 6 : 4 };
}

// コード楽器パターン（CP3・響きモデル作り替え 2026-07-04）：2ゾーン構成。
//  ①「いつ弾く」＝リズムstepグリッド(hits)＋長さ＋小節（主役・上）。
//  ②「響き」＝打ち方/トップ狙い/広がり/高さ/パワーコード(＋arpは向き)＋奏法（音の作り込み・下・静か）。
// 構成音の手選択は撤去＝鳴る音はコードの質から自動（resolveChordPattern/voiceToTop）。
//
// ★CP行契約（不変条件・肥大化ガード・TinkerSheet ハブ契約 L8-15 と同文体）：
//   **響きゾーンは最大5行**（打ち方／トップ・広がり／高さ・パワー(arp時=向き・幅・区切り)／奏法／左手）。
//   これ以上ノブが要る日は【群アコーディオンへ沈める】（前面はこの5行で打ち止め）＝スマホ縦で詰め込まない
//   （タップ標的28px＝密度耐性が低い・design「奏法UI」決定）。奏法行=4行目（Fable UX監査①＝読み取り専用サマリ＋じゃら〜ん。
//   奏法の変更手段は MetaPanel「奏法」select 一本＝ここは表示のみ）・左手seg=5行目（keyboard 解決時のみ・S3）。
// プレビュー進行（型試聴用）＝C→Am→F→G（ネタ key へ移調）。ネタに preview_chords があればそちら優先（帯の試聴文脈）。
const PREVIEW_PROG: { root: number; quality: string }[] = [
  { root: 0, quality: "" }, { root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 7, quality: "" },
];
function previewChordsForKey(key: number): ChordEntry[] {
  return PREVIEW_PROG.map((c, i) => ({ root: (((c.root + key) % 12) + 12) % 12, quality: c.quality, start: i * 4, dur: 4 }));
}

export function ChordPatternEditor({
  pattern,
  onChange,
  meter,
  program,
  tempo,
  keyPc,
  previewChords,
  showPicker = true,
  playheadRef,
  scrollerRef,
}: {
  pattern: ChordPatternContent;
  onChange: (p: ChordPatternContent) => void;
  meter?: string;
  program?: number; // 音色（GM）。voicing.style="auto" の奏法導出＋「じゃら〜ん」行の出し分け（ギター解決時のみ）に使う。
  tempo?: number; // 型試聴の実音化＋候補フレームの tempo（修理#1「パターンを選ぶ」帯）
  keyPc?: number; // 調（型試聴のプレビュー進行の移調＋候補フレームの key）
  previewChords?: ChordEntry[]; // ネタ固有のプレビュー進行（あれば型試聴に使う・無ければ C→Am→F→G）
  showPicker?: boolean; // 修理#3 決定③：「パターンを選ぶ ▸」帯の出し分け（既定 true＝従来描画＝bit一致）。管弦(section_inst)＝false で非表示（型の誤適用を断つ）。
  playheadRef?: Ref<HTMLDivElement>;
  scrollerRef?: Ref<HTMLDivElement>;
}) {
  const { stepsPerBar, beatStep } = meterSteps(meter);
  const ppPlay = useRef<PlaybackHandle | null>(null);
  // 「パターンを選ぶ ▸」帯（修理#1・監査推奨差分1／Task2/L3）＝候補の出所を生成器→ネタ帳ライブラリへ。
  // scope:"library" のコード楽器ネタを genre タグで引き、content を既存 audition/apply へそのまま載せる（実音経路不変）。
  const fetchPatterns = async (genre: string): Promise<PatternCand[]> => {
    const netas = await fetchLibraryPatternNetas("chord_pattern", genre);
    return netas.map((n) =>
      netaToPatternCand(n, { audition: auditionPattern, apply: applyPattern, scene: true, fallbackName: "コード楽器" }),
    );
  };
  // 試聴＝ネタ preview_chords（あれば）or プレビュー進行に当てて resolveChordPattern で実音化（tempo/program 込み）。
  const auditionPattern = (content: unknown) => {
    ppPlay.current?.stop();
    const chords = previewChords?.length ? previewChords : previewChordsForKey(keyPc ?? 0);
    const ns = notesForContent("chord_pattern", content, { key: keyPc ?? 0, chords, tempo, program: program ?? (content as ChordPatternContent).program });
    if (ns.length) void startPlayback(buildPlayback({ kind: "notes", notes: ns, tempo: tempo ?? 120, program }), { vocalMode: "peek" }).then((h) => { ppPlay.current = h; });
  };
  // 適用＝候補 content で置換（mode/voicing/steps/hits/lh/patternId）。program 等メタは現ネタを保持＝onChange で Undo に乗る。
  const applyPattern = (content: unknown) => {
    ppPlay.current?.stop();
    const c = content as ChordPatternContent;
    onChange({ ...c, ...(pattern.program != null ? { program: pattern.program } : {}) });
  };
  const [len, setLen] = useState(4); // 各音の長さ（step数・既定=四分）
  const [dotted, setDotted] = useState(false); // 付点：音長×1.5（6/8 対応）
  // #29 §9 ホールドドラッグ中のライブプレビュー（--hv をこのセルだけ上書き・HUD 表示）。離した時に一括 onChange。
  const [drag, setDrag] = useState<{ step: number; vel: number; anchor: DOMRect } | null>(null);
  const v = pattern.voicing;
  const top = v.top ?? DEFAULT_TOP;
  const isArp = pattern.mode === "arp";
  const bars = Math.max(1, Math.round(pattern.steps / stepsPerBar));
  const startAt = (s: number) => pattern.hits.find((h) => h.step === s);
  const sustainAt = (s: number) => pattern.hits.some((h) => h.step < s && s < h.step + h.dur);

  // 手編集の共通ゲート（修理#3 決定④）＝演奏内容を変える onChange を1箇所に集約し、**patternId が在る時だけ**
  // patternEdited を立てる（来歴＝patternId は保ったまま帯に「（改）」を出す＝正直表示）。patternId 無し＝新キーを
  // 生やさない＝bit一致。program 等メタ変更（applyPattern の program 継承）はこの setter を通さない＝付与しない。
  // applyPattern は候補 content で丸ごと置換＝候補側に patternEdited が無い＝（改）は自然消滅。
  const editContent = (next: ChordPatternContent) =>
    onChange(next.patternId != null ? { ...next, patternEdited: true } : next);
  // 響き変更は必ず top を書き込む（旧パターンも触った瞬間から新モデルで鳴る）。
  const setV = (patch: Partial<typeof v>) => editContent({ ...pattern, voicing: { ...v, top, ...patch } });
  // S3 奏法の解決結果（style:"auto" は program のファミリで分岐）。guitar＝D/Uストリップ・keyboard＝左手行。
  const guitarResolved = v.style === "guitar" || (v.style === "auto" && isGuitarProgram(program));
  const keyboardResolved = !guitarResolved;
  // D/U 自動既定（表拍=D・裏=U）。新規打点と、dir 未指定 hit の薄表示に使う（モックB）。
  const duDefault = (s: number): "D" | "U" => (s % beatStep === 0 ? "D" : "U");

  const toggleHit = (s: number) => {
    const r = applyCellTap(pattern.hits, s, dotted ? len * 1.5 : len); // 頭=消す／伸び=長さ調整／空き=新規
    // S3：guitar 解決の新規打点は dir を明示で書く（表D裏U を可聴化＝既存ネタは触らないので不変）。
    const hits = r.placed && guitarResolved ? r.hits.map((h) => (h.step === s ? { ...h, dir: duDefault(s) } : h)) : r.hits;
    editContent({ ...pattern, hits });
    // 置いた合図＝現在の voicing で C を和音プレビュー（ドミソ／単音でなく響きで確認）。
    if (r.placed) for (const p of voicingPreviewPitches({ ...v, top }, program)) void previewNote({ pitch: p, start: 0, dur: 0.5 });
  };
  // D/U ストリップのタップ＝現在の表示 dir（明示 or 自動既定）を反転して明示で書く。
  const toggleDir = (s: number) => {
    const h = pattern.hits.find((x) => x.step === s);
    if (!h) return;
    const next: "D" | "U" = (h.dir ?? duDefault(s)) === "D" ? "U" : "D";
    editContent({ ...pattern, hits: pattern.hits.map((x) => (x.step === s ? { ...x, dir: next } : x)) });
  };
  // 左手（S3＋Task1）：seg 選択＝lh.mode を書く／OFF＝lh キー削除（bit）。
  // custom で人がパッド編集した hits は、preset へ戻しても**非破壊で保持**（描画しないだけ＝メロ/ベースの
  // 範囲外音と同流儀）。preset→custom は保持 hits を復元。hits が無いネタの preset は clean（{mode}＝bit一致）。
  const lhHits = pattern.lh?.hits ?? [];
  const setLhMode = (mode: "off" | "root" | "root5" | "oct" | "custom") => {
    if (mode === "off") { const { lh: _drop, ...rest } = pattern; editContent(rest); return; }
    if (mode === "custom") { editContent({ ...pattern, lh: { mode: "custom", hits: lhHits } }); return; }
    // preset：authored hits があれば非破壊保持・無ければ hits キーを生やさない（bit一致）。
    editContent({ ...pattern, lh: lhHits.length ? { mode, hits: lhHits } : { mode } });
  };
  // パッド：(lane×step) の hit（deg 省略＝R 扱い＝resolveLh の deg??"R" と同契約）を探す。
  const lhStartAt = (lane: LhLaneDeg, s: number) => lhHits.find((h) => h.step === s && (h.deg ?? "R") === lane);
  const lhSustainAt = (lane: LhLaneDeg, s: number) =>
    lhHits.some((h) => (h.deg ?? "R") === lane && h.step < s && s < h.step + (h.dur || 1));
  // セルタップ＝その (lane×step) の hit だけ add/remove（**同 step 他レーンは消さない**＝ポリフォニック）。
  const toggleLhPad = (lane: LhLaneDeg, s: number) => {
    const dur = dotted ? len * 1.5 : len;
    let hits: NonNullable<ChordLhContent["hits"]>;
    if (lhStartAt(lane, s)) {
      hits = lhHits.filter((h) => !(h.step === s && (h.deg ?? "R") === lane)); // 同じ所をタップ＝消す
    } else {
      hits = [...lhHits, { step: s, deg: lane, dur }].sort((a, b) => a.step - b.step);
      void previewNote({ pitch: LH_PAD_PREVIEW[lane], start: 0, dur: 0.4, program }); // 置いた度数を即鳴らす
    }
    editContent({ ...pattern, lh: { mode: "custom", hits } });
  };

  // #29 §9 発火＝onset セルのみ持ち上げる（sustain/空セルは null＝キャプチャしない・誤爆防止）。
  // 縦のみ（横=分割は無効＝arp 軸の領分）。デテント＝弱く64/普通100/強く112（磁石スナップ）。
  const fireChord = (s: number, anchor: DOMRect): HoldDragStart | null => {
    const h = startAt(s);
    if (!h) return null;
    const vel = h.vel ?? CHORD_BASE_VEL;
    const detents = [CHORD_SOFT, CHORD_BASE_VEL, CHORD_ACCENT];
    setDrag({ step: s, vel, anchor });
    for (const p of voicingPreviewPitches({ ...v, top }, program)) void previewNote({ pitch: p, start: 0, dur: 0.4, vel });
    return { vel, div: 1, detents };
  };
  const dragChord = (s: number, st: HoldDragState) => {
    setDrag((d) => (d && d.step === s ? { ...d, vel: st.vel } : d));
    if (st.detentHit) for (const p of voicingPreviewPitches({ ...v, top }, program)) void previewNote({ pitch: p, start: 0, dur: 0.3, vel: st.vel });
  };
  // 確定＝縦=velocity を1回の onChange で（普通=100 は vel キー削除＝bit）。
  const commitChord = (s: number, st: { vel: number }) => {
    setDrag(null);
    const nextVel = st.vel === CHORD_BASE_VEL ? undefined : st.vel;
    editContent({ ...pattern, hits: chordHitsWithVel(pattern.hits, s, nextVel) });
  };

  // プレビューは常に新モデル（top 込み）で描く＝旧パターンでも結果が見える。
  const previewNeta = { kind: "chord_pattern", content: { ...pattern, voicing: { ...v, top }, program }, key: 0 } as unknown as Neta;

  return (
    <div className="cp-editor">
      {/* 「パターンを選ぶ ▸」帯（修理#1・監査推奨差分1）＝型辞書の入口を単体エディタへ。既定閉＝開くまで既存DOM/挙動不変。
          修理#3 決定③：showPicker=false（管弦=section_inst）で帯ごと非表示＝コード楽器型の誤適用を断つ。
          決定④：手編集済みは patternId に「（改）」を添えて帯が嘘をつかない。 */}
      {showPicker && (
        <PatternPickerBar
          nowLabel={pattern.patternId != null ? pattern.patternId + (pattern.patternEdited ? "（改）" : "") : undefined}
          chips={COMP_GENRE_CHIPS}
          onFetch={fetchPatterns}
        />
      )}
      {/* ① いつ弾く（主役）：グリッド＋長さ＋小節 */}
      <div className="cp-when">
        <p className="cp-zlabel">いつ弾く（タップで配置{isArp ? "＝各hitで次の音" : ""}）</p>
        <div className="rhythm-editor" ref={scrollerRef}>
          <div className="proll-playhead" aria-hidden="true" ref={playheadRef} style={{ left: `calc(${NAME_PX}px + var(--phb, 0) * ${BEAT_PX}px)` }} />
          <div className="rhythm-row">
            <span className="rhythm-name">コード</span>
            {Array.from({ length: pattern.steps }, (_, s) => {
              const head = startAt(s);
              const isDrag = !!drag && drag.step === s;
              return (
                <ChordCell
                  key={s}
                  ariaLabel={`hit-${s}`}
                  className={"rhythm-cell" + (head ? " on" : sustainAt(s) ? " sustain" : "") + (isDrag ? " lift" : "") + (s % stepsPerBar === 0 ? " bar" : s % beatStep === 0 ? " beat" : "")}
                  hv={isDrag ? drag.vel / 127 : head ? (head.vel ?? CHORD_BASE_VEL) / 127 : null}
                  onTap={() => toggleHit(s)}
                  onFire={(anchor) => fireChord(s, anchor)}
                  onDrag={(st) => dragChord(s, st)}
                  onCommit={(st) => commitChord(s, st)}
                  onCancel={() => setDrag(null)}
                />
              );
            })}
          </div>
          {/* S3 D/U ストリップ（guitar 解決時のみ・モックB）：hit のあるセルに D/U を表示（明示=実線／自動既定=薄）・タップで反転。 */}
          {guitarResolved && (
            <div className="rhythm-row cp-du-row" aria-label="du-strip">
              <span className="rhythm-name">D/U</span>
              {Array.from({ length: pattern.steps }, (_, s) => {
                const head = startAt(s);
                if (!head) return <span key={s} className="rhythm-cell cp-du-cell empty" aria-hidden="true" />;
                const explicit = head.dir != null;
                const d = head.dir ?? duDefault(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-label={`dir-${s}`}
                    className={"rhythm-cell cp-du-cell" + (explicit ? " on" : " auto") + (d === "U" ? " up" : " down")}
                    onClick={() => toggleDir(s)}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {guitarResolved && (
          <p className="cp-hint">ストローク向き＝表拍D・裏Uが自動既定・タップで入替。アップは軽く・上位の弦だけ鳴る。</p>
        )}
        <div className="cp-when-row">
          {/* 長さツールはメロ編集(PianoRoll)と同じ proll-tools で包む＝見た目・選択表示を統一。 */}
          <div className="proll-tools">
            <NoteValuePicker options={LENGTHS} value={len} dotted={dotted} onChange={setLen} onToggleDotted={() => setDotted((d) => !d)} />
          </div>
          <BarsControl bars={bars} max={4} onChange={(n) => editContent({ ...pattern, steps: Math.max(1, Math.min(4, n)) * stepsPerBar })} />
        </div>
      </div>

      {/* ② 響き（どう鳴らす）：音の作り込みを1ゾーンに */}
      <div className="cp-voicing" aria-label="voicing">
        <p className="cp-zlabel">響き（どう鳴らす）</p>
        <div className="cp-vrow">
          <span className="cp-vlbl">打ち方</span>
          <div className="seg" role="group" aria-label="mode">
            <button type="button" className={!isArp ? "on" : ""} onClick={() => editContent({ ...pattern, mode: "strum" })}>ストローク</button>
            <button type="button" className={isArp ? "on" : ""} onClick={() => editContent({ ...pattern, mode: "arp" })}>アルペジオ</button>
          </div>
        </div>
        <div className="cp-vrow">
          <span className="cp-unit">
            <span className="cp-vlbl">トップ</span>
            <div className="cp-top" aria-label="top">
              <button type="button" aria-label="top-dec" onClick={() => setV({ top: Math.max(48, top - 1) })}>−</button>
              <span aria-label="top-note">{pitchName(top)}</span>
              <button type="button" aria-label="top-inc" onClick={() => setV({ top: Math.min(88, top + 1) })}>＋</button>
            </div>
          </span>
          <span className="cp-unit">
            <span className="cp-vlbl">広がり</span>
            <div className="seg seg-chord" role="group" aria-label="spread">
              <button type="button" className={v.openClose === "close" ? "on" : ""} onClick={() => setV({ openClose: "close" })}>close</button>
              <button type="button" className={v.openClose === "open" ? "on" : ""} onClick={() => setV({ openClose: "open" })}>open</button>
            </div>
          </span>
        </div>
        <div className="cp-vrow">
          {isArp ? (
            <>
              <span className="cp-unit">
                <span className="cp-vlbl">向き</span>
                <div className="seg seg-chord" role="group" aria-label="arp-dir">
                  <button type="button" aria-label="arp-up" className={(v.arpDir ?? "up") === "up" ? "on" : ""} onClick={() => setV({ arpDir: "up" })}>↑</button>
                  <button type="button" aria-label="arp-down" className={v.arpDir === "down" ? "on" : ""} onClick={() => setV({ arpDir: "down" })}>↓</button>
                  <button type="button" aria-label="arp-updown" className={v.arpDir === "updown" ? "on" : ""} onClick={() => setV({ arpDir: "updown" })}>↑↓</button>
                </div>
              </span>
              <span className="cp-unit">
                <span className="cp-vlbl">駆け上がり幅</span>
                <div className="cp-top" aria-label="arp-octaves-ctrl">
                  <button type="button" aria-label="arp-oct-dec" onClick={() => setV({ arpOctaves: Math.max(1, (v.arpOctaves ?? 1) - 1) })}>−</button>
                  <span aria-label="arp-octaves">{v.arpOctaves ?? 1}oct</span>
                  <button type="button" aria-label="arp-oct-inc" onClick={() => setV({ arpOctaves: Math.min(4, (v.arpOctaves ?? 1) + 1) })}>＋</button>
                </div>
              </span>
              <span className="cp-unit">
                <span className="cp-vlbl">区切り</span>
                <select className="cp-select" aria-label="arp-reset" value={v.arpReset ?? 0} onChange={(e) => setV({ arpReset: Number(e.target.value) || undefined })}>
                  <option value={0}>なし（連続）</option>
                  <option value={0.5}>0.5拍ごと</option>
                  <option value={1}>1拍ごと</option>
                  <option value={1.5}>1.5拍ごと</option>
                  <option value={2}>2拍ごと</option>
                  <option value={3}>3拍ごと</option>
                  <option value={4}>1小節ごと</option>
                </select>
              </span>
            </>
          ) : (
            <button type="button" className={"cp-chk" + (v.powerChord ? " on" : "")} aria-label="power-chord" aria-pressed={!!v.powerChord} onClick={() => setV({ powerChord: !v.powerChord })}>
              パワーコード（3rd抜き）
            </button>
          )}
          <span className="cp-unit">
            <span className="cp-vlbl">高さ</span>
            <div className="cp-top" aria-label="octave-ctrl">
              <button type="button" aria-label="oct-dec" onClick={() => setV({ octave: Math.max(-1, v.octave - 1) })}>−</button>
              <span aria-label="octave">{v.octave}</span>
              <button type="button" aria-label="oct-inc" onClick={() => setV({ octave: Math.min(2, v.octave + 1) })}>＋</button>
            </div>
          </span>
        </div>
        {/* ④奏法（CP行契約の4行目・スライスB／Fable UX監査①＝案イ）：奏法の変更手段は MetaPanel「奏法」select 一本に一本化。
            ここは**読み取り専用サマリ**＝auto 解決結果を文言表示（タップ不可）。編集子でなく表示子。
            ギター解決時のみ「じゃら〜ん」(strumMs) を残す＝唯一の微調整ノブ（速さ）。 */}
        <div className="cp-vrow">
          <span className="cp-vlbl">奏法</span>
          <span className="cp-perf-summary" aria-label="voicing-style-summary">
            いまの奏法：{guitarResolved ? (v.style === "auto" ? "ギター（音色から）" : "ギター") : (v.style === "auto" ? "鍵盤（音色から）" : "鍵盤")}
          </span>
          {guitarResolved && (
            <span className="cp-unit">
              <span className="cp-vlbl">ストロークの速さ</span>
              <div className="seg seg-chord" role="group" aria-label="strum-ms">
                {STRUM_MS_LABELS.map((lab, i) => {
                  const cur = (v.strumMs ?? 0);
                  // 現在値を最寄り段へ（保存値が段の代表値でなくても正しい段が光る）。
                  const selIdx = STRUM_MS_STAGES.reduce((best, ms, idx) => (Math.abs(ms - cur) < Math.abs(STRUM_MS_STAGES[best]! - cur) ? idx : best), 0);
                  return (
                    <button key={lab} type="button" aria-label={`strum-${i}`} className={selIdx === i ? "on" : ""} onClick={() => setV({ strumMs: STRUM_MS_STAGES[i] })}>{lab}</button>
                  );
                })}
              </div>
            </span>
          )}
        </div>
        {/* ⑤左手（CP行契約の5行目・S3＋Task1）：keyboard 解決時のみ。OFF/ルート/+5度/8va＝lh.mode preset＋
            「自分で」＝custom（Task1）。custom を選ぶと度数パッド（R/3/5/8 × steps・ポリフォニック）を行下に展開。
            style 無し(既存ネタ)でも keyboard 解決＝表示。 */}
        {keyboardResolved && (
          <>
            <div className="cp-vrow">
              <span className="cp-vlbl">左手</span>
              <div className="seg seg-chord" role="group" aria-label="lh-mode">
                <button type="button" aria-label="lh-off" className={!pattern.lh ? "on" : ""} onClick={() => setLhMode("off")}>OFF</button>
                <button type="button" aria-label="lh-root" className={pattern.lh?.mode === "root" ? "on" : ""} onClick={() => setLhMode("root")}>ルート</button>
                <button type="button" aria-label="lh-root5" className={pattern.lh?.mode === "root5" ? "on" : ""} onClick={() => setLhMode("root5")}>+5度</button>
                <button type="button" aria-label="lh-oct" className={pattern.lh?.mode === "oct" ? "on" : ""} onClick={() => setLhMode("oct")}>8va</button>
                <button type="button" aria-label="lh-custom" className={pattern.lh?.mode === "custom" ? "on" : ""} onClick={() => setLhMode("custom")}>自分で</button>
              </div>
            </div>
            {/* Task1 左手パッド＝度数レーン（上から 8/5/3/R）×ステップ。セルタップで (lane×step) の hit だけ
                add/remove＝**同 step 複数レーン ON 可（ポリフォニック）**。音長＝上の長さツール（NoteValuePicker）を共有。 */}
            {pattern.lh?.mode === "custom" && (
              <div className="cp-lh-pad" role="grid" aria-label="lh-pad">
                {LH_LANES.map((lane) => (
                  <div className="cp-lh-lane" role="row" key={lane.d}>
                    <div className="cp-lh-label">{lane.label}</div>
                    {Array.from({ length: pattern.steps }, (_, s) => {
                      const on = !!lhStartAt(lane.d, s);
                      const sus = lhSustainAt(lane.d, s);
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-label={`lh-pad-${lane.d}-${s}`}
                          aria-pressed={on}
                          className={"cp-lh-cell" + (on ? " on" : sus ? " sustain" : "") + (s % stepsPerBar === 0 ? " bar" : s % beatStep === 0 ? " beat" : "")}
                          onClick={() => toggleLhPad(lane.d, s)}
                        >
                          {on ? lane.label : ""}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {pattern.hits.length > 0 && (
          <div className="chord-roll" aria-label="voicing-roll">
            <MiniRoll neta={previewNeta} />
          </div>
        )}
      </div>
      {drag && (
        <DragHud anchor={drag.anchor} vel={drag.vel} div={1} base={CHORD_BASE_VEL} detents={[CHORD_SOFT, CHORD_BASE_VEL, CHORD_ACCENT]} />
      )}
    </div>
  );
}
