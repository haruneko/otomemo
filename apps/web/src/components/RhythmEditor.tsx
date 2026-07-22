import { type CSSProperties, type Ref, useEffect, useRef, useState } from "react";
import {
  type RhythmContent,
  type PlaybackHandle,
  DRUM_LABEL,
  DRUM_KITS,
  drumVel,
  hitVel,
  hitDiv,
  laneWithHitToggled,
  laneWithHitVelNum,
  laneWithHitDiv,
  GHOST_VEL,
  ACCENT_BOOST,
  snapBps,
  notesForContent,
  buildPlayback,
} from "../music";
import { previewNote } from "../audio";
import { startPlayback } from "../playback";
import { api } from "../api";
import { PatternPickerBar, type PatternCand } from "./PatternPickerBar";
import { BarsControl } from "./BarsControl";

// ドラムの定型ビート型ライブラリ（drumLibrary の genre）＋おまかせ番兵（v:""＝従来 default 生成）。
// コード楽器の COMP_GENRE_CHIPS とは genre 集合が違う（ドラムは jpop/rock/dance/ballad/funk）ので別立て。
const DRUM_GENRE_CHIPS: { v: string; label: string }[] = [
  { v: "", label: "おまかせ" },
  { v: "jpop", label: "J-POP" },
  { v: "rock", label: "ロック" },
  { v: "dance", label: "4つ打ち" },
  { v: "ballad", label: "バラード" },
  { v: "funk", label: "ファンク" },
];
import { DragHud } from "./DragHud";
import { Icon } from "./Icon";
import { useHoldDrag, type HoldDragState, type HoldDragStart } from "../useHoldDrag";

// プレイヘッド位置は CSS 変数(--rname/--rcell)から計算＝セルをmobileで縮めてもズレない（#74）。
// 1拍=4step、1step=セル幅(--rcell)+行gap(2px)。先頭=ラベル幅(--rname)+gap(2px)。
const PLAYHEAD_LEFT = "calc(var(--rname, 56px) + 2px + var(--phb, 0) * (var(--rcell, 20px) + 2px) * 4)";

// リズムのステップグリッド（design #19「リズム step（自作・小）」）。レーン×ステップを on/off。
// 拍子→1小節のstep数（1step=16分=0.25拍）。4/4=16, 6/8=12, 3/4=12。複合(6/8系)はビート=6step毎。
// #29 P0 beatsPerStep があれば content 優先で導出（4/4×1/3 三連→12格子）。無ければ従来＝bit 一致。
function meterSteps(meter?: string, beatsPerStep?: number): { stepsPerBar: number; beatStep: number } {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
  const n = m ? Number(m[1]) : 4;
  const d = m ? Number(m[2]) : 4;
  if (beatsPerStep != null) {
    const bps = snapBps(beatsPerStep);
    const beatsPerBar = d > 0 ? (n * 4) / d : 4; // 四分音符換算の拍数（4/4→4・6/8→3）
    const stepsPerBar = Math.max(1, Math.round(beatsPerBar / bps));
    const beatStep = Math.max(1, Math.round(1 / bps)); // 1拍=何step（三連格子→3）
    return { stepsPerBar, beatStep };
  }
  const stepsPerBar = n > 0 && d > 0 ? Math.round((n * 16) / d) : 16;
  const compound = d === 8 && n % 3 === 0 && n >= 6;
  return { stepsPerBar, beatStep: compound ? 6 : 4 }; // 複合は付点ビート(6step)、単純は四分(4step)
}

// #29 §9 個別セル。ホールドドラッグ（長押し→縦=強さ/横=連打）をセル単位で持つため小コンポーネントに分離。
// erase モードでは hold-drag を張らない（tap/なぞりで消す＝親のグリッドが elementFromPoint で処理）。
function RhythmCell({
  ariaLabel,
  className,
  hv,
  li,
  step,
  eraseMode,
  onToggle,
  onFire,
  onDrag,
  onCommit,
  onCancel,
}: {
  ariaLabel: string;
  className: string;
  hv: number | null; // on セルの実効 vel/127（濃淡）。off は null＝--hv 付けない
  li: number;
  step: number;
  eraseMode: boolean;
  onToggle: () => void;
  onFire: (anchor: DOMRect) => HoldDragStart | null;
  onDrag: (s: HoldDragState) => void;
  onCommit: (s: { vel: number; div: number }) => void;
  onCancel: () => void;
}) {
  const hd = useHoldDrag({ axis: "xy", onFire, onDrag, onCommit, onCancel });
  const style = hv != null ? ({ "--hv": hv } as CSSProperties) : undefined;
  // erase 中はドラッグ検出を張らず（グリッド側で一掃）、tap も抑止（pointerdown で既に消えている）。
  const gesture = eraseMode ? { ref: hd.ref } : hd;
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={className}
      style={style}
      data-li={li}
      data-step={step}
      onClick={eraseMode ? undefined : onToggle}
      {...gesture}
    />
  );
}

