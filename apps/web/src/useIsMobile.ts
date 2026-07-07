import { useEffect, useState } from "react";

// モバイル土台：狭い画面か（≤820px、base.css のブレークポイントと一致）。リサイズ追従。
// App.tsx から機械分割（負債D6）＝挙動不変。
const MOBILE_MQ = "(max-width: 820px)";

export function useIsMobile(): boolean {
  const has = typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [m, setM] = useState(() => has && window.matchMedia(MOBILE_MQ).matches);
  useEffect(() => {
    if (!has) return; // jsdom 等 matchMedia 無し＝デスクトップ既定
    const mq = window.matchMedia(MOBILE_MQ);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [has]);
  return m;
}
