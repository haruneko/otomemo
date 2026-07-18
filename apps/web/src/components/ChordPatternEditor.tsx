import { type CSSProperties, type Ref, useState } from "react";
import { type ChordPatternContent, applyCellTap, chordHitsWithVel, voicingPreviewPitches, pitchName, CHORD_ACCENT, CHORD_SOFT } from "../music";
import { previewNote } from "../audio";
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
//  ②「響き」＝打ち方/トップ狙い/広がり/高さ/パワーコード(＋arpは向き)（音の作り込み・下・静か）。
// 構成音の手選択は撤去＝鳴る音はコードの質から自動（resolveChordPattern/voiceToTop）。
export function ChordPatternEditor({
  pattern,
  onChange,
  meter,
  playheadRef,
  scrollerRef,
}: {
  pattern: ChordPatternContent;
  onChange: (p: ChordPatternContent) => void;
  meter?: string;
  playheadRef?: Ref<HTMLDivElement>;
  scrollerRef?: Ref<HTMLDivElement>;
}) {
  const { stepsPerBar, beatStep } = meterSteps(meter);
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

  // 響き変更は必ず top を書き込む（旧パターンも触った瞬間から新モデルで鳴る）。
  const setV = (patch: Partial<typeof v>) => onChange({ ...pattern, voicing: { ...v, top, ...patch } });

  const toggleHit = (s: number) => {
    const r = applyCellTap(pattern.hits, s, dotted ? len * 1.5 : len); // 頭=消す／伸び=長さ調整／空き=新規
    onChange({ ...pattern, hits: r.hits });
    // 置いた合図＝現在の voicing で C を和音プレビュー（ドミソ／単音でなく響きで確認）。
    if (r.placed) for (const p of voicingPreviewPitches({ ...v, top })) void previewNote({ pitch: p, start: 0, dur: 0.5 });
  };

  // #29 §9 発火＝onset セルのみ持ち上げる（sustain/空セルは null＝キャプチャしない・誤爆防止）。
  // 縦のみ（横=分割は無効＝arp 軸の領分）。デテント＝弱く64/普通100/強く112（磁石スナップ）。
  const fireChord = (s: number, anchor: DOMRect): HoldDragStart | null => {
    const h = startAt(s);
    if (!h) return null;
    const vel = h.vel ?? CHORD_BASE_VEL;
    const detents = [CHORD_SOFT, CHORD_BASE_VEL, CHORD_ACCENT];
    setDrag({ step: s, vel, anchor });
    for (const p of voicingPreviewPitches({ ...v, top })) void previewNote({ pitch: p, start: 0, dur: 0.4, vel });
    return { vel, div: 1, detents };
  };
  const dragChord = (s: number, st: HoldDragState) => {
    setDrag((d) => (d && d.step === s ? { ...d, vel: st.vel } : d));
    if (st.detentHit) for (const p of voicingPreviewPitches({ ...v, top })) void previewNote({ pitch: p, start: 0, dur: 0.3, vel: st.vel });
  };
  // 確定＝縦=velocity を1回の onChange で（普通=100 は vel キー削除＝bit）。
  const commitChord = (s: number, st: { vel: number }) => {
    setDrag(null);
    const nextVel = st.vel === CHORD_BASE_VEL ? undefined : st.vel;
    onChange({ ...pattern, hits: chordHitsWithVel(pattern.hits, s, nextVel) });
  };

  // プレビューは常に新モデル（top 込み）で描く＝旧パターンでも結果が見える。
  const previewNeta = { kind: "chord_pattern", content: { ...pattern, voicing: { ...v, top } }, key: 0 } as unknown as Neta;

  return (
    <div className="cp-editor">
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
        </div>
        <div className="cp-when-row">
          {/* 長さツールはメロ編集(PianoRoll)と同じ proll-tools で包む＝見た目・選択表示を統一。 */}
          <div className="proll-tools">
            <NoteValuePicker options={LENGTHS} value={len} dotted={dotted} onChange={setLen} onToggleDotted={() => setDotted((d) => !d)} />
          </div>
          <BarsControl bars={bars} max={4} onChange={(n) => onChange({ ...pattern, steps: Math.max(1, Math.min(4, n)) * stepsPerBar })} />
        </div>
      </div>

      {/* ② 響き（どう鳴らす）：音の作り込みを1ゾーンに */}
      <div className="cp-voicing" aria-label="voicing">
        <p className="cp-zlabel">響き（どう鳴らす）</p>
        <div className="cp-vrow">
          <span className="cp-vlbl">打ち方</span>
          <div className="seg" role="group" aria-label="mode">
            <button type="button" className={!isArp ? "on" : ""} onClick={() => onChange({ ...pattern, mode: "strum" })}>ストラム</button>
            <button type="button" className={isArp ? "on" : ""} onClick={() => onChange({ ...pattern, mode: "arp" })}>アルペジオ</button>
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
