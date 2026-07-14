import { type Ref, type ReactNode, useSyncExternalStore } from "react";
import { type TransportState } from "../useTransport";
import { subscribeSfLoading, isSfLoading } from "../audio";
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
  extra?: ReactNode; // 再生系の追加トグル（例: Section の「骨格を鳴らす」＝再生機能なのでトランスポートに置く）
}) {
  const playing = state === "playing";
  // #24 backlog: SF2 ロード進行中だけ「音源読込中…」を出す（鳴らせなくはしない＝#24 の有界待ちで再生は即可能）。
  const sfLoading = useSyncExternalStore(subscribeSfLoading, isSfLoading, () => false);
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
      {sfLoading && (
        <span className="sf-loading" aria-label="sf-loading" title="音源(SF2)を読込中">
          音源読込中…
        </span>
      )}
      {extra}
      <MixerControl />
    </div>
  );
}
