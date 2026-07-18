import { type CSSProperties, type Ref, useState } from "react";
import {
  type RhythmContent,
  type RhythmLane,
  DRUM_LABEL,
  DRUM_KITS,
  drumVel,
  hitVel,
  hitVelState,
  hitDiv,
  laneWithHitToggled,
  laneWithHitVel,
  laneWithHitDiv,
  snapBps,
} from "../music";
import { previewNote } from "../audio";
import { BarsControl } from "./BarsControl";
import { CellPopover } from "./CellPopover";
import { useLongPress } from "../useLongPress";

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

// #29 P0-4 個別セル。長押し検出をセル単位で持つため小コンポーネントに分離（hooks はセルごと）。
function RhythmCell({
  ariaLabel,
  className,
  hv,
  onToggle,
  onLongPress,
}: {
  ariaLabel: string;
  className: string;
  hv: number | null; // on セルの実効 vel/127（濃淡）。off は null＝--hv 付けない
  onToggle: () => void;
  onLongPress: (anchor: DOMRect) => void;
}) {
  const lp = useLongPress(onLongPress);
  const style = hv != null ? ({ "--hv": hv } as CSSProperties) : undefined;
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={className}
      style={style}
      onClick={onToggle}
      {...lp}
    />
  );
}

export function RhythmEditor({
  rhythm,
  onChange,
  meter,
  playheadRef,
  scrollerRef,
}: {
  rhythm: RhythmContent;
  onChange: (r: RhythmContent) => void;
  meter?: string; // 拍子（6/8 等で grid を変える）
  playheadRef?: Ref<HTMLDivElement>; // #74 再生プレイヘッド
  scrollerRef?: Ref<HTMLDivElement>;
}) {
  const { stepsPerBar, beatStep } = meterSteps(meter, rhythm.beatsPerStep);
  const [pop, setPop] = useState<{ li: number; step: number; anchor: DOMRect } | null>(null);

  function toggle(li: number, step: number) {
    const lane = rhythm.lanes[li];
    if (!lane) return;
    const { lane: next, turnedOn } = laneWithHitToggled(lane, step);
    const lanes = rhythm.lanes.map((l, k) => (k === li ? next : l));
    onChange({ ...rhythm, lanes });
    // 打点を置いた時だけそのドラム音を鳴らす（選択キットで）。
    if (turnedOn)
      void previewNote({ pitch: lane.midi, start: 0, dur: 0.25, drum: true, kit: rhythm.kit, vel: drumVel(lane.midi, lane.vel) });
  }

  // #29 P0-4 長押し＝ミニポップオーバー。空セル（hit でない）は no-op（誤爆防止）。
  function onLongPress(li: number, step: number, anchor: DOMRect) {
    const lane = rhythm.lanes[li];
    if (!lane || !lane.hits.includes(step)) return;
    setPop({ li, step, anchor });
  }

  // チップ選択→純関数でレーンを差し替えて閉じる。強く/弱く=3値ベロシティ、2連/3連=セル内分割
  // （いずれも同じ状態を再選択で普通/単発へ戻す3状態トグル）、消す=hit OFF（velCurve/divs も掃除）。
  function pick(id: string) {
    if (!pop) return;
    const lane = rhythm.lanes[pop.li];
    if (!lane) return setPop(null);
    let next: RhythmLane;
    if (id === "accent" || id === "ghost") {
      const cur = hitVelState(lane, pop.step);
      next = laneWithHitVel(lane, pop.step, cur === id ? "normal" : id);
    } else if (id === "div2" || id === "div3") {
      const want = id === "div2" ? 2 : 3;
      next = laneWithHitDiv(lane, pop.step, hitDiv(lane, pop.step) === want ? null : want);
    } else if (id === "del") {
      next = laneWithHitToggled(lane, pop.step).lane;
    } else {
      return setPop(null);
    }
    onChange({ ...rhythm, lanes: rhythm.lanes.map((l, k) => (k === pop.li ? next : l)) });
    setPop(null);
  }

  // 小節数（1〜4）。1小節=stepsPerBar（拍子依存：4/4=16, 6/8=12）。縮小は**非破壊**。
  const bars = Math.max(1, Math.round(rhythm.steps / stepsPerBar));
  function setBars(n: number) {
    onChange({ ...rhythm, steps: Math.max(1, Math.min(4, n)) * stepsPerBar });
  }

  const popLane = pop ? rhythm.lanes[pop.li] : undefined;

  return (
    <div className="rhythm-editor" ref={scrollerRef}>
      <div className="rhythm-toolbar">
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
            const dv = on ? hitDiv(l, s) : undefined; // #29 P2 分割セル＝縦バー n 本描画
            return (
              <RhythmCell
                key={s}
                ariaLabel={`hit-${l.name}-${s}`}
                className={
                  "rhythm-cell" +
                  (on ? " on" : "") +
                  (dv === 2 ? " div2" : dv === 3 ? " div3" : "") +
                  (s % stepsPerBar === 0 ? " bar" : s % beatStep === 0 ? " beat" : "")
                }
                hv={on ? hitVel(l, hi) / 127 : null}
                onToggle={() => toggle(li, s)}
                onLongPress={(anchor) => onLongPress(li, s, anchor)}
              />
            );
          })}
        </div>
      ))}
      {pop && popLane && (
        <CellPopover
          anchor={pop.anchor}
          chips={[
            { id: "accent", label: "強く", on: hitVelState(popLane, pop.step) === "accent" },
            { id: "ghost", label: "弱く", on: hitVelState(popLane, pop.step) === "ghost" },
            { id: "div2", label: "2連", on: hitDiv(popLane, pop.step) === 2 },
            { id: "div3", label: "3連", on: hitDiv(popLane, pop.step) === 3 },
            { id: "del", label: "消す" },
          ]}
          onPick={pick}
          onClose={() => setPop(null)}
        />
      )}
    </div>
  );
}
