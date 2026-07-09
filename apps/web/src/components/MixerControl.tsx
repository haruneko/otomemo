import { useRef, useState } from "react";
import { getMix, setMixVolume, type MixPart } from "../audio";
import { Icon } from "./Icon";

// 再生バーの音量コントロール（音割れ対策・耳FB 2026-07-09）。🔉ボタンで小さなミキサーを開閉。
// 全体音量＋パート別フェーダー(メロ/コード/ベース/ドラム)。値は audio.ts が localStorage に保存し
// マスターバス(ゲイン→リミッター→出口)へ即時反映。0〜1.4(=+約+3dB)まで＝天井はリミッターが持つ。
const PART_LABEL: Record<MixPart, string> = { melody: "メロ", chord: "コード", bass: "ベース", drums: "ドラム" };
const PARTS: MixPart[] = ["melody", "chord", "bass", "drums"];

export function MixerControl() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0); // スライダー操作で再描画（値は audio.ts が真実）
  const mix = useRef(getMix());
  const set = (key: "master" | MixPart, v: number) => {
    setMixVolume(key, v);
    mix.current = getMix();
    force((n) => n + 1);
  };
  const pct = (v: number) => `${Math.round(v * 100)}`;

  return (
    <div className="mixer-wrap">
      <button
        type="button"
        className={"tp-btn" + (open ? " on" : "")}
        aria-label="volume"
        aria-expanded={open}
        title="音量（全体・パート別）"
        onClick={() => {
          mix.current = getMix();
          setOpen((v) => !v);
        }}
      >
        <Icon name="volume" />
      </button>
      {open && (
        <div className="mixer-pop" role="group" aria-label="mixer" onClick={(e) => e.stopPropagation()}>
          <label className="mix-row master" aria-label="mix-master">
            <span className="mix-label">全体</span>
            <input type="range" min={0} max={1.4} step={0.02} value={mix.current.master} onChange={(e) => set("master", Number(e.target.value))} />
            <span className="mix-val">{pct(mix.current.master)}</span>
          </label>
          {PARTS.map((p) => (
            <label className="mix-row" key={p} aria-label={`mix-${p}`}>
              <span className="mix-label">{PART_LABEL[p]}</span>
              <input type="range" min={0} max={1.4} step={0.02} value={mix.current[p]} onChange={(e) => set(p, Number(e.target.value))} />
              <span className="mix-val">{pct(mix.current[p])}</span>
            </label>
          ))}
          <p className="mix-hint muted">重ねても割れないよう天井（リミッター）で保護</p>
        </div>
      )}
    </div>
  );
}
