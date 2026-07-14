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
    lead: number; // #25 弱起 lead L（拍・非ループのみ>0）。raw beat < lead の間は線を 0 待機・弱起表示。
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
    if (el) {
      el.style.display = "none";
      // #24 停止後にプレイヘッド変数の前回値が残る実バグの是正。display:none だけでは
      // --ph/--phb が残留し、次の start までCSS(left計算)に古い比率/生beatが効く。0へ明示リセット。
      el.style.setProperty("--ph", "0");
      el.style.setProperty("--phb", "0");
    }
    if (timeRef.current) timeRef.current.textContent = "1:1";
  }, [detach]);

  const tick = useCallback(() => {
    const c = ctx.current;
    if (!c) return;
    // 負clamp必須：開始直後 seconds<lookAhead で線が左端外へ出るのを防ぐ。
    const raw = (Math.max(0, c.seconds() - c.lookAhead) * c.bpm) / 60;
    // #25 弱起（負start）の再生契約：全イベントを +L シフトして 0 開始しているので、視覚は raw−L が真の拍。
    // raw < L（リード区間）は線を 0 位置で待機し position を「弱起…」表示。L 到達後は beat=raw−L で従来通り。
    // lead=0（弱起なし）は beat=raw＝従来と bit 一致。
    const beat = raw - c.lead;
    const el = lineRef.current;
    if (beat < 0) {
      beatRef.current = 0;
      if (el) {
        el.style.setProperty("--ph", "0");
        el.style.setProperty("--phb", "0"); // リード区間は線を頭で待機
      }
      if (timeRef.current) timeRef.current.textContent = "弱起…";
    } else {
      beatRef.current = Math.min(beat, c.scale);
      if (el) {
        el.style.setProperty("--ph", String(c.scale > 0 ? Math.min(beat / c.scale, 1) : 0));
        el.style.setProperty("--phb", String(Math.min(beat, c.scale))); // 生beat（末尾でclamp）
      }
      if (timeRef.current) timeRef.current.textContent = barBeat(beat, c.bpb);
    }

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
  // #25 leadBeats = 弱起 lead L（拍・非ループのみ>0）。既定 0＝弱起なし＝従来と bit 一致。
  const start = useCallback(
    async (scaleBeats: number, bpm: number, bpb = 4, leadBeats = 0) => {
      const Tone = await import("tone");
      const transport = Tone.getTransport();
      ctx.current = {
        scale: scaleBeats,
        bpm,
        bpb,
        lookAhead: Tone.getContext().lookAhead,
        lead: leadBeats,
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
