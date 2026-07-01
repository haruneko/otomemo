// NetaDialog のエディタ本体（kind 別ディスパッチ）を分離（アーキ是正 S5）。
// メロ/ベース(絶対・相対)/コード/リズム/コンテナ/テキスト の描画。状態は親(NetaDialog)が所有し props で受ける。
import { moraLines } from "../lyrics";
import { PianoRoll } from "./PianoRoll";
import { StepPad } from "./StepPad";
import { BassStepEditor } from "./BassStepEditor";
import { ChordEditor } from "./ChordEditor";
import { ChordPatternEditor } from "./ChordPatternEditor";
import { RhythmEditor } from "./RhythmEditor";
import { SectionEditor } from "./SectionEditor";
import type { Neta } from "../api";
import type { Note, ChordEntry, RhythmContent, BassStep, ChordPatternContent } from "../music";

export interface KindEditorBodyProps {
  neta: Neta;
  flags: { isMelody: boolean; isBass: boolean; isChord: boolean; isChordPat: boolean; isRhythm: boolean; isContainer: boolean; isRelBass: boolean };
  // 状態と setter（親所有）
  notes: Note[];
  setNotes: (n: Note[]) => void;
  chordPat: ChordPatternContent;
  setChordPat: (c: ChordPatternContent) => void;
  chords: ChordEntry[];
  setChords: (c: ChordEntry[]) => void;
  rhythm: RhythmContent;
  setRhythm: (r: RhythmContent) => void;
  bassPattern: BassStep[];
  setBassPattern: (p: BassStep[]) => void;
  bassSteps: number;
  setBassSteps: (n: number) => void;
  bassMode: "absolute" | "relative";
  setBassMode: (m: "absolute" | "relative") => void;
  melodyView: "roll" | "pad";
  setMelodyView: (v: "roll" | "pad") => void;
  len: number;
  setLen: (n: number) => void;
  pickup: number; // 弱起（lead-in拍数）
  setPickup: (n: number) => void;
  text: string;
  setText: (s: string) => void;
  keyPc: number; // 調（'key' は React 予約 prop なので keyPc）
  tempo: number;
  meter: string;
  reloadSignal?: number;
  onChanged?: () => void;
  // useTransport の返り（プレイヘッド/スクロール/拍 ref）
  tp: { lineRef: any; scrollerRef: any; beatRef: any; playing: boolean };
}

export function KindEditorBody(p: KindEditorBodyProps) {
  const { isMelody, isBass, isChord, isRhythm, isContainer, isRelBass } = p.flags;
  const tp = p.tp;
  return (
    <div className="editor-body">
      {isMelody || isBass ? (
        <div className="melody-input">
          {/* #bass S2: bass は 絶対(ピアノロール)/相対(度数グリッド) をモード切替 */}
          {isBass && (
            <div className="input-toggle">
              <button type="button" className={p.bassMode === "absolute" ? "on" : ""} onClick={() => p.setBassMode("absolute")}>
                絶対
              </button>
              <button type="button" className={p.bassMode === "relative" ? "on" : ""} onClick={() => p.setBassMode("relative")}>
                相対
              </button>
            </div>
          )}
          {isRelBass ? (
            <BassStepEditor
              pattern={p.bassPattern}
              onChange={p.setBassPattern}
              steps={p.bassSteps}
              onStepsChange={p.setBassSteps}
              playheadRef={tp.lineRef}
              scrollerRef={tp.scrollerRef}
            />
          ) : (
            <>
              <div className="input-toggle">
                <button type="button" className={p.melodyView === "roll" ? "on" : ""} onClick={() => p.setMelodyView("roll")}>
                  ロール
                </button>
                <button type="button" className={p.melodyView === "pad" ? "on" : ""} onClick={() => p.setMelodyView("pad")}>
                  パッド
                </button>
              </div>
              {p.melodyView === "roll" ? (
                <>
                  {/* 小節/弱起 は折りたたみ設定(MetaPanel)へ移動＝縦詰め（design/ユーザー 2026-07-02）。 */}
                  <PianoRoll
                    notes={p.notes}
                    onChange={p.setNotes}
                    beats={p.len}
                    pickup={p.pickup}
                    low={isBass ? 28 : undefined}
                    high={isBass ? 55 : undefined}
                    enableLyric={isMelody}
                    playheadRef={tp.lineRef}
                    scrollerRef={tp.scrollerRef}
                  />
                </>
              ) : (
                <StepPad notes={p.notes} onChange={p.setNotes} playheadRef={tp.lineRef} scrollerRef={tp.scrollerRef} />
              )}
            </>
          )}
        </div>
      ) : p.flags.isChordPat ? (
        <ChordPatternEditor pattern={p.chordPat} onChange={p.setChordPat} meter={p.meter} playheadRef={tp.lineRef} scrollerRef={tp.scrollerRef} />
      ) : isChord ? (
        <ChordEditor chords={p.chords} onChange={p.setChords} beatRef={tp.beatRef} playing={tp.playing} />
      ) : isRhythm ? (
        <RhythmEditor rhythm={p.rhythm} onChange={p.setRhythm} meter={p.meter} playheadRef={tp.lineRef} scrollerRef={tp.scrollerRef} />
      ) : isContainer ? (
        <SectionEditor
          neta={p.neta}
          keyPc={p.keyPc}
          tempo={p.tempo}
          meter={p.meter}
          reloadSignal={p.reloadSignal}
          onChanged={p.onChanged}
        />
      ) : (
        <div className="text-editor">
          <textarea aria-label="text" value={p.text} onChange={(e) => p.setText(e.target.value)} />
          {p.neta.kind === "lyric" && p.text.trim() && (
            <div className="mora-panel" aria-label="mora">
              {moraLines(p.text).map((m, i) => (
                <div key={i} className="mora-line">
                  <span className="mora-count">{m.count}</span>
                  <span className="mora-text">{m.line || "　"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
