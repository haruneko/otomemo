// 編集画面＝共有パーツの薄い合成（共通パーツ化 CP3）。state/ロジックは useNetaEditor に集約。
import { useNetaEditor } from "../useNetaEditor";
import { TransportBar } from "./TransportBar";
import { KindEditorBody } from "./KindEditorBody";
import { MetaPanel } from "./MetaPanel";
import { EditorHeader } from "./EditorHeader";
import { RelationsPanel } from "./RelationsPanel";
import type { Neta } from "../api";

export function NetaDialog({
  neta,
  onClose,
  onChanged,
  onOpenNeta,
  reloadSignal,
}: {
  neta: Neta;
  onClose: () => void;
  onChanged?: () => void;
  onOpenNeta?: (n: Neta) => void; // Section のブロックタップ→子ネタを開く（潜る）
  reloadSignal?: number; // D&D配置などの外部更新でSectionEditorを再読込
}) {
  const ed = useNetaEditor(neta, { onClose, onChanged });
  const f = ed.flags;
  // メインペーンの中身として描画（design #19：選択中netaの種類で中身が入れ替わる）。
  return (
    <div
      className="mainpane-editor"
      role="dialog"
      aria-label="edit-neta"
      data-kind={neta.kind}
      style={{ ["--k" as string]: `var(--k-${ed.colorKind})` }}
    >
      <EditorHeader kind={neta.kind} title={ed.title} setTitle={ed.setTitle} onClose={ed.close} saveStatus={ed.saveStatus} onFlush={ed.onFlush} onDelete={ed.remove} busy={ed.busy} />
      <MetaPanel
        flags={{
          collapsible: f.collapsibleMeta,
          showKey: f.showKey,
          showMeta: f.showMeta,
          isChord: f.isChord,
          isContainer: f.isContainer,
          isMelody: f.isMelody,
          isBass: f.isBass,
          isChordPat: f.isChordPat,
          isMusic: f.isMusic,
          isThemeable: f.isThemeable,
          hasChords: f.hasChords,
        }}
        keyPc={ed.key}
        mode={ed.mode}
        meter={ed.meter}
        tempo={ed.tempo}
        program={ed.program}
        tags={ed.tags}
        mood={ed.mood}
        setKey={ed.setKey}
        setMode={ed.setMode}
        setMeter={ed.setMeter}
        setTempo={ed.setTempo}
        setProgram={ed.setProgram}
        setTags={ed.setTags}
        setMood={ed.setMood}
        onDetectKey={() => void ed.detectKey()}
        onExtendLen={ed.onExtendLen}
        onToggleSchedule={() => void ed.toggleSchedule()}
        schedId={ed.schedId}
        rollBars={f.showRollBars ? { len: ed.len, setLen: ed.setLen, pickup: ed.pickup, setPickup: ed.setPickup, meter: ed.meter } : null}
      />
      <KindEditorBody
        neta={neta}
        flags={{ isMelody: f.isMelody, isBass: f.isBass, isChord: f.isChord, isChordPat: f.isChordPat, isRhythm: f.isRhythm, isSkel: f.isSkel, isContainer: f.isContainer, isRelBass: f.isRelBass }}
        tones={ed.tones} setTones={ed.setTones}
        skelBass={ed.skelBass} setSkelBass={ed.setSkelBass}
        phrases={ed.phrases} setPhrases={ed.setPhrases}
        skelBars={ed.skelBars} setSkelBars={ed.setSkelBars}
        skelChords={ed.skelChords} skelCounter={ed.skelCounter} setSkelCounter={ed.setSkelCounter}
        notes={ed.notes} setNotes={ed.setNotes}
        chordPat={ed.chordPat} setChordPat={ed.setChordPat}
        chords={ed.chords} setChords={ed.setChords}
        rhythm={ed.rhythm} setRhythm={ed.setRhythm}
        bassPattern={ed.bassPattern} setBassPattern={ed.setBassPattern}
        bassSteps={ed.bassSteps} setBassSteps={ed.setBassSteps}
        bassMode={ed.bassMode} setBassMode={ed.setBassMode}
        rollMode={ed.rollMode} setRollMode={ed.setRollMode}
        candidate={ed.candidate} candStrength={ed.candStrength} reshaping={ed.reshaping}
        onReshape={ed.reshape} onSaveCandidate={ed.saveCandidate} onDiscardCandidate={ed.discardCandidate}
        onDetectKey={() => void ed.detectKeyFromMelody()}
        keyReport={ed.keyReport} onClearKeyReport={ed.clearKeyReport}
        len={ed.len} setLen={ed.setLen}
        pickup={ed.pre} setPickup={ed.setPickup}
        text={ed.text} setText={ed.setText}
        keyPc={ed.key} mode={ed.mode} tempo={ed.tempo} meter={ed.meter} title={ed.title}
        reloadSignal={reloadSignal} onChanged={onChanged} onOpenNeta={onOpenNeta}
        tp={{ lineRef: ed.tp.lineRef, scrollerRef: ed.tp.scrollerRef, beatRef: ed.tp.beatRef, playing: ed.tp.playing }}
      />
      {f.isMusic && (
        <TransportBar
          state={ed.tp.state}
          loopOn={ed.tp.loopOn}
          timeRef={ed.tp.timeRef}
          onPlayPause={ed.tp.playPause}
          onRewind={ed.tp.rewind}
          onToggleLoop={ed.tp.toggleLoop}
          onUndo={ed.editHist.undo}
          onRedo={ed.editHist.redo}
          canUndo={ed.editHist.canUndo}
          canRedo={ed.editHist.canRedo}
        />
      )}
      <RelationsPanel rels={ed.rels} onOpenNeta={onOpenNeta} />
    </div>
  );
}
