// 骨格エディタ（design #20 S2・方式C＝常時2声・ベース折返し表示）。PianoRoll を流用せず自前グリッドの
// 薄いラッパー（既存メロ編集を一切壊さない）。純ロジックは skeletonEdit.ts へ委譲＝ここは描画/入力のみ。
// 打点は **click ベース**＝タッチのスクロールでは click が発火しない（PianoRoll の <button onClick> と同方式）。
// さらに pointerdown からの移動閾値(isTap)＋pointercancel の保険＝スクロールでは絶対に点が置かれない（オーナーFB 2026-07-11）。
import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react";
import { pitchName, pc, isBlack, scalePcSet, beatsPerBar, skeletonPreviewNotes, buildPlayback, type ChordEntry, type SkeletonBreakpoint, type SkeletonContent, type PlaybackHandle } from "../music";
import { startPlayback } from "../playback";
import { previewNote } from "../audio";
import { api, type Neta } from "../api";
import { useDismiss } from "../useDismiss";
import { Icon } from "./Icon";
import { MiniRoll } from "./MiniRoll";
import {
  snapBeat,
  bandEnd,
  dominionSegments,
  upsertPoint,
  removePointAt,
  toggleRestAt,
  clipPhraseBeat,
  foldDisplayPitch,
  unfoldPitch,
  effectiveBassSegments,
  effectiveBassAt,
  analyzeCounterpoint,
  nudgePoints,
  deletePoints,
  skeletonPlaybackNotes,
  isTap,
  SKEL_MEL_PROGRAM,
} from "../skeletonEdit";

// MiniRoll は notes を渡すと neta.content を見ない（合成プレビューと同じ使い方）＝候補カードのダミー。
const CAND_NETA = { id: "", kind: "skeleton", tags: [] } as unknown as Neta;

const PPB = 44; // 1拍の px 幅
const ROWH = 13; // 1行(半音)の px 高さ
// pc/isBlack/scalePcSet は music.ts の共通実装（PianoRoll と共有・SSOT）。

type Voice = "melody" | "bass";
type SkelCand = { tones: SkeletonBreakpoint[]; bass?: SkeletonBreakpoint[]; phrases?: { endBeat: number; cadence?: string }[]; bars: number; label?: string };

export interface SkeletonEditorProps {
  tones: SkeletonBreakpoint[];
  setTones: (t: SkeletonBreakpoint[]) => void;
  bass: SkeletonBreakpoint[];
  setBass: (b: SkeletonBreakpoint[]) => void;
  phrases: { endBeat: number; cadence?: string }[];
  setPhrases: (p: { endBeat: number; cadence?: string }[]) => void;
  bars: number;
  setBars?: (n: number) => void; // 骨格の小節数を伸縮
  meter?: string;
  keyPc: number;
  keyMode: string; // "major"/"minor"
  chords: ChordEntry[]; // preview_chords（単体）or 同section由来（S3）→導出ベース
  rollMode: "draw" | "select" | "erase" | "lyric"; // lyric はメロ専用（骨格には来ない・来ても no-op）
  counterpoint: boolean; // 再生モード（親所有・playable に効く）
  setCounterpoint: (v: boolean) => void;
  tempo?: number; // 候補試聴のテンポ（未指定=120）
  playheadRef?: Ref<HTMLDivElement>;
  scrollerRef?: Ref<HTMLDivElement>;
  // 机（SkeletonDesk）埋め込み用の簡素モード。既定=false=単品UI（NetaDialog 経路）完全不変。
  //   true＝純ヘルプ（凡例/ヒント）と再生[対位法|実音]トグルを隠す（机では下端レンズ[畳み|実音]が担う）。
  //   残すノブ＝スナップ/入力先/ベース表示/小節±/機械に叩き台（レイアウトのみ簡素化）。
  embedded?: boolean;
}

