import { useCallback, useEffect, useRef, useState } from "react";
import { playNotes, type Note, type PlaybackHandle, type Feel } from "./music";
import { usePlayhead } from "./usePlayhead";

export type TransportState = "stopped" | "playing" | "paused";

// #59 トランスポート状態機械。再生/一時停止/頭出し/ループを集約し、
// NetaDialog・SectionEditor の inline トグルを置換（重複解消）。
// pause は位置保持（rAFは止めず Transport の凍結した seconds を読むので線も止まる）。
export function useTransport(
  getNotes: () => Note[],
  bpm: number,
  // #20 S6骨格の机: activeLens は加算 optional。未指定＝従来完全一致（NetaDialog/SectionEditor 不変）。
  // 指定時＝begin の playNotes へ渡し初期ゲート（そのレンズだけ開く）を効かせる＝レンズ印つき notes 用。
  opts: { scaleBeats: number; bpb?: number; program?: number; feel?: Feel | null; compound?: boolean; activeLens?: string },
) {
  const { lineRef, timeRef, scrollerRef, beatRef, start: startPh, stop: stopPh } = usePlayhead();
  const handle = useRef<PlaybackHandle | null>(null);
  const [state, setState] = useState<TransportState>("stopped");
  const [loopOn, setLoopOn] = useState(false);

  // 最新値を ref に退避＝コールバックを安定化（stale closure 回避）。activeLens も載せる＝再ループ時の
  // 初期ゲート（そのレンズだけ開く）が最新のレンズ選択で正しく効く（無停止切替は begin を回さないので別経路）。
  const cfg = useRef({ getNotes, bpm, scaleBeats: opts.scaleBeats, bpb: opts.bpb ?? 4, program: opts.program ?? 0, feel: opts.feel, compound: opts.compound, activeLens: opts.activeLens });
  cfg.current = { getNotes, bpm, scaleBeats: opts.scaleBeats, bpb: opts.bpb ?? 4, program: opts.program ?? 0, feel: opts.feel, compound: opts.compound, activeLens: opts.activeLens };

  const begin = useCallback(
    async (loop: boolean) => {
      const c = cfg.current;
      const notes = c.getNotes();
      if (!notes.length) return;
      const total = notes.reduce((m, n) => Math.max(m, n.start + n.dur), 0);
      handle.current = await playNotes(notes, c.bpm, {
        loop: loop ? { startBeat: 0, endBeat: total } : undefined,
        program: c.program,
        feel: c.feel,
        compound: c.compound,
        activeLens: c.activeLens, // #20 S6: notes にレンズ印がある時だけ意味を持つ（未指定＝全開＝従来）
        onEnd: () => {
          setState("stopped");
          stopPh();
        },
      });
      setState("playing");
      void startPh(c.scaleBeats, c.bpm, c.bpb);
    },
    [startPh, stopPh],
  );

  const playPause = useCallback(() => {
    if (state === "playing") {
      handle.current?.pause();
      setState("paused");
    } else if (state === "paused") {
      handle.current?.resume();
      setState("playing");
    } else {
      void begin(loopOn);
    }
  }, [state, loopOn, begin]);

  const rewind = useCallback(() => {
    handle.current?.stop();
    handle.current = null;
    stopPh();
    setState("stopped");
  }, [stopPh]);

  const toggleLoop = useCallback(() => {
    const next = !loopOn;
    setLoopOn(next);
    if (state !== "stopped") {
      handle.current?.stop();
      void begin(next); // 再生中なら新ループ設定で鳴らし直す
    }
  }, [loopOn, state, begin]);

  // #20 S6骨格の机: レンズ別ゲートを**再生を止めずに**開閉（handle パススルー）。begin を回さない＝
  // 再スケジュールしない＝再生位置が飛ばない（無停止A/B の核）。停止中/レンズ層なしは handle 側で no-op。
  const setLensGain = useCallback((lens: string, on: boolean) => {
    handle.current?.setLensGain(lens, on);
  }, []);

  // 別ネタへ切替/アンマウントで鳴りっぱなしを止める
  useEffect(() => () => handle.current?.stop(), []);

  return {
    state,
    loopOn,
    playing: state === "playing",
    lineRef,
    timeRef,
    scrollerRef,
    beatRef,
    playPause,
    rewind,
    toggleLoop,
    setLensGain,
  };
}