export function RhythmEditor({
  rhythm,
  onChange,
  meter,
  tempo,
  playheadRef,
  scrollerRef,
}: {
  rhythm: RhythmContent;
  onChange: (r: RhythmContent) => void;
  meter?: string; // 拍子（6/8 等で grid を変える）
  tempo?: number; // 型試聴の実音化テンポ（修理#1「パターンを選ぶ」帯）
  playheadRef?: Ref<HTMLDivElement>; // #74 再生プレイヘッド
  scrollerRef?: Ref<HTMLDivElement>;
}) {
  const { stepsPerBar, beatStep } = meterSteps(meter, rhythm.beatsPerStep);
  const ppPlay = useRef<PlaybackHandle | null>(null);
  // 「パターンを選ぶ ▸」帯（修理#1）＝定型ビート型の入口を単体エディタへ。gen_drums に variety が無いので seed 違い4件→dedupe。
  const fetchPatterns = async (genre: string): Promise<PatternCand[]> => {
    const bars = Math.max(1, Math.round(rhythm.steps / stepsPerBar));
    const base = Math.floor(Math.random() * 1e6);
    // tempo は外す＝pickBeatPattern の pool を役割候補全体に広げ、seed 連番で別々の型を引き当てる（要耳較正）。
    const results = await Promise.all(
      [0, 1, 2, 3].map((d) =>
        api.music<{ items: { content: unknown }[] }>("gen_drums", {
          frame: { meter, bars },
          ...(genre ? { style: genre } : {}),
          seed: base + d,
        }),
      ),
    );
    const seen = new Set<string>();
    const out: PatternCand[] = [];
    for (const it of results.flatMap((r) => r.items ?? [])) {
      const rc = (it.content as { rhythm?: RhythmContent } | null)?.rhythm;
      if (!rc) continue;
      const k = rc.patternId ?? JSON.stringify(it.content); // 型経路は patternId で・おまかせは content で dedupe
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        key: k,
        name: rc.patternId ?? "おまかせ",
        audition: () => auditionPattern(it.content),
        apply: () => applyPattern(it.content),
      });
      if (out.length >= 4) break;
    }
    return out;
  };
  // 試聴＝ドラムは進行不要。rhythm content をそのまま鳴らす（notesForContent("rhythm")）。
  const auditionPattern = (content: unknown) => {
    ppPlay.current?.stop();
    const ns = notesForContent("rhythm", content);
    if (ns.length) void startPlayback(buildPlayback({ kind: "notes", notes: ns, tempo: tempo ?? 120 }), { vocalMode: "peek" }).then((h) => { ppPlay.current = h; });
  };
  // 適用＝候補 rhythm で置換（steps/lanes/patternId）。kit（音色）は現ネタを保持＝onChange で Undo に乗る。
  const applyPattern = (content: unknown) => {
    ppPlay.current?.stop();
    const rc = (content as { rhythm: RhythmContent }).rhythm;
    onChange({ ...rc, ...(rhythm.kit != null ? { kit: rhythm.kit } : {}) });
  };
  // 手編集の共通 setter（修理#3 決定④）＝content の演奏内容（hits/vel/div/小節数）を変える系はここを通す。
  // patternId が在る時だけ patternEdited を立てる（来歴保持＋帯「いま：<型>（改）」）。patternId 無しネタは
  // 新キーが生えない＝bit 一致。kit（音色メタ）や applyPattern（置換）はこの setter を通さない＝（改）は付かない/消える。
  const editContent = (next: RhythmContent) =>
    onChange(rhythm.patternId ? { ...next, patternEdited: true } : next);
  const [eraseMode, setEraseMode] = useState(false);
  // #29 §9 ドラッグ中のライブプレビュー（--hv/divクラスをこのセルだけ上書き・HUD 表示）。離した時に一括 onChange。
  const [drag, setDrag] = useState<
    { li: number; step: number; vel: number; div: number; base: number; detents: number[]; anchor: DOMRect } | null
  >(null);
  const sweeping = useRef(false);

  function toggle(li: number, step: number) {
    const lane = rhythm.lanes[li];
    if (!lane) return;
    const { lane: next, turnedOn } = laneWithHitToggled(lane, step);
    const lanes = rhythm.lanes.map((l, k) => (k === li ? next : l));
    editContent({ ...rhythm, lanes });
    // 打点を置いた時だけそのドラム音を鳴らす（選択キットで）。
    if (turnedOn)
      void previewNote({ pitch: lane.midi, start: 0, dur: 0.25, drum: true, kit: rhythm.kit, vel: drumVel(lane.midi, lane.vel) });
  }

  // 発火＝onset のみ持ち上げる（空セルは null＝キャプチャしない・誤爆防止）。開始状態＋磁石デテントを返す。
  function fireCell(li: number, step: number, anchor: DOMRect): HoldDragStart | null {
    const lane = rhythm.lanes[li];
    if (!lane || !lane.hits.includes(step)) return null;
    const i = lane.hits.indexOf(step);
    const base = drumVel(lane.midi, lane.vel);
    const vel = hitVel(lane, i);
    const div = hitDiv(lane, step) ?? 1;
    const detents = [GHOST_VEL, base, Math.min(127, base + ACCENT_BOOST)];
    setDrag({ li, step, vel, div, base, detents, anchor });
    void previewNote({ pitch: lane.midi, start: 0, dur: 0.25, drum: true, kit: rhythm.kit, vel });
    return { vel, div, detents };
  }

  function dragCell(li: number, step: number, s: HoldDragState) {
    setDrag((d) => (d && d.li === li && d.step === step ? { ...d, vel: s.vel, div: s.div } : d));
    // デテント通過・連打段変化で耳フィードバック（値で決められる＝§9 の設計）。
    if (s.detentHit || s.divChanged) {
      const lane = rhythm.lanes[li];
      if (lane) void previewNote({ pitch: lane.midi, start: 0, dur: 0.2, drum: true, kit: rhythm.kit, vel: s.vel });
    }
  }

  // 確定＝縦=velocity（laneWithHitVelNum・連続値）＋横=div（laneWithHitDiv）を1回の onChange で（undo1粒）。
  function commitCell(li: number, step: number, s: { vel: number; div: number }) {
    setDrag(null);
    const lane = rhythm.lanes[li];
    if (!lane) return;
    let next = laneWithHitVelNum(lane, step, s.vel);
    next = laneWithHitDiv(next, step, s.div === 2 || s.div === 3 ? s.div : null);
    editContent({ ...rhythm, lanes: rhythm.lanes.map((l, k) => (k === li ? next : l)) });
  }

  // ⌫消しゴム：タップ＋なぞり一掃（elementFromPoint 追跡）。on の hit を laneWithHitToggled で OFF（velCurve/divs 掃除）。
  function eraseAt(x: number, y: number) {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el || !el.classList.contains("rhythm-cell")) return;
    const li = Number(el.dataset.li);
    const step = Number(el.dataset.step);
    const lane = rhythm.lanes[li];
    if (!lane || Number.isNaN(step) || !lane.hits.includes(step)) return;
    const next = laneWithHitToggled(lane, step).lane;
    editContent({ ...rhythm, lanes: rhythm.lanes.map((l, k) => (k === li ? next : l)) });
  }

  // なぞり中に指がグリッド外へ出た時／pointercancel でスイープ終了（取りこぼし防止）。
  useEffect(() => {
    if (!eraseMode) return;
    const stop = () => { sweeping.current = false; };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [eraseMode]);

  // 小節数（1〜4）。1小節=stepsPerBar（拍子依存：4/4=16, 6/8=12）。縮小は**非破壊**。
  const bars = Math.max(1, Math.round(rhythm.steps / stepsPerBar));
  function setBars(n: number) {
    editContent({ ...rhythm, steps: Math.max(1, Math.min(4, n)) * stepsPerBar });
  }

  return (
   <>
    {/* 「パターンを選ぶ ▸」帯（修理#1）＝定型ビート型の入口を単体エディタへ。既定閉＝開くまで既存DOM/挙動不変。 */}
    {/* nowLabel＝patternId（＋手編集後は「（改）」）。（改）表現は渡す文字列で行う＝PatternPickerBar は器のまま（決定④）。 */}
    <PatternPickerBar
      nowLabel={rhythm.patternId ? rhythm.patternId + (rhythm.patternEdited ? "（改）" : "") : undefined}
      chips={DRUM_GENRE_CHIPS}
      onFetch={fetchPatterns}
    />
    <div
      className={"rhythm-editor" + (eraseMode ? " erase-on" : "")}
      ref={scrollerRef}
      onPointerDown={eraseMode ? (e) => { sweeping.current = true; eraseAt(e.clientX, e.clientY); } : undefined}
      onPointerMove={eraseMode ? (e) => { if (sweeping.current) eraseAt(e.clientX, e.clientY); } : undefined}
      onPointerUp={eraseMode ? () => { sweeping.current = false; } : undefined}
    >
      <div className="rhythm-toolbar">
        {/* ✎鉛筆（タップ=置く/消す・長押し→ドラッグ=強弱/連打）／⌫消しゴム（タップ・なぞりで消す）。 */}
        <div className="proll-modes" role="group" aria-label="rhythm-mode">
          <button type="button" aria-label="mode-edit" title="鉛筆（タップ=置く/消す・長押し→ドラッグ=表現）" className={!eraseMode ? "on" : ""} onClick={() => setEraseMode(false)}>
            <Icon name="edit" size={18} />
          </button>
          <button type="button" aria-label="mode-erase" title="消しゴム（タップ/なぞりで消す）" className={eraseMode ? "on" : ""} onClick={() => setEraseMode(true)}>
            <Icon name="eraser" size={18} />
          </button>
        </div>
        <BarsControl bars={bars} max={4} onChange={setBars} />
        {/* ドラムキット（アコ/エレキ）選択＝GM bank128 preset。再生＆MIDI ch10 program に反映。 */}
        <label className="drum-kit-pick">
          キット
          <select
            aria-label="drum-kit"
            value={rhythm.kit ?? 0}
            onChange={(e) => onChange({ ...rhythm, kit: Number(e.target.value) })}
          >
            <optgroup label="アコースティック">
              {DRUM_KITS.filter((k) => k.group === "acoustic").map((k) => (
                <option key={k.program} value={k.program}>{k.label}</option>
              ))}
            </optgroup>
            <optgroup label="エレキ">
              {DRUM_KITS.filter((k) => k.group === "electric").map((k) => (
                <option key={k.program} value={k.program}>{k.label}</option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>
      <div
        className="proll-playhead"
        aria-hidden="true"
        ref={playheadRef}
        style={{ left: PLAYHEAD_LEFT }}
      />
      {rhythm.lanes.map((l, li) => (
        <div className="rhythm-row" key={l.name}>
          <span className="rhythm-name">{DRUM_LABEL[l.name] ?? l.name}</span>
          {Array.from({ length: rhythm.steps }, (_, s) => {
            const hi = l.hits.indexOf(s);
            const on = hi >= 0;
            const isDrag = !!drag && drag.li === li && drag.step === s;
            // ドラッグ中のセルはプレビュー値で描く（--hv 濃淡＋div クラス）。
            const dv = isDrag ? (drag.div >= 2 ? drag.div : undefined) : on ? hitDiv(l, s) : undefined;
            const hv = isDrag ? drag.vel / 127 : on ? hitVel(l, hi) / 127 : null;
            return (
              <RhythmCell
                key={s}
                li={li}
                step={s}
                eraseMode={eraseMode}
                ariaLabel={`hit-${l.name}-${s}`}
                className={
                  "rhythm-cell" +
                  (on ? " on" : "") +
                  (dv === 2 ? " div2" : dv === 3 ? " div3" : "") +
                  (isDrag ? " lift" : "") +
                  (s % stepsPerBar === 0 ? " bar" : s % beatStep === 0 ? " beat" : "")
                }
                hv={hv}
                onToggle={() => toggle(li, s)}
                onFire={(anchor) => fireCell(li, s, anchor)}
                onDrag={(st) => dragCell(li, s, st)}
                onCommit={(st) => commitCell(li, s, st)}
                onCancel={() => setDrag(null)}
              />
            );
          })}
        </div>
      ))}
      <p className="muted rhythm-hint">
        タップ＝置く/消す ・ 打点を長押し→ <b>上下＝強さ</b>（弱く/普通/強く）・ <b>左右＝連打</b>（2連/3連） ・ 横スワイプ＝スクロール
      </p>
      {drag && (
        <DragHud anchor={drag.anchor} vel={drag.vel} div={drag.div} base={drag.base} detents={drag.detents} />
      )}
    </div>
   </>
  );
}
