import { useCallback, useEffect, useRef, useState } from "react";

// #49: 再生中の現在ビートを返す（再生してない時は null）。
// 既知の総ビート数とテンポから rAF で時間補間（Tone を覗かずに済む）。
export function usePlayhead() {
  const [beat, setBeat] = useState<number | null>(null);
  const raf = useRef<number | undefined>(undefined);

  const stop = useCallback(() => {
    if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    raf.current = undefined;
    setBeat(null);
  }, []);

  const start = useCallback(
    (totalBeats: number, bpm: number) => {
      if (raf.current !== undefined) cancelAnimationFrame(raf.current);
      const t0 = performance.now();
      const totalMs = (totalBeats * 60000) / bpm;
      const tick = () => {
        const e = performance.now() - t0;
        if (e >= totalMs) {
          stop();
          return;
        }
        setBeat((e / 60000) * bpm);
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [stop],
  );

  useEffect(() => () => stop(), [stop]);
  return { beat, start, stop };
}
