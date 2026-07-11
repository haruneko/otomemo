// 骨格エディタ（design #20 S2・方式C＝常時2声・ベース折返し表示）。PianoRoll を流用せず自前グリッドの
// 薄いラッパー（既存メロ編集を一切壊さない）。純ロジックは skeletonEdit.ts へ委譲＝ここは描画/入力のみ。
import { useMemo, useRef, useState, type Ref } from "react";
import { pitchName, PITCH_NAMES, beatsPerBar, type ChordEntry, type SkeletonBreakpoint } from "../music";
import { previewNote } from "../audio";
import { api } from "../api";
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
} from "../skeletonEdit";

const PPB = 44; // 1拍の px 幅
const ROWH = 13; // 1行(半音)の px 高さ
const isBlack = (p: number) => PITCH_NAMES[((p % 12) + 12) % 12]!.includes("#");
const pc = (p: number) => (((p % 12) + 12) % 12);
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const MINtones = [0, 2, 3, 5, 7, 8, 10];

type Voice = "melody" | "bass";

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
  rollMode: "draw" | "select" | "erase";
  counterpoint: boolean; // 再生モード（親所有・playable に効く）
  setCounterpoint: (v: boolean) => void;
  playheadRef?: Ref<HTMLDivElement>;
  scrollerRef?: Ref<HTMLDivElement>;
}

