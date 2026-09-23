// 生成したピアノ伴奏の編集画面＝画面 B（2026-09-23 オーナー裁定・正典＝design「生成したピアノ伴奏の扱い」の「編集画面＝画面 B」）。
// 人＝いつ弾くか（右手＝なし／和音／単音・左手＝押さえる時）／機械＝どの音をどの手の形で弾くか。
// マス目を変えるたびに music-core の同じ生成器で弾き直す（変えた位置より前は変わらない・読み取ったマス目で弾き直すと同じ音）。
import { type Ref } from "react";
import { normRoot, regenerateHandFrameContent, rhythmOfExplicit, type ExplicitChordPattern, type Feel, type HandFrameRhythm } from "@cm/music-core";
import { notesForContent, pitchName, type ChordEntry, type ChordPatternContent } from "../music";
import { meterSteps, voicingRollRects } from "./ChordPatternEditor";

type Kind = "grab" | "single";
type PianoContent = ExplicitChordPattern & { feel?: Feel | null };

/** 生成したピアノ伴奏か（来歴が handframe で、弾き直しの文脈を持つ） */
export function isGeneratedPiano(c: unknown): boolean {
  const g = (c as { gen?: { engine?: string; chords?: unknown } } | null)?.gen;
  return g?.engine === "handframe" && Array.isArray(g.chords);
}

/** 右手のマスを1つ進める：空→和音→単音→空 */
export function cycleRhCell(r: HandFrameRhythm, step: number): HandFrameRhythm {
  const cur = r.rh.find((h) => h.step === step)?.kind;
  const next: Kind | null = cur == null ? "grab" : cur === "grab" ? "single" : null;
  const rh = r.rh.filter((h) => h.step !== step);
  if (next) rh.push({ step, kind: next });
  rh.sort((a, b) => a.step - b.step);
  return { rh, lh: r.lh };
}

/** 左手のマスを入れ替える */
export function toggleLhCell(r: HandFrameRhythm, step: number): HandFrameRhythm {
  const lh = r.lh.includes(step) ? r.lh.filter((s) => s !== step) : [...r.lh, step].sort((a, b) => a - b);
  return { rh: r.rh, lh };
}

/** 来歴の進行（長さつき）を拍の位置つきの進行へ（概形ロールと単体試聴の文脈） */
export function chordsOfGen(content: PianoContent): ChordEntry[] {
  let t = 0;
  return content.gen.chords.map((c) => {
    const e = { root: normRoot(c.root), quality: c.quality, start: t, dur: c.beats };
    t += c.beats;
    return e;
  });
}

