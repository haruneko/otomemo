// NetaDialog のエディタ本体（kind 別ディスパッチ）を分離（アーキ是正 S5）。
// メロ/ベース(絶対・相対)/コード/リズム/コンテナ/テキスト の描画。状態は親(NetaDialog)が所有し props で受ける。
import { useCallback, useRef, useState } from "react";
import { useDismiss } from "../useDismiss";
import { api } from "../api";
import { Icon } from "./Icon";
import { moraLines } from "../lyrics";
import { PianoRoll } from "./PianoRoll";
import { BassStepEditor } from "./BassStepEditor";
import { ChordEditor } from "./ChordEditor";
import { ChordPatternEditor } from "./ChordPatternEditor";
import { RhythmEditor } from "./RhythmEditor";
import { SectionEditor } from "./SectionEditor";
import { SkeletonEditor } from "./SkeletonEditor";
import type { Neta } from "../api";
import type { Note, ChordEntry, RhythmContent, BassStep, ChordPatternContent, SkeletonBreakpoint } from "../music";

// 空 textarea の初手ガイド（design提案#6）：白紙の心細さを1行の例文プレースホルダで解消。
const TEXT_PLACEHOLDER: Record<string, string> = {
  lyric: "例：夜の窓に映る　言えなかった言葉たち…",
  theme: "例：離れていても変わらない想いを、静かな夜の情景で",
};

export interface KindEditorBodyProps {
  neta: Neta;
  flags: { isMelody: boolean; isBass: boolean; isCounter: boolean; isRiff: boolean; isChord: boolean; isChordPat: boolean; isSectionInst: boolean; isRhythm: boolean; isSkel: boolean; isContainer: boolean; isRelBass: boolean };
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
  // S7（修理#3 決定②④）：相対ビート型の来歴／（改）／帯の適用（BassStepEditor の「パターンを選ぶ」帯へ）。
  bassPatternId?: string;
  bassPatternEdited?: boolean;
  onApplyBassPattern?: (c: { pattern: BassStep[]; steps: number; patternId?: string }) => void;
  rollMode: "draw" | "select" | "erase" | "lyric"; // lyric=詞モード（メロのみ・歌詞リタッチ）
  setRollMode: (v: "draw" | "select" | "erase" | "lyric") => void;
  // 骨格（design #20 S2）
  tones?: SkeletonBreakpoint[];
  setTones?: (t: SkeletonBreakpoint[]) => void;
  skelBass?: SkeletonBreakpoint[];
  setSkelBass?: (b: SkeletonBreakpoint[]) => void;
  phrases?: { endBeat: number; cadence?: string }[];
  setPhrases?: (p: { endBeat: number; cadence?: string }[]) => void;
  skelBars?: number;
  setSkelBars?: (n: number) => void;
  skelChords?: ChordEntry[];
  skelCounter?: boolean;
  setSkelCounter?: (v: boolean) => void;
  len: number;
  setLen: (n: number) => void;
  pickup: number; // 弱起（lead-in拍数）
  setPickup: (n: number) => void;
  text: string;
  setText: (s: string) => void;
  keyPc: number; // 調（'key' は React 予約 prop なので keyPc）
  mode: string; // 長調/短調（"major"/"minor"）＝P0-a スケール音ハイライトの判定に使う
  tempo: number;
  meter: string;
  program?: number; // 音色（GM）＝chord_pattern の奏法（style:"auto" 導出／じゃら〜ん出し分け）に使う。
  title?: string; // 編集中ライブタイトル（section の生成/MIDI名に使う・stale活性対策）
  // 崩し候補（①道具）：候補があれば PianoRoll に候補=実線/元=ゴーストで表示・再生は候補。
  candidate?: import("../music").Note[] | null;
  candStrength?: number;
  reshaping?: boolean;
  onReshape?: (strength?: number) => void;
  onSaveCandidate?: () => void;
  onDiscardCandidate?: () => void;
  onDetectKey?: () => void; // 調推定（メロの音→key設定・押すごとに候補巡回）
  keyReport?: string | null;
  onClearKeyReport?: () => void;
  reloadSignal?: number;
  onChanged?: () => void;
  onOpenNeta?: (n: Neta) => void; // Section のブロックタップ→子ネタを開く（潜る）
  onOpenSkeletonDesk?: (t: import("./SkeletonDesk").SkeletonDeskTarget) => void; // #20 S6：骨格ブロック→机
  flush?: () => Promise<void>; // 未保存ぶんを確定（♪歌う前に歌詞をDBへ反映＝サーバは保存済contentを歌う）
  cow?: import("../useCowGuard").CowGuard; // CoW ガード（S2 Fix C）＝section 直接保存の安全弁（未指定＝従来どおり）
  // useTransport の返り（プレイヘッド/スクロール/拍 ref）
  tp: { lineRef: any; scrollerRef: any; beatRef: any; playing: boolean };
  activeProject?: string; // Task1i：Source（プロジェクト軸）絞りのため 3エディタ→PatternImportDialog へ下ろす（純追加）。
}

