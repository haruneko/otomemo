import { type Ref, type ReactNode, useSyncExternalStore } from "react";
import { type TransportState } from "../useTransport";
import { subscribeSfLoading, isSfLoading, subscribeSfPreparing, isSfPreparing } from "../audio";
import { Icon } from "./Icon";
import { MixerControl } from "./MixerControl";

// #59 下端固定トランスポート。⏮頭出し / ▶⇄⏸ / 🔁ループ / 小節:拍。タップ標的44px。
export function TransportBar({
  state,
  loopOn,
  timeRef,
  onPlayPause,
  onRewind,
  onToggleLoop,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  pending = null,
  extra,
}: {
  state: TransportState;
  loopOn: boolean;
  timeRef: Ref<HTMLElement>;
  onPlayPause: () => void;
  onRewind: () => void;
  onToggleLoop: () => void;
  onUndo?: () => void; // 音楽ネタの編集Undo（design 決定U3・案1＝トランスポート左）
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  // 再生ローディング表示（設計2026-07-17）：仮歌レンダ中のラベル（例「歌声 1/3…」）。null/未指定＝従来 markup 完全一致。
  pending?: string | null;
  extra?: ReactNode; // 再生系の追加トグル（例: Section の「骨格を鳴らす」＝再生機能なのでトランスポートに置く）
}) {
  const playing = state === "playing";
  const busy = pending != null;
  // #24 backlog: SF2 ロード進行中だけ「音源読込中…」を出す（鳴らせなくはしない＝#24 の有界待ちで再生は即可能）。
  const sfLoading = useSyncExternalStore(subscribeSfLoading, isSfLoading, () => false);
  // W3 sampler 準備中（設計2026-07-17）。ステータススロットは1本＝優先順位で1つだけ出す。
  const sfPreparing = useSyncExternalStore(subscribeSfPreparing, isSfPreparing, () => false);
  // 優先順位「歌声 N/M…」＞「音源読込中…」＞「楽器準備中…」。
  const status = pending ?? (sfLoading ? "音源読込中…" : sfPreparing ? "楽器準備中…" : null);
  return (
    <div className="transport" role="group" aria-label="transport">
      {onUndo && (
        <>
          <button type="button" className="tp-btn" aria-label="undo" title="元に戻す" onClick={onUndo} disabled={!canUndo}>
            <Icon name="undo" />
          </button>
          <button type="button" className="tp-btn" aria-label="redo" title="やり直す" onClick={onRedo} disabled={!canRedo}>
            <Icon name="redo" />
          </button>
          <span className="tp-divider" aria-hidden="true" />
        </>
      )}
      <button type="button" className="tp-btn" aria-label="rewind" title="頭出し" onClick={onRewind}>
        <Icon name="rewind" />
      </button>
      <button
        type="button"
        className="tp-btn tp-main"
        aria-label="play-pause"
        aria-pressed={playing}
        aria-busy={busy || undefined}
        title={busy ? "準備中…" : playing ? "一時停止" : "再生"}
        onClick={busy ? undefined : onPlayPause}
      >
        {busy ? (
          <span className="tp-spin" aria-hidden="true" />
        ) : (
          <Icon name={playing ? "pause" : "play"} size={22} />
        )}
      </button>
      <button
        type="button"
        className={"tp-btn" + (loopOn ? " on" : "")}
        aria-label="loop"
        aria-pressed={loopOn}
        title="ループ"
        onClick={onToggleLoop}
      >
        <Icon name="loop" />
      </button>
      <span className="transport-time" aria-label="position" ref={timeRef}>
        1:1
      </span>
      {status != null &&
        (pending != null ? (
          <span className="sf-loading" aria-label="play-pending" role="status" title="再生の準備中">
            {status}
          </span>
        ) : (
          <span className="sf-loading" aria-label="sf-loading" role="status" title={sfLoading ? "音源(SF2)を読込中" : "楽器を準備中"}>
            {status}
          </span>
        ))}
      {extra}
      <MixerControl />
    </div>
  );
}