export function PianoAccompEditor({
  pattern, onChange, onFeel, meter, program, playheadRef, scrollerRef,
}: {
  pattern: ChordPatternContent;
  onChange: (p: ChordPatternContent) => void;
  /** 再生が読む feel（打鍵の揺れを切り替えたとき・別案で揺れの種が変わるとき）も同時に更新する */
  onFeel?: (f: Feel | undefined) => void;
  meter?: string;
  program?: number;
  playheadRef?: Ref<HTMLDivElement>;
  scrollerRef?: Ref<HTMLDivElement>;
}) {
  const content = pattern as unknown as PianoContent;
  const g = content.gen;
  const { stepsPerBar, beatStep } = meterSteps(meter);
  const rhythm = rhythmOfExplicit(content);
  const rhAt = new Map(rhythm.rh.map((h) => [h.step, h.kind]));
  const lhAt = new Set(rhythm.lh);
  const steps = pattern.steps;

  const apply = (patch: Parameters<typeof regenerateHandFrameContent>[1]) => {
    const next = regenerateHandFrameContent(content, patch);
    onChange(next as unknown as ChordPatternContent);
    onFeel?.(next.feel ?? undefined);
  };

  const chords = chordsOfGen(content);
  const rollNotes = notesForContent("chord_pattern", { ...pattern, program }, { key: g.key, chords, program });
  const roll = voicingRollRects(rollNotes, steps);
  const cellCls = (s: number) => (s % stepsPerBar === 0 ? " bar" : s % beatStep === 0 ? " beat" : "");
  const rhFrom = g.rhFrom ?? 60;

  return (
    <div className="cp-editor pa-editor">
      <p className="cp-hint">右手のマス＝タップで 和音 → 単音 → なし。左手のマス＝押さえる時。どの音を弾くかは、変えるたびに機械が弾き直します（変えた所より前は変わりません）。</p>
      <div className="cp-grid" role="grid" aria-label="piano-accomp-grid" ref={scrollerRef}>
        <div className="proll-playhead" aria-hidden="true" ref={playheadRef} style={{ left: `calc(36px + var(--phb, 0) * 68px)` }} />
        <div className="cp-hand cp-rh-lane" role="row" aria-label="pa-right-hand">
          <div className="cp-hand-label">右手</div>
          {Array.from({ length: steps }, (_, s) => {
            const k = rhAt.get(s);
            return (
              <button
                key={s}
                type="button"
                aria-label={`pa-rh-${s}`}
                data-kind={k ?? "none"}
                title={k === "grab" ? "和音" : k === "single" ? "単音" : "なし"}
                className={"cp-cell rh" + (k ? " on" : "") + (k === "single" ? " pa-single" : "") + cellCls(s)}
                onClick={() => apply({ rhythm: cycleRhCell(rhythm, s) })}
              >
                {k === "grab" ? "和" : k === "single" ? "単" : ""}
              </button>
            );
          })}
        </div>
        <div className="cp-lh-block">
          <div className="cp-hand cp-lh-lane" role="row" aria-label="pa-left-hand">
            <div className="cp-hand-label">左手</div>
            {Array.from({ length: steps }, (_, s) => (
              <button
                key={s}
                type="button"
                aria-label={`pa-lh-${s}`}
                aria-pressed={lhAt.has(s)}
                className={"cp-cell lh" + (lhAt.has(s) ? " on" : "") + cellCls(s)}
                onClick={() => apply({ rhythm: toggleLhCell(rhythm, s) })}
              />
            ))}
          </div>
        </div>
        {roll.rects.length > 0 && (
          <div className="cp-hand cp-roll-lane" role="row" aria-label="pa-roll">
            <div className="cp-hand-label cp-roll-label">
              <span>{pitchName(roll.hi)}</span>
              <span>{pitchName(roll.lo)}</span>
            </div>
            <div className="cp-roll-strip" style={{ width: roll.stripW, height: 76 }}>
              {roll.rects.map((r, i) => (
                <i key={i} className="cp-roll-note" style={{ left: r.x, width: r.w, top: r.y }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="cp-perf-row pa-actions">
        <button type="button" className="chip" aria-label="pa-alt" onClick={() => apply({ seed: g.seed + 1 })}>別案（音の選び直し）</button>
        <span className="cp-unit">
          <span className="cp-vlbl">右手の高さ</span>
          <div className="seg seg-chord" role="group" aria-label="pa-rh-from">
            {([["C4から", 60], ["C5から", 72]] as [string, number][]).map(([lab, v]) => (
              <button key={v} type="button" aria-label={`pa-rh-from-${v}`} aria-pressed={rhFrom === v} className={"seg-b" + (rhFrom === v ? " on" : "")} onClick={() => apply({ rhFrom: v === 60 ? null : v })}>{lab}</button>
            ))}
          </div>
        </span>
        <span className="cp-unit">
          <span className="cp-vlbl">打鍵の揺れ</span>
          <div className="seg seg-chord" role="group" aria-label="pa-humanize">
            {([["OFF", false], ["ON", true]] as [string, boolean][]).map(([lab, v]) => (
              <button key={lab} type="button" aria-label={`pa-humanize-${v ? "on" : "off"}`} aria-pressed={g.humanize === v} className={"seg-b" + (g.humanize === v ? " on" : "")} onClick={() => apply({ humanize: v })}>{lab}</button>
            ))}
          </div>
        </span>
        <button type="button" className="chip" aria-label="pa-reset" disabled={!g.rhythm} onClick={() => apply({ rhythm: null })}>マス目を生成に戻す</button>
      </div>
    </div>
  );
}
