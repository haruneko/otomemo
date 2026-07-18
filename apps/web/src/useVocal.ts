// #13c 仮歌（メロの楽器＝歌声）の busy/progress/msg 購読フック（#27 で駆動層 playback.ts へ縮退）。
// wav キャッシュと ensure/peek は module スコープ（playback.ts）へ移設＝エディタで歌わせた wav がカード/FormStrip
// でも即時再利用される。本フックは playback の busy 状態を購読し、ensure/peek/setMsg を素通しするだけ（cacheRef 撤去）。
import { useSyncExternalStore } from "react";
import { ensureVocal, peekVocal, setVocalMsg, subscribeVocalBusy, vocalBusyState } from "./playback";
// VocalJob/SingNote の SSOT は music.ts（純ドメイン）。既存 import 面（"./useVocal" 経由）は再輸出で不変に保つ。
export type { VocalJob, SingNote } from "./music";

export function useVocalRender() {
  const s = useSyncExternalStore(subscribeVocalBusy, vocalBusyState, vocalBusyState);
  return {
    busy: s.busy,
    progress: s.progress,
    msg: s.msg,
    setMsg: setVocalMsg,
    ensure: ensureVocal,
    peek: peekVocal,
  };
}
