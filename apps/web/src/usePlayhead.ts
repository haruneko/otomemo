import { useCallback, useEffect, useRef } from "react";
import { barBeat } from "./music";

// #58/#59/#74: 再生プレイヘッド＋小節:拍表示＋追従スクロール。
// Tone.Transport の現在秒を直読みし、lineRef へ 0..1比率 --ph と 生beat --phb を、
// timeRef へ `bar:beat` を ref直書き（毎フレーム setState しない）。
// CSS は fit-to-width なら left: calc(gutter + var(--ph)*(100%-gutter))、
// コンテンツ座標(スクロール追従)なら left: calc(gutter + var(--phb)*pxPerBeat)。
// scrollerRef があれば page-turn 追従（手動スクロール中は一時停止）。
export function usePlayhead() {
  const lineRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const beatRef = useRef(0); // #76 現在拍（ChordEditor等が低頻度ポーリングで読む。state更新しない）
  const raf = useRef<number | undefined>(undefined);
  const ctx = useRef<{
    scale: number;
    bpm: number;
    bpb: number;
    lookAhead: number;
    seconds: () => number;
  } | null>(null);
  const userScrolledAt = useRef(0); // 手動スクロール最終時刻
  const programmatic = useRef(false); // 自分が出した scroll を手動と誤認しないため

  const onUserScroll = useCallback(() => {
    if (programmatic.current) {
      programmatic.current = false;
      return;
    }
    userScrolledAt.current = performance.now();
  }, []);

  const detach = useCallback(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    sc.removeEventListener("wheel", onUserScroll);
    sc.removeEventListener("touchstart", onUserScroll);
    sc.removeEventListener("pointerdown", onUserScroll);
  }, [onUserScroll]);

  const stop = useCallback(() => {
    if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    raf.current = undefined;
    ctx.current = null;
    beatRef.current = 0;
    detach();
    const el = lineRef.current;
    if (el) el.style.display = "none";
    if (timeRef.current) timeRef.current.textContent = "1:1";
  }, [detach]);

  const tick = useCallback(() => {
    const c = ctx.current;
    if (!c) return;
    // 負clamp必須：開始直後 seconds<lookAhead で線が左端外へ出るのを防ぐ。
    const beat = (Math.max(0, c.seconds() - c.lookAhead) * c.bpm) / 60;
    beatRef.current = Math.min(beat, c.scale);
    const el = lineRef.current;
    if (el) {
      el.style.setProperty("--ph", String(c.scale > 0 ? Math.min(beat / c.scale, 1) : 0));
      el.style.setProperty("--phb", String(Math.min(beat, c.scale))); // 生beat（末尾でclamp）
    }
    if (timeRef.current) timeRef.current.textContent = barBeat(beat, c.bpb);

    // #74 追従スクロール（page-turn）。手動スクロール後 2.5s は止める。
    const sc = scrollerRef.current;
    if (el && sc && performance.now() - userScrolledAt.current > 2500) {
      const sr = sc.getBoundingClientRect();
      const lr = el.getBoundingClientRect();
      if (lr.right > sr.right - 16 || lr.left < sr.left) {
        programmatic.current = true;
        sc.scrollLeft += lr.left - sr.left - sr.width * 0.3; // 線を左30%付近へ送る
      }
    }
    raf.current = requestAnimationFrame(tick);
  }, []);

  // scaleBeats = グリッド全体の拍数。bpb = 1小節の拍数。自己停止しない（終了は onEnd→stop()）。
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
        el.style.setProperty("--phb", "0");
        el.style.display = "block";
      }
      const sc = scrollerRef.current;
      if (sc) {
        userScrolledAt.current = 0;
        sc.addEventListener("wheel", onUserScroll, { passive: true });
        sc.addEventListener("touchstart", onUserScroll, { passive: true });
        sc.addEventListener("pointerdown", onUserScroll, { passive: true });
      }
      if (raf.current !== undefined) cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(tick);
    },
    [tick, onUserScroll],
  );

  useEffect(() => () => stop(), [stop]);
  return { lineRef, timeRef, scrollerRef, beatRef, start, stop };
}