export function SkeletonEditor(p: SkeletonEditorProps) {
  const [snap, setSnap] = useState(2);
  const [inputVoice, setInputVoice] = useState<Voice>("melody"); // 新規打点の入力先（既存点は触った声部を直接編集）
  const [foldOct, setFoldOct] = useState(24); // ベース表示の畳み量（+2oct=24 / +3oct=36）
  const [selected, setSelected] = useState<Set<string>>(new Set()); // voice@start
  // 叩き台候補（複数案・reshape-bar/cand-tray 流儀）。採用で置換（state経由＝Undoで戻れる）。
  const [cands, setCands] = useState<SkelCand[] | null>(null);
  const [stubMsg, setStubMsg] = useState<string | null>(null); // 生成失敗/0件の可視化（黙って消えない）
  const [busy, setBusy] = useState(false);
  const [skelColor, setSkelColor] = useState(0); // 骨格の色付け（脱平面化・WP-M1）＝強拍倚音のコーパス駆動注入。0=素直
  const [contour, setContour] = useState<string>(""); // 輪郭の型（かたち・WP-M1b）＝構造線を型の包絡へソフト制約で寄せる。""=おまかせ
  const audRef = useRef<PlaybackHandle | null>(null); // 候補試聴（前の再生を止めてから）
  useEffect(() => () => audRef.current?.stop(), []); // アンマウントで鳴りっぱなし防止
  const zoneRef = useRef<HTMLDivElement>(null);

  // #10 凡例＝(?)ポップ（useDismiss 流儀）。常設は色チップ3つのみ・詳細テキストはポップへ畳む。
  const [legendOpen, setLegendOpen] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);
  useDismiss(legendRef, legendOpen, useCallback(() => setLegendOpen(false), []));

  // #14-1 机（embedded）の設定パネル7行を折り畳み。既定=畳み（1行サマリー）・状態は localStorage 永続。
  //   叩き台ボタンは常設（下の JSX で collapsed 対象外）。単体（!embedded）は常に全開＝従来不変。
  const [settingsOpen, setSettingsOpen] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem("cm.skelDeskSettingsOpen") === "1";
  });
  const toggleSettings = useCallback(() => {
    setSettingsOpen((v) => {
      const next = !v;
      try { localStorage.setItem("cm.skelDeskSettingsOpen", next ? "1" : "0"); } catch { /* private mode 等は無視 */ }
      return next;
    });
  }, []);

  const bpb = beatsPerBar(p.meter);
  const total = p.bars * bpb;
  const phrases = p.phrases;
  const dispBass = (real: number) => foldDisplayPitch(real, foldOct); // 表示ピッチ＝実+畳み

  // 表示レンジ（メロ音域窓 G3..G5＝55..79。畳んだベース/メロ実音を含めて広げる）。
  const range = useMemo(() => {
    let hi = 79, lo = 55;
    for (const t of p.tones) if (t.pitch != null) { hi = Math.max(hi, t.pitch); lo = Math.min(lo, t.pitch); }
    for (const b of p.bass) if (b.pitch != null) { const d = dispBass(b.pitch); hi = Math.max(hi, d); lo = Math.min(lo, d); }
    for (const s of effectiveBassSegments(p.bass, p.chords, phrases, total)) { const d = dispBass(s.pitch); hi = Math.max(hi, d); lo = Math.min(lo, d); }
    return { hi, lo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.tones, p.bass, p.chords, foldOct, total]);
  const rows = range.hi - range.lo + 1;
  const W = total * PPB, H = rows * ROWH;
  const yOf = (pitch: number) => (range.hi - pitch) * ROWH;

  const scaleSet = useMemo(() => scalePcSet(p.keyPc, p.keyMode) ?? new Set<number>(), [p.keyPc, p.keyMode]);
  const bassSegs = useMemo(() => effectiveBassSegments(p.bass, p.chords, phrases, total), [p.bass, p.chords, phrases, total]);
  const cp = useMemo(
    () => analyzeCounterpoint(p.tones, (b) => effectiveBassAt(b, p.bass, p.chords, phrases, total)),
    [p.tones, p.bass, p.chords, phrases, total],
  );

  // ---- 座標変換 ----
  function beatFromX(clientX: number): number {
    const r = zoneRef.current?.getBoundingClientRect();
    return r ? (clientX - r.left) / PPB : 0;
  }
  function pitchFromY(clientY: number): number {
    const r = zoneRef.current?.getBoundingClientRect();
    const row = r ? Math.floor((clientY - r.top) / ROWH) : 0;
    return Math.max(range.lo, Math.min(range.hi, range.hi - row));
  }
  const ptsOf = (v: Voice) => (v === "melody" ? p.tones : p.bass);
  const setPtsOf = (v: Voice, next: SkeletonBreakpoint[]) => (v === "melody" ? p.setTones(next) : p.setBass(next));

  // ---- 空セルの静止タップ＝ブレークポイント追加（入力先＝inputVoice）。スクロールでは置かれない ----
  // click ベース（タッチスクロールは click を発火しない＝PianoRoll の <button onClick> と同性質）＋
  // pointerdown からの移動が TAP_SLOP 超なら無視（マウスのドラッグ後 click 対策）＋pointercancel で破棄
  // （ブラウザがスクロールにジェスチャを奪った合図）。
  const zoneDown = useRef<{ x: number; y: number } | null>(null);
  function onZonePointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).dataset.pt) return; // 点は個別ハンドラ
    zoneDown.current = { x: e.clientX, y: e.clientY };
  }
  function onZonePointerCancel() { zoneDown.current = null; } // スクロール＝タップでない
  function onZoneClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).dataset.pt) return; // 点上の click（ドラッグ後含む）は無視
    const d = zoneDown.current;
    zoneDown.current = null;
    if (!d || !isTap(e.clientX - d.x, e.clientY - d.y)) return; // パン（移動閾値超）＝打点しない
    if (p.rollMode !== "draw") { if (p.rollMode === "select") { setSelected(new Set()); } return; }
    const beat = snapBeat(beatFromX(e.clientX), snap, total);
    if (beat >= total - 1e-6) return;
    const v = inputVoice;
    const disp = v === "bass" ? foldOct : 0;
    const pitch = unfoldPitch(pitchFromY(e.clientY), disp);
    setPtsOf(v, upsertPoint(ptsOf(v), beat, pitch));
    void previewNote({ pitch, start: 0, dur: 0.4, program: SKEL_MEL_PROGRAM });
  }

  // ---- 点：draw=ドラッグ移動（pointerdown＋capture）／消す・選ぶ=click（スクロールでは発火しない） ----
  function onPointDown(e: React.PointerEvent, v: Voice, pt: SkeletonBreakpoint) {
    e.stopPropagation();
    if (p.rollMode !== "draw") return; // 消す/選ぶは onPointClick（静止タップのみ）
    const disp = v === "bass" ? foldOct : 0;
    // draw＝ドラッグ移動（既存点はタッチした声部を直接編集）。ドラッグ中は開始時点の点集合から
    // 対象1点を除いた base に、現在位置で upsert＝毎moveの再レンダで stale になっても重複しない。
    const dot = e.currentTarget as HTMLElement;
    dot.setPointerCapture(e.pointerId);
    const without = removePointAt(ptsOf(v), pt.start);
    const move = (ev: PointerEvent) => {
      const nb = snapBeat(beatFromX(ev.clientX), snap, total);
      const np = pt.pitch === null ? null : unfoldPitch(pitchFromY(ev.clientY), disp);
      setPtsOf(v, upsertPoint(without, nb, np)); // 移動先に別点があれば upsert が置換（重なり回避）
    };
    const up = () => { dot.removeEventListener("pointermove", move); dot.removeEventListener("pointerup", up); };
    dot.addEventListener("pointermove", move); dot.addEventListener("pointerup", up);
  }
  function onPointClick(e: React.MouseEvent, v: Voice, pt: SkeletonBreakpoint) {
    e.stopPropagation();
    if (p.rollMode === "erase") { setPtsOf(v, removePointAt(ptsOf(v), pt.start)); return; }
    if (p.rollMode === "select") {
      const k = v + "@" + pt.start;
      setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
    }
    // draw のドラッグ後 click は何もしない（移動は onPointDown 側で完了）
  }

  // ---- 句境界ドラッグ ----
  function onPhraseDown(e: React.PointerEvent, ph: { endBeat: number; cadence?: string }) {
    e.preventDefault(); e.stopPropagation();
    const h = e.currentTarget as HTMLElement;
    h.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const nb = clipPhraseBeat(beatFromX(ev.clientX), bpb, total);
      p.setPhrases(p.phrases.map((x) => (x === ph ? { ...x, endBeat: nb } : x)).sort((a, b) => a.endBeat - b.endBeat));
    };
    const up = () => { h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); };
    h.addEventListener("pointermove", move); h.addEventListener("pointerup", up);
  }
  function toggleCadence(ph: { endBeat: number; cadence?: string }) {
    p.setPhrases(p.phrases.map((x) => (x === ph ? { ...x, cadence: x.cadence === "full" ? "half" : "full" } : x)));
  }

  // ---- 休ストリップ（ゾーンと同じ静止タップ判定＝スクロールで休符を作らない） ----
  const restDown = useRef<{ x: number; y: number } | null>(null);
  function onRestPointerDown(e: React.PointerEvent) { restDown.current = { x: e.clientX, y: e.clientY }; }
  function onRestPointerCancel() { restDown.current = null; }
  function onRestClick(e: React.MouseEvent) {
    const d = restDown.current;
    restDown.current = null;
    if (!d || !isTap(e.clientX - d.x, e.clientY - d.y)) return;
    const beat = snapBeat(beatFromX(e.clientX), snap, total);
    if (beat >= total - 1e-6) return;
    setPtsOf(inputVoice, toggleRestAt(ptsOf(inputVoice), beat));
  }

  // ---- 選択編集（nudge/削除・noteEdit流儀のアダプタ流用） ----
  const selIdx = (v: Voice): Set<number> => {
    const sorted = [...ptsOf(v)].sort((a, b) => a.start - b.start);
    const out = new Set<number>();
    sorted.forEach((pt, i) => { if (selected.has(v + "@" + pt.start)) out.add(i); });
    return out;
  };
  function doNudge(dPitch: number, dBeats: number) {
    (["melody", "bass"] as Voice[]).forEach((v) => {
      const idx = selIdx(v);
      if (idx.size) setPtsOf(v, nudgePoints(ptsOf(v), idx, dPitch, dBeats, total));
    });
    // 選択キーを更新（拍が動くのでキーを付け替え）
    setSelected((prev) => {
      const n = new Set<string>();
      prev.forEach((k) => {
        const [v, s] = [k.split("@")[0] as Voice, Number(k.split("@")[1])];
        n.add(v + "@" + snapBeat(s + dBeats, snap, total));
      });
      return n;
    });
  }
  function doDelete() {
    (["melody", "bass"] as Voice[]).forEach((v) => {
      const idx = selIdx(v);
      if (idx.size) setPtsOf(v, deletePoints(ptsOf(v), idx));
    });
    setSelected(new Set());
  }

  // ---- 機械に叩き台（gen_skeleton→複数候補→試聴→採用で確定・破壊上書きしない） ----
  // seed を送らない＝API が別 seed の複数案（既定3件）を返す。失敗/0件は stubMsg で可視化（黙って消えない）。
  async function genStub() {
    if (busy) return;
    setBusy(true);
    setStubMsg(null);
    try {
      const r = await api.music<{ items: { content: unknown; label?: string }[] }>("gen_skeleton", {
        frame: { key: p.keyPc, mode: p.keyMode, meter: p.meter, bars: p.bars },
        ...(p.chords.length ? { chords: p.chords } : {}),
        ...(skelColor > 0 ? { skelColor } : {}),
        ...(contour ? { contour } : {}),
      });
      const list: SkelCand[] = (r.items ?? []).flatMap((it): SkelCand[] => {
        const c = it.content as { bars?: number; tones?: SkeletonBreakpoint[]; bass?: SkeletonBreakpoint[]; phrases?: { endBeat: number; cadence?: string }[] } | undefined;
        return c && Array.isArray(c.tones) ? [{ bars: c.bars ?? p.bars, tones: c.tones, bass: c.bass, phrases: c.phrases, label: it.label }] : [];
      });
      if (list.length) setCands(list);
      else setStubMsg("叩き台の候補が返りませんでした（もう一度どうぞ）");
    } catch {
      setStubMsg("叩き台の生成に失敗（APIに繋がっていない可能性）");
    } finally { setBusy(false); }
  }
  const candContent = (c: SkelCand): SkeletonContent => ({ bars: c.bars, tones: c.tones, ...(c.bass ? { bass: c.bass } : {}), ...(c.phrases ? { phrases: c.phrases } : {}) });
  // 試聴＝現在の再生モード（対位法/実音）とコード文脈で2声を鳴らす。前の試聴は止める。
  async function auditionStub(c: SkelCand) {
    audRef.current?.stop();
    const ns = skeletonPlaybackNotes(candContent(c), { counterpoint: p.counterpoint, chords: p.chords, beatsPerBar: bpb });
    if (ns.length) audRef.current = await startPlayback(buildPlayback({ kind: "notes", notes: ns, tempo: p.tempo ?? 120 }), { vocalMode: "off" }); // 骨格＝歌う対象なし（#27）
  }
  // 採用＝置換（tones/bass/phrases は親 state 経由＝編集履歴 snapshot に乗る＝Undo で戻れる）。
  function adoptStub(c: SkelCand) {
    audRef.current?.stop();
    p.setTones(c.tones);
    p.setBass(c.bass ?? []);
    if (c.phrases) p.setPhrases(c.phrases);
    setCands(null);
    setSelected(new Set());
  }
  function closeStub() {
    audRef.current?.stop();
    setCands(null);
  }

  // #14-1 折り畳み時の1行サマリー（現在値の要約）。例「2拍・メロ・+2oct・8小節・素直・おまかせ」。
  const settingsSummary = [
    snap === 2 ? "2拍" : snap === 1 ? "1拍" : "自由",
    inputVoice === "bass" ? "ベース" : "メロ",
    `+${foldOct / 12}oct`,
    `${p.bars}小節`,
    skelColor === 0 ? "素直" : skelColor <= 0.4 ? "少し" : "濃い",
    ({ "": "おまかせ", arch: "山", asc: "のぼり", desc: "くだり", valley: "たに" } as Record<string, string>)[contour] ?? "おまかせ",
  ].join("・");

  const seg = (opts: [string, number][], val: number, set: (v: number) => void, aria: string) => (
    <span className="skel-seg" role="group" aria-label={aria}>
      {opts.map(([lab, v]) => (
        <button key={lab} type="button" className={val === v ? "on" : ""} aria-pressed={val === v} onClick={() => set(v)}>{lab}</button>
      ))}
    </span>
  );

  const bg = // グリッド背景（小節線/2拍線/拍線/行線）
    `repeating-linear-gradient(90deg,#5b6270 0 2px,transparent 2px ${bpb * PPB}px),` +
    `repeating-linear-gradient(90deg,#454b57 0 1px,transparent 1px ${2 * PPB}px),` +
    `repeating-linear-gradient(90deg,#2a2d33 0 1px,transparent 1px ${PPB}px),` +
    `repeating-linear-gradient(0deg,#1e2127 0 1px,transparent 1px ${ROWH}px),#1b1e23`;

  return (
    <div className="skeleton-editor">
      <div className={"skel-toolbar" + (p.embedded ? " embedded" : "") + (p.embedded && !settingsOpen ? " collapsed" : "")} aria-label="skeleton-toolbar">
        {/* #14-1 机（embedded）は設定7行を折り畳み＝既定は1行サマリー。単体は toggle を出さず常に全開（従来不変）。 */}
        {p.embedded && (
          <button type="button" className="skel-settings-toggle" aria-label="skel-settings-toggle" aria-expanded={settingsOpen} onClick={toggleSettings}>
            <span className="ss-caret">{settingsOpen ? "▲ 設定" : "▼ 設定"}</span>
            {!settingsOpen && <span className="ss-summary muted">{settingsSummary}</span>}
          </button>
        )}
        {/* display:contents ラッパ＝単体では素通し（従来レイアウト不変）・collapsed で display:none。DOM には残す
            （テスト互換＝skel-bars-inc 等の aria-label が畳んでも見つかる）。 */}
        <div className="skel-settings">
        <span className="skel-grp"><span className="muted">スナップ</span>{seg([["2拍", 2], ["1拍", 1], ["自由", 0]], snap, setSnap, "snap")}</span>
        <span className="skel-grp"><span className="muted">入力先</span>{seg([["メロ", 0], ["ベース", 1]], inputVoice === "bass" ? 1 : 0, (v) => setInputVoice(v ? "bass" : "melody"), "input-voice")}</span>
        <span className="skel-grp"><span className="muted">ベース表示</span>{seg([["+2oct", 24], ["+3oct", 36]], foldOct, setFoldOct, "fold-oct")}</span>
        {/* 再生[対位法|実音]は机では下端レンズ[畳み|実音]が担う＝embedded では重複を避けて隠す。単品は不変。 */}
        {!p.embedded && (
          <span className="skel-grp"><span className="muted">再生</span>{seg([["対位法", 1], ["実音", 0]], p.counterpoint ? 1 : 0, (v) => p.setCounterpoint(!!v), "play-mode")}</span>
        )}
        {p.setBars && (
          <span className="skel-grp"><span className="muted">小節</span>
            <button type="button" aria-label="skel-bars-dec" disabled={p.bars <= 1} onClick={() => p.setBars!(Math.max(1, p.bars - 1))}>−</button>
            <span aria-label="skel-bars">{p.bars}</span>
            <button type="button" aria-label="skel-bars-inc" onClick={() => p.setBars!(p.bars + 1)}>＋</button>
          </span>
        )}
        {/* 色付け＝脱平面化（WP-M1）。強拍に倚音（コーパス駆動の非和声音・必ず段進行で解決）を確率で入れ、主音平面を割る。 */}
        <span className="skel-grp" title="色付け＝強拍に倚音（非和声音）を混ぜて主音平面を割る。実曲の骨格は強拍の1/3が非和声音。">
          <span className="muted">色付け</span>{seg([["素直", 0], ["少し", 0.4], ["濃い", 0.8]], skelColor, setSkelColor, "skel-color")}
        </span>
        {/* かたち＝輪郭prior（WP-M1b）。構造線を型の包絡へソフト制約で寄せる（中間で効き終止/句末は終止規則が優先）。 */}
        <span className="skel-grp" title="かたち＝構造線の輪郭型。山=登って落ちる(サビ)/のぼり=右肩上がり(溜め)/くだり=下降終止/たに=下って戻る(ブリッジ)。中間で効き、終止は保つ。">
          <span className="muted">かたち</span>
          <span className="skel-seg" role="group" aria-label="skel-contour">
            {([["おまかせ", ""], ["山", "arch"], ["のぼり", "asc"], ["くだり", "desc"], ["たに", "valley"]] as [string, string][]).map(([lab, v]) => (
              <button key={lab} type="button" className={contour === v ? "on" : ""} aria-pressed={contour === v} onClick={() => setContour(v)}>{lab}</button>
            ))}
          </span>
        </span>
        </div>{/* /.skel-settings */}
        {/* 叩き台ボタンは常設（主動線）＝折り畳んでも残す（#14-1）。 */}
        <button type="button" className="tb-tool skel-stub-btn" aria-label="gen-skeleton-stub" disabled={busy} onClick={() => void genStub()}><Icon name="wand" size={16} /> 機械に叩き台</button>
        {p.rollMode === "select" && (
          <span className="skel-selbar" aria-label="skeleton-selbar">
            <span className="muted">{selected.size}個</span>
            <button type="button" aria-label="skel-del" disabled={!selected.size} onClick={doDelete}>削除</button>
            <button type="button" aria-label="skel-left" disabled={!selected.size} onClick={() => doNudge(0, -(snap || 0.25))}>←</button>
            <button type="button" aria-label="skel-right" disabled={!selected.size} onClick={() => doNudge(0, snap || 0.25)}>→</button>
            <button type="button" aria-label="skel-up" disabled={!selected.size} onClick={() => doNudge(1, 0)}>↑</button>
            <button type="button" aria-label="skel-down" disabled={!selected.size} onClick={() => doNudge(-1, 0)}>↓</button>
          </span>
        )}
      </div>

      {/* 叩き台の候補トレイ（ボタン直下＝見つかる位置・cand-tray 流儀）：各案に 試聴▶／採用。採用=置換（Undoで戻せる）。 */}
      {stubMsg && (
        <p className="fit-report" aria-label="stub-message" onClick={() => setStubMsg(null)}>
          {stubMsg} <span className="muted">（タップで消す）</span>
        </p>
      )}
      {cands && (
        <div className="reshape-bar" aria-label="skeleton-candidates" style={{ ["--k" as string]: "var(--k-skeleton, #7fb8d4)" }}>
          <span className="reshape-label">骨格の叩き台 {cands.length}案（▶試聴 → 採用で置換・Undoで戻せる／今の骨格は採用するまで不変）</span>
          <div className="cand-tray" aria-label="skeleton-cand-tray">
            {cands.map((c, i) => {
              const notes = skeletonPreviewNotes(candContent(c), bpb);
              return (
                <div key={i} className="cand-card" aria-label="skeleton-cand-card">
                  <span className="cand-preview">
                    <MiniRoll neta={CAND_NETA} notes={notes} />
                    <span className="cand-meta">{c.label ?? `案${i + 1}`}・{c.tones.filter((t) => t.pitch != null).length}点</span>
                  </span>
                  <div className="cand-actions">
                    <button type="button" className="tb-tool" aria-label={`stub-audition-${i}`} title="試聴" onClick={() => void auditionStub(c)}>▶</button>
                    <button type="button" className="tb-tool primary" aria-label={`stub-adopt-${i}`} title="この案で置換（Undo可）" onClick={() => adoptStub(c)}>採用</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="cand-tray-foot">
            <button type="button" className="tb-tool" aria-label="stub-again" disabled={busy} onClick={() => void genStub()}>{busy ? "…" : <><Icon name="dice" size={16} /> 別案</>}</button>
            <button type="button" className="tb-tool" aria-label="stub-close" onClick={closeStub}>閉じる</button>
          </div>
        </div>
      )}

      {/* #10 凡例＝常設は色チップ3つのみ。専門用語（度数=実音差mod12／並行5・8度…）は (?)ポップへ畳む
          （縦密度の緩和＋威圧感減）。embedded/単体とも同じ＝机でも色の意味が読める（従来は机で非表示だった）。 */}
      <div className="skel-legend muted" aria-label="skeleton-legend" ref={legendRef}>
        <span><i className="sw" style={{ background: "var(--k-melody)" }} />メロ骨格</span>
        <span><i className="sw" style={{ background: "var(--k-bass)" }} />ベース明示</span>
        <span><i className="sw sw-dash" />導出ベース</span>
        <button type="button" className="skel-legend-help" aria-label="skeleton-legend-help" aria-expanded={legendOpen} title="記号の意味" onClick={() => setLegendOpen((v) => !v)}>?</button>
        {legendOpen && (
          <div className="skel-legend-pop" role="tooltip" aria-label="skeleton-legend-pop">
            <p>度数=実音差mod12／強拍不協和=注意色／⚠並行5・8度／✕声部交差(実音)</p>
            <p>表示=ベース+{foldOct / 12}oct畳み・計算は実音{!p.embedded && <>／再生={p.counterpoint ? "対位法(ベース+1oct)" : "実音"}</>}</p>
          </div>
        )}
      </div>

      <div className="skel-scroll proll" ref={p.scrollerRef} role="grid" aria-label="skeleton-roll">
        <div className="proll-playhead" aria-hidden="true" ref={p.playheadRef} style={{ left: `calc(40px + var(--phb,0) * ${PPB}px)` }} />
        {/* 句ルーラー */}
        <div className="skel-phrases" style={{ width: W + 40 }}>
          <div className="skel-gutter">句</div>
          <div className="skel-phrase-zone" style={{ width: W }}>
            {(() => {
              const sorted = [...phrases].sort((a, b) => a.endBeat - b.endBeat);
              let prev = 0;
              return sorted.map((ph, i) => {
                const left = prev * PPB, w = (ph.endBeat - prev) * PPB;
                const barsN = Math.max(1, Math.round((ph.endBeat - prev) / bpb));
                prev = ph.endBeat;
                return (
                  <div key={i}>
                    <button type="button" className="skel-phrase-chip" aria-label={`phrase-${i}`} style={{ left: left + 2, width: Math.max(20, w - 4) }} onClick={() => toggleCadence(ph)}>
                      {barsN}小節 · {ph.cadence === "full" ? "全終止" : "半終止"}
                    </button>
                    {i < sorted.length - 1 && (
                      <span className="skel-phrase-handle" aria-label={`phrase-handle-${i}`} style={{ left: ph.endBeat * PPB }} onPointerDown={(e) => onPhraseDown(e, ph)} />
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
        {/* 本体：鍵盤列＋レーン */}
        <div className="skel-body">
          <div className="skel-keycol">
            {Array.from({ length: rows }, (_, i) => range.hi - i).map((pt) => (
              <div key={pt} className={"skel-key " + (isBlack(pt) ? "black" : "white") + (pc(pt) === pc(p.keyPc) ? " tonic" : "")} style={{ height: ROWH }} onClick={() => void previewNote({ pitch: pt, start: 0, dur: 0.5, program: SKEL_MEL_PROGRAM })}>
                {pitchName(pt)}
              </div>
            ))}
          </div>
          <div className="skel-zone" aria-label="skeleton-zone" ref={zoneRef} style={{ width: W, height: H, background: bg }} onPointerDown={onZonePointerDown} onPointerCancel={onZonePointerCancel} onClick={onZoneClick}>
            {/* スケール行ハイライト */}
            {Array.from({ length: rows }, (_, i) => range.hi - i).filter((pt) => scaleSet.has(pc(pt))).map((pt) => (
              <div key={"sc" + pt} className={"skel-hl" + (pc(pt) === pc(p.keyPc) ? " tonic" : "")} style={{ top: yOf(pt), height: ROWH }} />
            ))}
            {/* 導出/明示ベース帯（表示は畳み） */}
            {bassSegs.map((s, i) => {
              const d = dispBass(s.pitch);
              if (d > range.hi || d < range.lo) return null;
              return <div key={"bs" + i} className={"skel-band bass" + (s.source === "derived" ? " derived" : "")} style={{ left: s.start * PPB, width: Math.max(0, (s.end - s.start) * PPB - 2), top: yOf(d) + ROWH / 2 - 3 }} />;
            })}
            {/* メロ支配帯＋休符ハッチ */}
            {dominionSegments(p.tones, phrases, total).map((s, i) =>
              s.pitch === null ? (
                <div key={"mh" + i} className="skel-rest-hatch" style={{ left: s.start * PPB, width: (s.end - s.start) * PPB }} />
              ) : (
                (s.pitch <= range.hi && s.pitch >= range.lo) && <div key={"mb" + i} className="skel-band mel" style={{ left: s.start * PPB, width: Math.max(0, (s.end - s.start) * PPB - 2), top: yOf(s.pitch) + ROWH / 2 - 3 }} />
              ),
            )}
            {/* ベース休符ハッチ（明示null） */}
            {dominionSegments(p.bass, phrases, total).filter((s) => s.pitch === null).map((s, i) => (
              <div key={"bh" + i} className="skel-rest-hatch" style={{ left: s.start * PPB, width: (s.end - s.start) * PPB }} />
            ))}
            {/* 対位法マーク（メロ点の上）＝バッジ/⚠/✕ */}
            {cp.map((m, i) => {
              if (m.melPitch > range.hi || m.melPitch < range.lo) return null;
              const y = yOf(m.melPitch);
              return (
                <span key={"cp" + i}>
                  {m.interval && <span className={"skel-badge" + (m.dissonant ? " diss" : "")} style={{ left: m.start * PPB + 8, top: Math.max(0, y - 10) }}>{m.interval.label}</span>}
                  {m.parallel && <span className="skel-warn" style={{ left: m.start * PPB - 5, top: Math.max(0, y - 22) }} title={m.parallel === "P5" ? "並行5度" : "並行8度"}>⚠</span>}
                  {m.cross && <span className="skel-warn cross" style={{ left: m.start * PPB - 6, top: Math.max(0, y - 2) }} title="声部交差（実音でメロ<ベース）">✕</span>}
                </span>
              );
            })}
            {/* 点（メロ＝実音／ベース＝畳み表示） */}
            {/* draggable=draw時のみ touch-action:none（ドラッグ優先）。消す/選ぶは click＝スクロール可・誤爆なし。 */}
            {p.tones.map((pt) => pt.pitch != null && pt.pitch <= range.hi && pt.pitch >= range.lo && (
              <span key={"mp" + pt.start} data-pt="1" className={"skel-pt mel" + (p.rollMode === "draw" ? " draggable" : "") + (selected.has("melody@" + pt.start) ? " sel" : "") + (p.rollMode === "erase" ? " erasing" : "")}
                style={{ left: pt.start * PPB, top: yOf(pt.pitch) + ROWH / 2 }} title={`${pitchName(pt.pitch)} @${pt.start}拍`} onPointerDown={(e) => onPointDown(e, "melody", pt)} onClick={(e) => onPointClick(e, "melody", pt)} />
            ))}
            {p.bass.map((pt) => pt.pitch != null && dispBass(pt.pitch) <= range.hi && dispBass(pt.pitch) >= range.lo && (
              <span key={"bp" + pt.start} data-pt="1" className={"skel-pt bass" + (p.rollMode === "draw" ? " draggable" : "") + (selected.has("bass@" + pt.start) ? " sel" : "") + (p.rollMode === "erase" ? " erasing" : "")}
                style={{ left: pt.start * PPB, top: yOf(dispBass(pt.pitch)) + ROWH / 2 }} title={`${pitchName(pt.pitch)} @${pt.start}拍（実音・表示+${foldOct / 12}oct）`} onPointerDown={(e) => onPointDown(e, "bass", pt)} onClick={(e) => onPointClick(e, "bass", pt)} />
            ))}
          </div>
        </div>
        {/* 休ストリップ */}
        <div className="skel-rest-strip" aria-label="rest-strip" onPointerDown={onRestPointerDown} onPointerCancel={onRestPointerCancel} onClick={onRestClick}>
          <div className="skel-gutter">休</div>
          <div className="skel-rest-zone" style={{ width: W }}>
            {ptsOf(inputVoice).filter((pt) => pt.pitch === null).map((pt) => {
              const e = bandEnd(ptsOf(inputVoice), pt.start, phrases, total);
              return <span key={"r" + pt.start} className="skel-rest-mark" style={{ left: pt.start * PPB + 1, width: Math.max(14, (e - pt.start) * PPB - 2) }}>休</span>;
            })}
          </div>
        </div>
      </div>
      {/* ヒント文＝純ヘルプ。机では邪魔＝embedded では隠す。単品は不変。 */}
      {!p.embedded && (
        <p className="muted lanes-hint">空きタップ=打点（入力先の声部・次点まで自動延伸）／点ドラッグ=移動／⌫消す=点タップで削除／句チップ=全↔半終止／休ストリップ=骨格休符。度数/並行/交差は実音判定・指摘のみ。</p>
      )}
    </div>
  );
}
