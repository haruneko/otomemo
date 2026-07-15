import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { beatsPerBar, pitchName, pc, isBlack, scalePcSet, type Note } from "../music";
import { previewNote } from "../audio";
import { flowLyric, splitMora, setSyllable, nextNoteIndex } from "../lyrics";
import { computeLyricHits, sylFitClass } from "../lyricFit";
import { nudgeNotes, duplicateSel, deleteSel, copySel, pasteNotes } from "../noteEdit";
import { NoteValuePicker } from "./NoteValuePicker";

// ノート編集のクリップボード（モジュール保持＝別ネタへも貼れる・design N1）。
let noteClipboard: Note[] = [];

const CELL_PX = 12; // .proll-cell の幅。1拍=SUBDIV*CELL_PX で playhead を px 配置（横スクロール追従）。
const KEY_PX = 40; // .proll-key の幅

const noteName = pitchName; // 音名（SSOT: music.pitchName）
// pc/isBlack/scalePcSet は music.ts の共通実装（SkeletonEditor と共有・SSOT）。

const DEFAULT_LOW = 60; // C4
const DEFAULT_HIGH = 83; // B5
const SUBDIV = 4; // 1拍を16分まで刻む

// 音長ツール（拍）。velocity編集は後回し（一律100）。
const LENGTHS = [
  { label: "16", v: 0.25 },
  { label: "8", v: 0.5 },
  { label: "4", v: 1 },
  { label: "2", v: 2 },
  { label: "1", v: 4 },
];

