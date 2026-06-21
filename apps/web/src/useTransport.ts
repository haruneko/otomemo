import { useCallback, useEffect, useRef, useState } from "react";
import { playNotes, type Note, type PlaybackHandle } from "./music";
import { usePlayhead } from "./usePlayhead";

export type TransportState = "stopped" | "playing" | "paused";

// #59 トランスポート状態機械。再生/一時停止/頭出し/ループを集約し、
// NetaDialog・SectionEditor の inline トグルを置換（重複解消）。
// pause は位置保持（rAFは止めず Transport の凍結した seconds を読むので線も止まる）。
export function useTransport(
  getNotes: () => Note[],
  bpm: number,
  opts: { scaleBeats: number; bpb?: number; program?: number },
) {
  const { lineRef, timeRef, scrollerRef, beatRef, start: startPh, stop: stopPh } = usePlayhead();
  const handle = useRef<PlaybackHandle | null>(null);
  const [state, setState] = useState<TransportState>("stopped");
  const [loopOn, setLoopOn] = useState(false);

  // 最新値を ref に退避＝コールバックを安定化（stale closure 回避）。
  const cfg = useRef({ getNotes, bpm, scaleBeats: opts.scaleBeats, bpb: opts.bpb ?? 4, program: opts.program ?? 0 });
  cfg.current = { getNotes, bpm, scaleBeats: opts.scaleBeats, bpb: opts.bpb ?? 4, program: opts.program ?? 0 };

  const begin = useCallback(
    async (loop: boolean) => {
      const c = cfg.current;
      const notes = c.getNotes();
      if (!notes.length) return;
      const total = notes.reduce((m, n) => Math.max(m, n.start + n.dur), 0);
      handle.current = await playNotes(notes, c.bpm, {
        loop: loop ? { startBeat: 0, endBeat: total } : undefined,
        program: c.program,
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
  };
}
