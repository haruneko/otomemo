import { type Ref } from "react";
import { type TransportState } from "../useTransport";
import { Icon } from "./Icon";

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
}) {
  const playing = state === "playing";
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
        title={playing ? "一時停止" : "再生"}
        onClick={onPlayPause}
      >
        <Icon name={playing ? "pause" : "play"} size={22} />
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
    </div>
  );
}