// 見た目=実音のピアノロール：音域は content に追従、ノートは実 start/dur のバーで忠実表示。
// セルクリックで配置（同位置は置換）、ノートバークリックで削除。
export function PianoRoll({
  notes,
  onChange,
  beats = 16,
  pickup = 0,
  playheadRef,
  scrollerRef,
  low = DEFAULT_LOW,
  high = DEFAULT_HIGH,
  enableLyric = false,
  mode = "draw",
  ghostNotes,
  readOnly = false,
  meter,
  keyRoot,
  keyMode,
  onSing,
  singing = false,
}: {

  notes: Note[];
  onChange: (n: Note[]) => void;
  beats?: number;
  meter?: string; // 拍子（小節線・複製単位・小節数を拍子で正しく／6/8対応・評価修正B）
  pickup?: number; // 弱起（アウフタクト）：拍0の前に置ける lead-in 拍数。負 start の音を扱う。
  playheadRef?: Ref<HTMLDivElement>; // #58 再生プレイヘッド（--phb 生beatを ref直書き）
  scrollerRef?: Ref<HTMLDivElement>; // #74 追従スクロール対象（.proll）
  low?: number; // 既定で見せる最低音（bass は E1=28 など低域既定）
  high?: number; // 既定で見せる最高音
  enableLyric?: boolean; // メロのみ：歌詞流し込み（LS3・design L2）
  mode?: "draw" | "select" | "erase" | "lyric"; // 描く/選ぶ/消す/詞（トグルは KindEditorBody 側。詞=歌詞リタッチ・メロのみ）
  ghostNotes?: Note[]; // 崩し候補モード：元メロを半透明ゴーストで重ねる（比較用・非操作）
  readOnly?: boolean; // 候補レビュー中は編集不可（クリックで足さない）
  keyRoot?: number; // P0-a 調の主音(0-11)。指定時、行を調内音でハイライト＝「外し音を避ける」足場。
  keyMode?: string; // "major"/"minor"（既定=major）。短調は自然的短音階で判定。
  onSing?: () => void; // ♪歌う（W-K3）：歌詞付きメロを VOICEVOX で歌わせる。未指定＝ボタン非表示。
  singing?: boolean; // 歌声生成中（スピナー文言・連打ガードは親）。
}) {
  const [noteLen, setNoteLen] = useState(1);
  const [dotted, setDotted] = useState(false); // 付点：選択音価を ×1.5（6/8 の付点四分=1.5拍 等）
  const [lyricDraft, setLyricDraft] = useState(""); // 流し込む歌詞（かな・読み）。永続せずUIだけ
  // W-K2：歌詞×メロのアクセント整合ハイライト（既定ON・軽い凡例）。openReason=理由ポップを開くチップの index。
  const [showFit, setShowFit] = useState(true);
  const [openReason, setOpenReason] = useState<number | null>(null);
  // hits はノート列/歌詞が変わった時だけ再計算（純関数 analyzeLyricFit へ委譲）。歌詞なしは空 Map＝ゼロ影響。
  const hitMap = useMemo(() => computeLyricHits(notes), [notes]);
  const hasLyric = useMemo(() => notes.some((n) => n.syllable), [notes]);
  // ノート編集（design N1・案A）：選択(index集合)・貼付arm。描く に戻ったら選択解除。
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pasteArmed, setPasteArmed] = useState(false);
  useEffect(() => {
    if (mode !== "select") {
      // 描く/消す へ移ったら選択・貼付を解除（選択編集は選ぶ専用）。
      setSelected(new Set());
      setPasteArmed(false);
    }
  }, [mode]);
  // 詞モード（歌詞リタッチ）：編集対象の音符 index と入力中の値。固定入力バー1本を使い回す
  // ＝IMEキーボードを畳まず連続リタッチできる（インライン input だと対象切替でキーボードが落ちる）。
  const [lyrTarget, setLyrTarget] = useState<number | null>(null);
  const [lyrVal, setLyrVal] = useState("");
  const lyrInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mode !== "lyric") setLyrTarget(null); // 詞モードを離れたら編集対象を解除
  }, [mode]);
  /** 入力中の値を対象音符へ確定（空=クリア・「ー」=メリスマ可）。advance=true なら時間順で次の音符へフォーカス。 */
  function lyrCommit(advance: boolean) {
    if (lyrTarget == null || lyrTarget >= notes.length) return;
    const updated = setSyllable(notes, lyrTarget, lyrVal);
    if ((notes[lyrTarget]!.syllable ?? "") !== (updated[lyrTarget]!.syllable ?? "")) onChange(updated);
    if (!advance) return;
    const nx = nextNoteIndex(notes, lyrTarget);
    if (nx == null) {
      setLyrTarget(null); // 最後の音符＝編集終了
      return;
    }
    setLyrTarget(nx);
    setLyrVal(updated[nx]?.syllable ?? "");
    lyrInputRef.current?.focus(); // キーボードを保つ（同一 input なので通常保たれる・保険）
  }

  // 崩し候補モードは候補(notes)＋ゴースト(元)の両方が収まる範囲/尺で描く。
  const rangeNotes = useMemo(() => (ghostNotes ? [...notes, ...ghostNotes] : notes), [notes, ghostNotes]);
  const pitches = useMemo(() => {
    const lo = Math.min(low, ...rangeNotes.map((n) => n.pitch));
    const hi = Math.max(high, ...rangeNotes.map((n) => n.pitch));
    const arr: number[] = [];
    for (let p = hi; p >= lo; p--) arr.push(p);
    return arr;
  }, [rangeNotes, low, high]);
  // P0-a：調内音の集合（keyRoot 指定時のみ）。行の色分けに使う＝どの音が調の内/外か一目で分かる足場。
  const scalePcs = useMemo(() => scalePcSet(keyRoot, keyMode), [keyRoot, keyMode]);
  // 弱起ぶんの lead-in（拍0の前）。指定 pickup と既存の負 start を両方包む。拍0=ダウンビートは固定。
  const pre = useMemo(
    () => Math.max(0, pickup, Math.ceil(-Math.min(0, ...rangeNotes.map((n) => n.start)))),
    [pickup, rangeNotes],
  );
  // 表示尺は content に追従（生成/取込で beats を超える音もはみ出さない）＋弱起ぶん左へ。
  const span = useMemo(
    () => Math.max(beats, ...rangeNotes.map((n) => Math.ceil(n.start + n.dur))),
    [beats, rangeNotes],
  );
  const total = pre + span; // 表示する総拍（-pre 〜 span）
  const steps = total * SUBDIV;
  const bpb = beatsPerBar(meter); // 1小節の拍数（6/8=3・4/4=4）
  const barStep = SUBDIV * bpb; // 1小節ぶんの step 数（小節線・小節数の単位）

  function addAt(pitch: number, step: number) {
    const start = step / SUBDIV - pre; // 先頭 pre*SUBDIV セルは負拍（弱起）

    // クリック位置を覆う同ピッチの既存ノートがあれば消す（小数startのAI/MIDIノートも編集できる）
    const covering = notes.find(
      (n) => n.pitch === pitch && n.start <= start + 1e-9 && start < n.start + n.dur - 1e-9,
    );
    if (covering) {
      onChange(notes.filter((n) => n !== covering));
      return;
    }
    onChange([...notes, { pitch, start, dur: dotted ? noteLen * 1.5 : noteLen }]);
    void previewNote({ pitch, start: 0, dur: 0.4 }); // 置いた音を即鳴らす（入力フィードバック）
  }
  function removeNote(target: Note) {
    onChange(notes.filter((n) => n !== target));
  }

  // --- ノート編集（選ぶモード）。全て onChange 経由＝Undo/Redo が自動で効く（design N3）。 ---
  const GRID = 1 / SUBDIV; // 1セル=16分＝時間nudgeの単位（拍）
  function onNoteClick(gi: number, target: Note, e: { stopPropagation: () => void }) {
    e.stopPropagation();
    if (readOnly) return; // 候補レビュー中は編集しない
    if (mode === "lyric") {
      // 詞モード＝ノートは消さない（作成/移動/削除を無効化＝タップ競合の構造的解消）。
      // 別の音符をタップ＝入力中の値を先に確定してから対象を切替（打った値を失わない）。
      if (lyrTarget != null && lyrTarget !== gi) lyrCommit(false);
      setLyrTarget(gi);
      setLyrVal(target.syllable ?? "");
      // rAF で確実にフォーカス（onChange 由来の再レンダ後でも input は同一要素）。
      requestAnimationFrame(() => lyrInputRef.current?.focus());
      return;
    }
    if (mode !== "select") {
      removeNote(target); // 描く/消す＝ノートtapで削除
      return;
    }
    setSelected((s) => {
      const t = new Set(s);
      if (t.has(gi)) t.delete(gi);
      else t.add(gi);
      return t;
    });
  }
  function onCellClick(pitch: number, step: number) {
    if (readOnly) return; // 候補レビュー中は編集しない
    if (mode === "lyric") return; // 詞＝空セルは無反応（ノート作成を無効化）
    if (mode === "erase") return; // 消す＝空セルは無反応（ノートtapのみ削除）
    if (mode === "draw") {
      addAt(pitch, step);
      return;
    }
    if (pasteArmed && noteClipboard.length) {
      const at = step / SUBDIV - pre; // タップ位置の拍にクリップボードを置く
      const r = pasteNotes(notes, noteClipboard, at);
      onChange(r.notes);
      setSelected(r.selection);
      setPasteArmed(false);
      return;
    }
    setSelected(new Set()); // 空タップ＝全解除
  }
  const doNudge = (dPitch: number, dBeats: number) => onChange(nudgeNotes(notes, selected, dPitch, dBeats));
  function doDuplicate() {
    const r = duplicateSel(notes, selected, bpb); // +1小節右へ（拍子基準＝6/8なら+3拍）
    onChange(r.notes);
    setSelected(r.selection);
  }
  function doDelete() {
    onChange(deleteSel(notes, selected));
    setSelected(new Set());
  }
  function doCopy() {
    noteClipboard = copySel(notes, selected);
    setPasteArmed(false);
  }

  return (
    <div className="proll-wrap">
      <div className="proll-tools">
        <NoteValuePicker
          options={LENGTHS}
          value={noteLen}
          dotted={dotted}
          onChange={setNoteLen}
          onToggleDotted={() => setDotted((d) => !d)}
        />
      </div>
      {enableLyric && mode === "lyric" && (
        // 詞モード＝1音ずつリタッチ：固定入力バー（音符タップ→編集→確定で次へ）。一括は「流し込む」（他モード）と分業。
        <div className="proll-lyric-retouch" aria-label="lyric-retouch">
          <span className="muted">詞</span>
          {lyrTarget == null || lyrTarget >= notes.length ? (
            <span className="muted lyr-hint">音符をタップして歌詞を編集</span>
          ) : (
            <>
              <span className="lyr-pos">{noteName(notes[lyrTarget]!.pitch)}・{notes[lyrTarget]!.start}拍</span>
              <input
                ref={lyrInputRef}
                type="text"
                aria-label="syllable-input"
                placeholder="かな（空=消す・ー=のばす）"
                value={lyrVal}
                onChange={(e) => setLyrVal(e.target.value)}
                onKeyDown={(e) => {
                  // IME 変換確定の Enter では送らない（isComposing ガード）＝日本語入力で誤送を防ぐ。
                  if (e.key === "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing) lyrCommit(true);
                }}
              />
              <button type="button" aria-label="syllable-commit" onClick={() => lyrCommit(true)}>
                確定→次
              </button>
              <button
                type="button"
                aria-label="syllable-close"
                onClick={() => {
                  lyrCommit(false); // 打ちかけを確定してから閉じる（失わない）
                  setLyrTarget(null);
                }}
              >
                ✕
              </button>
            </>
          )}
        </div>
      )}
      {enableLyric && mode !== "lyric" && (
        // 入力欄は1行フル幅（IMEキーボード表示中もロールと喧嘩しない）＝操作ボタンは下段に小さく。
        <div className="proll-lyric-input">
          <div className="proll-lyric-row">
            <span className="muted">歌詞</span>
            <input
              type="text"
              aria-label="lyric-draft"
              placeholder="かな（読み）を入力→流し込む"
              value={lyricDraft}
              onChange={(e) => setLyricDraft(e.target.value)}
            />
          </div>
          <div className="proll-lyric-actions">
            <button
              type="button"
              aria-label="flow-lyric"
              disabled={!notes.length || splitMora(lyricDraft).length === 0}
              onClick={() => onChange(flowLyric(notes, splitMora(lyricDraft)))}
            >
              流し込む
            </button>
            {hasLyric && (
              <button type="button" aria-label="clear-lyric" onClick={() => onChange(notes.map((n) => ({ ...n, syllable: undefined })))}>
                クリア
              </button>
            )}
            {onSing && (
              // ♪歌う：歌詞が1つも無ければ disabled・連打/生成中は親が singing でロック。
              <button
                type="button"
                aria-label="sing"
                className="proll-sing"
                disabled={!hasLyric || singing}
                aria-busy={singing}
                onClick={onSing}
              >
                {singing ? "歌声を作っています…" : "♪歌う"}
              </button>
            )}
          </div>
        </div>
      )}
      {/* W-K2：歌詞があれば韻律チェックのトグル＋軽い凡例（既定ON・機械は候補まで＝どぎつくしない）。 */}
      {hasLyric && (
        <div className="proll-fit-toggle">
          <label>
            <input
              type="checkbox"
              aria-label="lyric-fit-toggle"
              checked={showFit}
              onChange={(e) => { setShowFit(e.target.checked); setOpenReason(null); }}
            />
            韻律チェック
          </label>
          {showFit && (
            <span className="proll-fit-legend muted">
              <span className="fit-red">赤=アクセント逆行</span>
              <span className="fit-yellow">黄=注意</span>
            </span>
          )}
        </div>
      )}
      {/* 理由（ⓘタップで開く一行説明）＝音符側の情報アイコンに移設したので、ポップは在り処が分かる in-flow バナーで。 */}
      {showFit && openReason != null && hitMap.get(openReason) && (
        <div className="proll-fit-reason" role="tooltip" onClick={() => setOpenReason(null)}>
          <b>{notes[openReason]?.syllable}</b>　{hitMap.get(openReason)!.ruleId}：{hitMap.get(openReason)!.note}
        </div>
      )}
      {/* 選択バー（選ぶモード）：複製/コピー/貼付/削除＋nudge移動（design N1）。 */}
      {mode === "select" && (
        <div className="proll-selbar" aria-label="selection-bar">
          <span className="muted">{selected.size}個</span>
          <button type="button" aria-label="dup" disabled={!selected.size} onClick={doDuplicate}>複製</button>
          <button type="button" aria-label="copy" disabled={!selected.size} onClick={doCopy}>コピー</button>
          <button type="button" aria-label="paste" className={pasteArmed ? "on" : ""} disabled={!noteClipboard.length} onClick={() => setPasteArmed((a) => !a)}>
            {pasteArmed ? "貼付：タップ" : "貼付"}
          </button>
          <button type="button" aria-label="del" disabled={!selected.size} onClick={doDelete}>削除</button>
          <span className="sel-nudge">
            <button type="button" aria-label="nudge-left" disabled={!selected.size} onClick={() => doNudge(0, -GRID)}>←</button>
            <button type="button" aria-label="nudge-right" disabled={!selected.size} onClick={() => doNudge(0, GRID)}>→</button>
            <button type="button" aria-label="nudge-up" disabled={!selected.size} onClick={() => doNudge(1, 0)}>↑</button>
            <button type="button" aria-label="nudge-down" disabled={!selected.size} onClick={() => doNudge(-1, 0)}>↓</button>
          </span>
        </div>
      )}
      <div className="proll" role="grid" aria-label="piano-roll" ref={scrollerRef}>
        {/* #58/#74 プレイヘッド：生beat --phb をコンテンツ座標(px)へ＝横スクロールに追従。1拍=SUBDIV*CELL_PX。 */}
        <div
          className="proll-playhead"
          aria-hidden="true"
          ref={playheadRef}
          style={{ left: `calc(${KEY_PX}px + var(--phb, 0) * ${SUBDIV * CELL_PX}px)` }}
        />
        {pitches.map((p) => {
          // P0-a：調が分かっている時だけ、行を「主音/調内/調外」で色分け（未指定＝従来どおり無着色）。
          const scaleCls = scalePcs
            ? keyRoot != null && pc(p) === pc(keyRoot)
              ? " tonic"
              : scalePcs.has(pc(p))
                ? " in-scale"
                : " out-scale"
            : "";
          return (
          <div className={"proll-row" + (isBlack(p) ? " black" : " white") + scaleCls} key={p} role="row">
            <div
              className={"proll-key" + (isBlack(p) ? " black" : " white") + scaleCls}
              role="button"
              aria-label={`key-${noteName(p)}`}
              onClick={() => void previewNote({ pitch: p, start: 0, dur: 0.5 })}
            >
              {noteName(p)}
            </div>
            <div className="proll-lane">
              {Array.from({ length: steps }, (_, s) => (
                <button
                  key={s}
                  type="button"
                  aria-label={`cell-${p}-${s}`}
                  className={
                    "proll-cell" +
                    (s % SUBDIV === 0 ? " beat" : "") +
                    (s >= pre * SUBDIV && (s - pre * SUBDIV) % barStep === 0 && s !== pre * SUBDIV ? " bar" : "") + // 小節線（拍子基準）
                    (s === pre * SUBDIV ? " downbeat" : "") + // 拍0＝ダウンビート（弱起の境目・1小節目頭）
                    (s < pre * SUBDIV ? " pickup" : "")
                  }
                  onClick={() => onCellClick(p, s)}
                />
              ))}
              {ghostNotes
                ?.filter((n) => n.pitch === p)
                .map((n, i) => (
                  <span
                    key={`ghost-${i}`}
                    className="proll-note ghost"
                    aria-hidden="true"
                    style={{
                      left: `${((n.start + pre) / total) * 100}%`,
                      width: `${(n.dur / total) * 100}%`,
                    }}
                  />
                ))}
              {notes
                .map((n, gi) => ({ n, gi }))
                .filter((x) => x.n.pitch === p)
                .map(({ n, gi }) => {
                  // W-K2：韻律hitはチップ別レーンでなく音符矩形の下辺ボーダーへ移設（歌詞をノート上に載せた結果）。
                  const hit = showFit ? hitMap.get(gi) : undefined;
                  const isMelisma = n.syllable === "ー" || n.syllable === "ｰ";
                  return (
                  <button
                    key={gi}
                    type="button"
                    aria-label={`note-${p}-${n.start}`}
                    className={
                      "proll-note" +
                      (selected.has(gi) ? " sel" : "") +
                      (mode === "erase" ? " erasing" : "") +
                      (mode === "lyric" && lyrTarget === gi ? " lyr-edit" : "") +
                      (hit ? " " + sylFitClass(hit.severity) : "")
                    }
                    style={{
                      left: `${((n.start + pre) / total) * 100}%`,
                      width: `${(n.dur / total) * 100}%`,
                    }}
                    title={
                      hit
                        ? `${noteName(p)} ${n.start}拍：${hit.ruleId} ${hit.note}`
                        : `${noteName(p)} ${n.start}拍 +${n.dur}`
                    }
                    onClick={(e) => onNoteClick(gi, n, e)}
                  >
                    {/* 歌詞を音符の中に載せる（中央・小フォント・見切れ可＝ズームで読める）。pointer-events無効で編集tapを塞がない。 */}
                    {n.syllable && (
                      <span className={"proll-note-syl" + (isMelisma ? " melisma" : "")} aria-hidden="true">
                        {n.syllable}
                      </span>
                    )}
                  </button>
                  );
                })}
              {/* 韻律hitの理由アイコン（ⓘ）＝音符の上に小さく。tapで理由バナーを開閉（stopPropagation＝編集tapと競合しない）。 */}
              {showFit &&
                notes
                  .map((n, gi) => ({ n, gi }))
                  .filter((x) => x.n.pitch === p && hitMap.get(x.gi))
                  .map(({ n, gi }) => {
                    const hit = hitMap.get(gi)!;
                    return (
                      <button
                        key={`fit-${gi}`}
                        type="button"
                        aria-label={`fit-info-${gi}`}
                        className={"proll-fit-mark " + sylFitClass(hit.severity)}
                        style={{ left: `${((n.start + pre) / total) * 100}%` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenReason((o) => (o === gi ? null : gi));
                        }}
                      >
                        i
                      </button>
                    );
                  })}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