export function SkeletonEditor(p: SkeletonEditorProps) {
  const [snap, setSnap] = useState(2);
  const [inputVoice, setInputVoice] = useState<Voice>("melody"); // 新規打点の入力先（既存点は触った声部を直接編集）
  const [foldOct, setFoldOct] = useState(24); // ベース表示の畳み量（+2oct=24 / +3oct=36）
  const [selected, setSelected] = useState<Set<string>>(new Set()); // voice@start
  const [cand, setCand] = useState<{ tones: SkeletonBreakpoint[]; bass?: SkeletonBreakpoint[]; phrases?: { endBeat: number; cadence?: string }[]; bars: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);

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

  const scaleSet = useMemo(() => new Set((p.keyMode === "minor" ? MINtones : MAJ).map((i) => pc(p.keyPc + i))), [p.keyPc, p.keyMode]);
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

  // ---- 空セルタップ＝ブレークポイント追加（入力先＝inputVoice） ----
  function onZoneDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).dataset.pt) return; // 点は個別ハンドラ
    if (p.rollMode !== "draw") { if (p.rollMode === "select") { setSelected(new Set()); } return; }
    const beat = snapBeat(beatFromX(e.clientX), snap, total);
    if (beat >= total - 1e-6) return;
    const v = inputVoice;
    const disp = v === "bass" ? foldOct : 0;
    const pitch = unfoldPitch(pitchFromY(e.clientY), disp);
    setPtsOf(v, upsertPoint(ptsOf(v), beat, pitch));
    void previewNote({ pitch, start: 0, dur: 0.4 });
  }

  // ---- 点のドラッグ/選択/消去 ----
  function onPointDown(e: React.PointerEvent, v: Voice, pt: SkeletonBreakpoint) {
    e.stopPropagation();
    const disp = v === "bass" ? foldOct : 0;
    if (p.rollMode === "erase") { setPtsOf(v, removePointAt(ptsOf(v), pt.start)); return; }
    if (p.rollMode === "select") {
      const k = v + "@" + pt.start;
      setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
      return;
    }
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

  // ---- 休ストリップ ----
  function onRestDown(e: React.PointerEvent) {
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

  // ---- 機械に叩き台（gen_skeleton→候補→採用で確定・破壊上書きしない） ----
  async function genStub() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.music<{ items: { content: unknown }[] }>("gen_skeleton", {
        frame: { key: p.keyPc, mode: p.keyMode, meter: p.meter, bars: p.bars },
        seed: Math.floor(Math.random() * 1e6),
      });
      const c = r.items?.[0]?.content as { bars?: number; tones?: SkeletonBreakpoint[]; bass?: SkeletonBreakpoint[]; phrases?: { endBeat: number; cadence?: string }[] } | undefined;
      if (c && Array.isArray(c.tones)) setCand({ bars: c.bars ?? p.bars, tones: c.tones, bass: c.bass, phrases: c.phrases });
    } catch { /* 生成失敗は握りつぶす（叩き台は任意） */ } finally { setBusy(false); }
  }
  function adoptStub() {
    if (!cand) return;
    p.setTones(cand.tones);
    if (cand.bass) p.setBass(cand.bass);
    if (cand.phrases) p.setPhrases(cand.phrases);
    setCand(null);
    setSelected(new Set());
  }

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
      <div className="skel-toolbar" aria-label="skeleton-toolbar">
        <span className="skel-grp"><span className="muted">スナップ</span>{seg([["2拍", 2], ["1拍", 1], ["自由", 0]], snap, setSnap, "snap")}</span>
        <span className="skel-grp"><span className="muted">入力先</span>{seg([["メロ", 0], ["ベース", 1]], inputVoice === "bass" ? 1 : 0, (v) => setInputVoice(v ? "bass" : "melody"), "input-voice")}</span>
        <span className="skel-grp"><span className="muted">ベース表示</span>{seg([["+2oct", 24], ["+3oct", 36]], foldOct, setFoldOct, "fold-oct")}</span>
        <span className="skel-grp"><span className="muted">再生</span>{seg([["対位法", 1], ["実音", 0]], p.counterpoint ? 1 : 0, (v) => p.setCounterpoint(!!v), "play-mode")}</span>
        {p.setBars && (
          <span className="skel-grp"><span className="muted">小節</span>
            <button type="button" aria-label="skel-bars-dec" disabled={p.bars <= 1} onClick={() => p.setBars!(Math.max(1, p.bars - 1))}>−</button>
            <span aria-label="skel-bars">{p.bars}</span>
            <button type="button" aria-label="skel-bars-inc" onClick={() => p.setBars!(p.bars + 1)}>＋</button>
          </span>
        )}
        <button type="button" className="tb-tool" aria-label="gen-skeleton-stub" disabled={busy} onClick={() => void genStub()}>🤖 機械に叩き台</button>
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

      {cand && (
        <div className="reshape-bar" aria-label="skeleton-candidate" style={{ ["--k" as string]: "var(--k-skeleton,#7fb8d4)" }}>
          <span className="reshape-label">骨格の叩き台（{cand.tones.filter((t) => t.pitch != null).length}点・採用で置換／元は残る）</span>
          <button type="button" className="tb-tool" aria-label="stub-again" disabled={busy} onClick={() => void genStub()}>別案</button>
          <button type="button" className="tb-tool primary" aria-label="stub-adopt" onClick={adoptStub}>採用</button>
          <button type="button" className="tb-tool" aria-label="stub-discard" onClick={() => setCand(null)}>破棄</button>
        </div>
      )}

      <div className="skel-legend muted" aria-label="skeleton-legend">
        <span><i className="sw" style={{ background: "var(--k-melody)" }} />メロ骨格</span>
        <span><i className="sw" style={{ background: "var(--k-bass)" }} />ベース明示</span>
        <span><i className="sw sw-dash" />導出ベース(コードroot)</span>
        <span>度数=実音差mod12／強拍不協和=注意色／⚠並行5・8度／✕声部交差(実音)</span>
        <span>表示=ベース+{foldOct / 12}oct畳み・計算は実音／再生={p.counterpoint ? "対位法(ベース+1oct)" : "実音"}</span>
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
              <div key={pt} className={"skel-key " + (isBlack(pt) ? "black" : "white") + (pc(pt) === pc(p.keyPc) ? " tonic" : "")} style={{ height: ROWH }} onClick={() => void previewNote({ pitch: pt, start: 0, dur: 0.5 })}>
                {pitchName(pt)}
              </div>
            ))}
          </div>
          <div className="skel-zone" ref={zoneRef} style={{ width: W, height: H, background: bg }} onPointerDown={onZoneDown}>
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
            {p.tones.map((pt) => pt.pitch != null && pt.pitch <= range.hi && pt.pitch >= range.lo && (
              <span key={"mp" + pt.start} data-pt="1" className={"skel-pt mel" + (selected.has("melody@" + pt.start) ? " sel" : "") + (p.rollMode === "erase" ? " erasing" : "")}
                style={{ left: pt.start * PPB, top: yOf(pt.pitch) + ROWH / 2 }} title={`${pitchName(pt.pitch)} @${pt.start}拍`} onPointerDown={(e) => onPointDown(e, "melody", pt)} />
            ))}
            {p.bass.map((pt) => pt.pitch != null && dispBass(pt.pitch) <= range.hi && dispBass(pt.pitch) >= range.lo && (
              <span key={"bp" + pt.start} data-pt="1" className={"skel-pt bass" + (selected.has("bass@" + pt.start) ? " sel" : "") + (p.rollMode === "erase" ? " erasing" : "")}
                style={{ left: pt.start * PPB, top: yOf(dispBass(pt.pitch)) + ROWH / 2 }} title={`${pitchName(pt.pitch)} @${pt.start}拍（実音・表示+${foldOct / 12}oct）`} onPointerDown={(e) => onPointDown(e, "bass", pt)} />
            ))}
          </div>
        </div>
        {/* 休ストリップ */}
        <div className="skel-rest-strip" aria-label="rest-strip" onPointerDown={onRestDown}>
          <div className="skel-gutter">休</div>
          <div className="skel-rest-zone" style={{ width: W }}>
            {ptsOf(inputVoice).filter((pt) => pt.pitch === null).map((pt) => {
              const e = bandEnd(ptsOf(inputVoice), pt.start, phrases, total);
              return <span key={"r" + pt.start} className="skel-rest-mark" style={{ left: pt.start * PPB + 1, width: Math.max(14, (e - pt.start) * PPB - 2) }}>休</span>;
            })}
          </div>
        </div>
      </div>
      <p className="muted lanes-hint">空きタップ=打点（入力先の声部・次点まで自動延伸）／点ドラッグ=移動／⌫消す=点タップで削除／句チップ=全↔半終止／休ストリップ=骨格休符。度数/並行/交差は実音判定・指摘のみ。</p>
    </div>
  );
}
