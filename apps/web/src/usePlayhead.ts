import { useCallback, useEffect, useRef } from "react";
import { barBeat } from "./music";

// #58/#59: 再生プレイヘッド＋小節:拍表示。Tone.Transport の現在秒を直読みして
// 0..1 の比率 --ph を lineRef へ、`bar:beat` を timeRef へ ref直書き（毎フレーム setState しない）。
// CSS 側は left: calc(gutter + var(--ph) * (100% - gutter)) で線を配置（fit-to-width前提）。
// 時間源は1箇所に隔離（Transport.seconds - lookAhead で音と一致／負はclamp）。
export function usePlayhead() {
  const lineRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLElement | null>(null);
  const raf = useRef<number | undefined>(undefined);
  const ctx = useRef<{
    scale: number;
    bpm: number;
    bpb: number;
    lookAhead: number;
    seconds: () => number;
  } | null>(null);

  const stop = useCallback(() => {
    if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    raf.current = undefined;
    ctx.current = null;
    const el = lineRef.current;
    if (el) el.style.display = "none";
    if (timeRef.current) timeRef.current.textContent = "1:1";
  }, []);

  const tick = useCallback(() => {
    const c = ctx.current;
    if (!c) return;
    // 負clamp必須：開始直後 seconds<lookAhead で線が左端外へ出るのを防ぐ。
    const beat = (Math.max(0, c.seconds() - c.lookAhead) * c.bpm) / 60;
    if (lineRef.current) {
      const ratio = c.scale > 0 ? Math.min(beat / c.scale, 1) : 0;
      lineRef.current.style.setProperty("--ph", String(ratio));
    }
    if (timeRef.current) timeRef.current.textContent = barBeat(beat, c.bpb);
    raf.current = requestAnimationFrame(tick);
  }, []);

  // scaleBeats = グリッド全体の拍数（SectionEditor=TOTAL小節拍 / PianoRoll=span）。
  // bpb = 1小節の拍数（小節:拍 表示用）。自己停止しない（終了は playNotes の onEnd→stop()）。
  const start = useCallback(
    async (scaleBeats: number, bpm: number, bpb = 4) => {
      const Tone = await import("tone");
      const transport = Tone.getTransport();
      ctx.current = {
        scale: scaleBeats,
        bpm,
        bpb,
        lookAhead: Tone.getContext().lookAhead,
        seconds: () => transport.seconds,
      };
      const el = lineRef.current;
      if (el) {
        el.style.setProperty("--ph", "0");
        el.style.display = "block";
      }
      if (raf.current !== undefined) cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  useEffect(() => () => stop(), [stop]);
  return { lineRef, timeRef, start, stop };
}