export function KindEditorBody(p: KindEditorBodyProps) {
  const { isMelody, isBass, isCounter, isRiff, isChord, isRhythm, isContainer, isRelBass } = p.flags;
  const tp = p.tp;
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  useDismiss(toolsRef, toolsOpen, useCallback(() => setToolsOpen(false), [])); // 外タップ/Escで閉じる
  const [simReport, setSimReport] = useState<string | null>(null);
  // ※♪歌う（W-K3 単体試聴）は撤去。仮歌の入れ方はメロの楽器＝仮歌（MetaPanel の音色ピッカー）に集約し、
  //   歌う設定のメロは通常の▶で歌う（NetaDialog／SectionEditor が同一 useVocalRender 経路でレンダ→同期再生）。
  // トランスポーズ（①道具・純クライアント＝Undo可）。全ノートのピッチを移動。
  const transpose = (d: number) =>
    p.setNotes(p.notes.map((n) => ({ ...n, pitch: Math.max(0, Math.min(127, n.pitch + d)) })));
  // #bass S7（決定①）：絶対↔相対の破壊的トグルに確認。現モードに中身が有り切替先で保存すると失われる時だけ confirm。
  // 空なら無言で切替（データ喪失に見えない）。変換ロジックは新設しない（絶対→度数逆算は研究級＝backlog）。
  const switchBassMode = (m: "absolute" | "relative") => {
    if (m === p.bassMode) return;
    const hasContent = p.bassMode === "absolute" ? p.notes.length > 0 : p.bassPattern.length > 0;
    const lost = p.bassMode === "absolute" ? "絶対ノート" : "相対パターン";
    if (hasContent && !window.confirm(`「${lost}」は切り替えて保存すると失われます。切り替えますか？`)) return;
    p.setBassMode(m);
  };
  // 似たメロ（①道具・retrieval・読むだけv1）：連想元コーパスから近いメロを近い順に。
  async function findSimilar() {
    setToolsOpen(false);
    if (!p.notes.length) return;
    setSimReport("探し中…");
    try {
      const r = await api.melodyNeighbors({ notes: p.notes, scope: "library", top: 5 });
      const list = (r.neighbors ?? []).filter((x) => x.similarity > 0);
      setSimReport(
        list.length
          ? "似たメロ：" + list.map((x) => `${x.label ?? "?"}(${Math.round(x.similarity * 100)}%)`).join("・")
          : "似たメロは見つからず（連想元コーパスに近いものなし）",
      );
    } catch {
      setSimReport("似たメロの検索に失敗");
    }
  }
  return (
    <div className="editor-body">
      {isMelody || isBass || isCounter || isRiff ? (
        <div className="melody-input">
          {/* #bass S2: bass は 絶対(ピアノロール)/相対(度数グリッド) をモード切替 */}
          {isBass && (
            <div className="input-toggle">
              <button type="button" className={p.bassMode === "absolute" ? "on" : ""} onClick={() => switchBassMode("absolute")}>
                絶対
              </button>
              <button type="button" className={p.bassMode === "relative" ? "on" : ""} onClick={() => switchBassMode("relative")}>
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
              patternId={p.bassPatternId}
              patternEdited={p.bassPatternEdited}
              onApplyPattern={p.onApplyBassPattern}
              meter={p.meter}
              keyPc={p.keyPc}
              tempo={p.tempo}
              program={p.program}
              playheadRef={tp.lineRef}
              scrollerRef={tp.scrollerRef}
              activeProject={p.activeProject}
            />
          ) : (
            <>
              {/* 描く/選ぶ ＋ いじる（メロはロール一本＝パッド撤去 2026-07-04）。 */}
              <div className="roll-toolbar">
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
                      {/* 消す＝ノートtapで削除（Section の消しゴムと同じ流儀・④）。 */}
                      <button type="button" aria-label="mode-erase" title="消す（タップで削除）" className={p.rollMode === "erase" ? "on" : ""} onClick={() => p.setRollMode("erase")}>
                        <Icon name="eraser" size={18} />
                      </button>
                      {/* 詞＝歌詞リタッチ（メロのみ）：音符タップで syllable 編集・確定で次へ。ノート編集は無効化＝タップ競合の構造的解消。 */}
                      {isMelody && (
                        <button type="button" aria-label="mode-lyric" title="詞（音符タップで歌詞を編集）" className={p.rollMode === "lyric" ? "on" : ""} onClick={() => p.setRollMode("lyric")}>
                          詞
                        </button>
                      )}
                    </div>
                    {isMelody && !p.candidate && (
                      <>
                        <span className="tb-divider" aria-hidden="true" />
                        <div className="assign-wrap" ref={toolsRef}>
                          <button
                            type="button"
                            className={"tb-tool tools-btn" + (toolsOpen ? " on" : "")}
                            aria-label="tools"
                            aria-expanded={toolsOpen}
                            title="このメロをいじる（崩す・調推定・似たメロ・移調）"
                            onClick={() => setToolsOpen((v) => !v)}
                          >
                            <Icon name="wand" size={16} /> いじる ▾
                          </button>
                          {toolsOpen && (
                            <div className="assign-menu to-right tools-menu" aria-label="tools-menu">
                              <button type="button" className="tool-item primary" aria-label="reshape" disabled={p.reshaping} onClick={() => { setToolsOpen(false); p.onReshape?.(); }}>
                                崩す（別メロ候補）
                              </button>
                              <button type="button" className="tool-item" aria-label="detect-key-melody" onClick={() => { setToolsOpen(false); p.onDetectKey?.(); }}>調推定</button>
                              <button type="button" className="tool-item" aria-label="find-similar-melody" onClick={() => void findSimilar()}>似たメロ</button>
                              <div className="tools-sep">移調</div>
                              <div className="tools-transpose">
                                <button type="button" className="tool-item" onClick={() => transpose(1)}>＋半音</button>
                                <button type="button" className="tool-item" onClick={() => transpose(-1)}>−半音</button>
                                <button type="button" className="tool-item" onClick={() => transpose(12)}>＋8va</button>
                                <button type="button" className="tool-item" onClick={() => transpose(-12)}>−8va</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
              </div>
              {simReport && (
                <p className="fit-report" aria-label="similar-report" onClick={() => setSimReport(null)}>
                  {simReport} <span className="muted">（タップで消す）</span>
                </p>
              )}
              {p.keyReport && (
                <p className="fit-report" aria-label="key-report" onClick={() => p.onClearKeyReport?.()}>
                  {p.keyReport} <span className="muted">（タップで消す）</span>
                </p>
              )}
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
                    meter={p.meter}
                    pickup={p.pickup}
                    low={isBass ? 28 : undefined}
                    high={isBass ? 55 : undefined}
                    enableLyric={isMelody}
                    keyRoot={p.keyPc}
                    keyMode={p.mode}
                    mode={p.rollMode}
                    ghostNotes={p.candidate ? p.notes : undefined}
                    readOnly={!!p.candidate}
                    playheadRef={tp.lineRef}
                    scrollerRef={tp.scrollerRef}
                  />
            </>
          )}
        </div>
      ) : p.flags.isChordPat || p.flags.isSectionInst ? ( // 管弦(section_inst・WP-X3c)も進行追従の多声＝ChordPatternEditor を共有
        <ChordPatternEditor pattern={p.chordPat} onChange={p.setChordPat} meter={p.meter} program={p.program} tempo={p.tempo} keyPc={p.keyPc} showPicker={p.flags.isChordPat} previewChords={(p.neta.content as { preview_chords?: ChordEntry[] } | null)?.preview_chords} playheadRef={tp.lineRef} scrollerRef={tp.scrollerRef} activeProject={p.activeProject} />
      ) : isChord ? (
        <ChordEditor chords={p.chords} onChange={p.setChords} beatRef={tp.beatRef} playing={tp.playing} meter={p.meter} />
      ) : isRhythm ? (
        <RhythmEditor rhythm={p.rhythm} onChange={p.setRhythm} meter={p.meter} tempo={p.tempo} playheadRef={tp.lineRef} scrollerRef={tp.scrollerRef} activeProject={p.activeProject} />
      ) : p.flags.isSkel ? (
        <div className="melody-input">
          {/* 描く/選ぶ/消す（メロと同じモード流儀）。骨格の点は次点/句境界まで支配。 */}
          <div className="roll-toolbar">
            <div className="proll-modes">
              <button type="button" aria-label="mode-draw" title="描く（打点/移動）" className={p.rollMode === "draw" ? "on" : ""} onClick={() => p.setRollMode("draw")}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" /></svg>
              </button>
              <button type="button" aria-label="mode-select" title="選ぶ（選択して編集）" className={p.rollMode === "select" ? "on" : ""} onClick={() => p.setRollMode("select")}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3.5 3" /></svg>
              </button>
              <button type="button" aria-label="mode-erase" title="消す（点タップで削除）" className={p.rollMode === "erase" ? "on" : ""} onClick={() => p.setRollMode("erase")}>
                <Icon name="eraser" size={18} />
              </button>
            </div>
          </div>
          <SkeletonEditor
            tones={p.tones ?? []} setTones={p.setTones!}
            bass={p.skelBass ?? []} setBass={p.setSkelBass!}
            phrases={p.phrases ?? []} setPhrases={p.setPhrases!}
            bars={p.skelBars ?? 4} setBars={p.setSkelBars}
            meter={p.meter} keyPc={p.keyPc} keyMode={p.mode}
            chords={p.skelChords ?? []}
            rollMode={p.rollMode}
            counterpoint={p.skelCounter ?? true} setCounterpoint={p.setSkelCounter ?? (() => {})}
            tempo={p.tempo}
            playheadRef={tp.lineRef} scrollerRef={tp.scrollerRef}
          />
        </div>
      ) : isContainer ? (
        <SectionEditor
          neta={p.neta}
          keyPc={p.keyPc}
          tempo={p.tempo}
          meter={p.meter}
          title={p.title}
          reloadSignal={p.reloadSignal}
          onChanged={p.onChanged}
          onOpenNeta={p.onOpenNeta}
          onOpenSkeletonDesk={p.onOpenSkeletonDesk}
          cow={p.cow}
        />
      ) : (
        <div className="text-editor">
          <textarea aria-label="text" placeholder={TEXT_PLACEHOLDER[p.neta.kind]} value={p.text} onChange={(e) => p.setText(e.target.value)} />
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
