import { useCallback, useEffect, useRef } from "react";

// #58: 再生プレイヘッド。Tone.Transport の現在秒を直読みして 0..1 の比率 --ph を
// ref経由でDOMへ直書きする（毎フレーム setState しない＝再レンダ無し）。
// CSS 側は left: calc(gutter + var(--ph) * (100% - gutter)) で線を配置（fit-to-width前提）。
// 時間源は1箇所に隔離（now補間ではなく Transport.seconds - lookAhead で音と一致／負はclamp）。
export function usePlayhead() {
  const lineRef = useRef<HTMLDivElement | null>(null);
  const raf = useRef<number | undefined>(undefined);
  const ctx = useRef<{ scale: number; bpm: number; lookAhead: number; seconds: () => number } | null>(
    null,
  );

  const stop = useCallback(() => {
    if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    raf.current = undefined;
    ctx.current = null;
    const el = lineRef.current;
    if (el) el.style.display = "none";
  }, []);

  const tick = useCallback(() => {
    const c = ctx.current;
    const el = lineRef.current;
    if (!c || !el) return;
    // 負clamp必須：開始直後 seconds<lookAhead で線が左端外へ出るのを防ぐ。
    const beat = (Math.max(0, c.seconds() - c.lookAhead) * c.bpm) / 60;
    const ratio = c.scale > 0 ? Math.min(beat / c.scale, 1) : 0;
    el.style.setProperty("--ph", String(ratio));
    raf.current = requestAnimationFrame(tick);
  }, []);

  // scaleBeats = グリッド全体の拍数（SectionEditor=TOTAL小節拍 / PianoRoll=span）。
  // 自己停止しない（再生終了は playNotes の onEnd → stop() で行う）。
  const start = useCallback(
    async (scaleBeats: number, bpm: number) => {
      const Tone = await import("tone");
      const transport = Tone.getTransport();
      ctx.current = {
        scale: scaleBeats,
        bpm,
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
  return { lineRef, start, stop };
}
