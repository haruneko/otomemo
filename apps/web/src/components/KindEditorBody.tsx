// NetaDialog のエディタ本体（kind 別ディスパッチ）を分離（アーキ是正 S5）。
// メロ/ベース(絶対・相対)/コード/リズム/コンテナ/テキスト の描画。状態は親(NetaDialog)が所有し props で受ける。
import { useState } from "react";
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
  rollMode: "draw" | "select";
  setRollMode: (v: "draw" | "select") => void;
  len: number;
  setLen: (n: number) => void;
  pickup: number; // 弱起（lead-in拍数）
  setPickup: (n: number) => void;
  text: string;
  setText: (s: string) => void;
  keyPc: number; // 調（'key' は React 予約 prop なので keyPc）
  tempo: number;
  meter: string;
  // 崩し候補（①道具）：候補があれば PianoRoll に候補=実線/元=ゴーストで表示・再生は候補。
  candidate?: import("../music").Note[] | null;
  candStrength?: number;
  reshaping?: boolean;
  onReshape?: (strength?: number) => void;
  onSaveCandidate?: () => void;
  onDiscardCandidate?: () => void;
  reloadSignal?: number;
  onChanged?: () => void;
  // useTransport の返り（プレイヘッド/スクロール/拍 ref）
  tp: { lineRef: any; scrollerRef: any; beatRef: any; playing: boolean };
}

export function KindEditorBody(p: KindEditorBodyProps) {
  const { isMelody, isBass, isChord, isRhythm, isContainer, isRelBass } = p.flags;
  const tp = p.tp;
  const [toolsOpen, setToolsOpen] = useState(false);
  // トランスポーズ（①道具・純クライアント＝Undo可）。全ノートのピッチを移動。
  const transpose = (d: number) =>
    p.setNotes(p.notes.map((n) => ({ ...n, pitch: Math.max(0, Math.min(127, n.pitch + d)) })));
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
              {/* ロール/パッド と 描く/選ぶ を同じ行に（縦詰め・縦線で区切り）。 */}
              <div className="roll-toolbar">
                <div className="input-toggle">
                  <button type="button" className={p.melodyView === "roll" ? "on" : ""} onClick={() => p.setMelodyView("roll")}>
                    ロール
                  </button>
                  <button type="button" className={p.melodyView === "pad" ? "on" : ""} onClick={() => p.setMelodyView("pad")}>
                    パッド
                  </button>
                </div>
                {p.melodyView === "roll" && (
                  <>
                    <span className="tb-divider" aria-hidden="true" />
                    <div className="proll-modes">
                      <button type="button" aria-label="mode-draw" title="描く（配置/削除）" className={p.rollMode === "draw" ? "on" : ""} onClick={() => p.setRollMode("draw")}>
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
                        </svg>
                      </button>
                      <button type="button" aria-label="mode-select" title="選ぶ（選択して編集）" className={p.rollMode === "select" ? "on" : ""} onClick={() => p.setRollMode("select")}>
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="3" y="3" width="18" height="18" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3.5 3" />
                        </svg>
                      </button>
                    </div>
                    {isMelody && !p.candidate && (
                      <>
                        <span className="tb-divider" aria-hidden="true" />
                        <button
                          type="button"
                          className="tb-tool"
                          aria-label="reshape"
                          title="崩す＝ノリを保ったまま別メロの候補を出す（決定的・Claude不要）"
                          disabled={p.reshaping}
                          onClick={() => p.onReshape?.()}
                        >
                          {p.reshaping ? "崩し中…" : "崩す"}
                        </button>
                        <div className="assign-wrap">
                          <button type="button" className="tb-tool" aria-label="tools" title="道具（移調 ほか）" onClick={() => setToolsOpen((v) => !v)}>
                            道具 ▾
                          </button>
                          {toolsOpen && (
                            <div className="assign-menu" aria-label="tools-menu">
                              <button type="button" className="bs-btn" onClick={() => transpose(1)}>＋半音</button>
                              <button type="button" className="bs-btn" onClick={() => transpose(-1)}>−半音</button>
                              <button type="button" className="bs-btn" onClick={() => transpose(12)}>＋8va</button>
                              <button type="button" className="bs-btn" onClick={() => transpose(-12)}>−8va</button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
              {p.melodyView === "roll" ? (
                <>
                  {p.candidate && (
                    <div className="reshape-bar" aria-label="reshape-candidate">
                      <span className="reshape-label">崩し候補（元＝点線／▶で候補を試聴）</span>
                      <div className="reshape-strength">
                        {([["弱", 0.3], ["中", 0.55], ["強", 0.8]] as const).map(([lbl, s]) => (
                          <button
                            key={lbl}
                            type="button"
                            className={Math.abs((p.candStrength ?? 0.55) - s) < 0.01 ? "on" : ""}
                            disabled={p.reshaping}
                            onClick={() => p.onReshape?.(s)}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                      <button type="button" className="tb-tool" disabled={p.reshaping} onClick={() => p.onReshape?.()}>
                        {p.reshaping ? "…" : "別案"}
                      </button>
                      <button type="button" className="tb-tool primary" aria-label="save-candidate" onClick={() => p.onSaveCandidate?.()}>
                        新ネタで保存
                      </button>
                      <button type="button" className="tb-tool" aria-label="discard-candidate" onClick={() => p.onDiscardCandidate?.()}>
                        破棄
                      </button>
                    </div>
                  )}
                  {/* 小節/弱起 は折りたたみ設定(MetaPanel)へ移動＝縦詰め（design/ユーザー 2026-07-02）。 */}
                  <PianoRoll
                    notes={p.candidate ?? p.notes}
                    onChange={p.setNotes}
                    beats={p.len}
                    pickup={p.pickup}
                    low={isBass ? 28 : undefined}
                    high={isBass ? 55 : undefined}
                    enableLyric={isMelody}
                    mode={p.rollMode}
                    ghostNotes={p.candidate ? p.notes : undefined}
                    readOnly={!!p.candidate}
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
