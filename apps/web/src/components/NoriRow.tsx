import type { Feel } from "../music";

// #29 P1：ノリ行＝セクション共有 feel（跳ね＋人間味）の直接操作。保存先は section content.feel（楽器非依存）。
// 跳ね＝swing スライダー（0..1）。人間味＝OFF/弱/中/強＝humanize 0/0.15/0.25/0.35（中=研究推奨帯20-30%・
// 強0.35＝ヨレ警告帯 40ms 手前で頭打ち）。両0＝feel キー削除（onChange(undefined)）＝無指定 bit 一致へ復帰。
const HUMANIZE_SEG: [string, number][] = [["OFF", 0], ["弱", 0.15], ["中", 0.25], ["強", 0.35]];
const HUMANIZE_LV = ["off", "weak", "mid", "strong"];
// 既存 feel の中間値（例 0.2）は最寄り段を点灯（生成の味付けで付いた連続値も正しい段に光る）。
export function humanizeSegOf(h: number): number {
  let best = 0, bd = Infinity;
  HUMANIZE_SEG.forEach(([, v], i) => { const d = Math.abs(v - h); if (d < bd) { bd = d; best = i; } });
  return best;
}

export function NoriRow({ feel, onChange }: { feel: Feel | undefined; onChange: (f: Feel | undefined) => void }) {
  const swing = feel?.swing ?? 0;
  const humanize = feel?.humanize ?? 0;
  // 両0＝キー削除。それ以外＝seed/swingUnit は保存値を保持（UI では触らない・seed🎲は backlog）。
  const emit = (nextSwing: number, nextHum: number) => {
    if (nextSwing === 0 && nextHum === 0) { onChange(undefined); return; }
    onChange({ swing: nextSwing, humanize: nextHum, seed: feel?.seed ?? 1, swingUnit: feel?.swingUnit });
  };
  const seg = humanizeSegOf(humanize);
  return (
    <div className="nori-row">
      <label className="knob-row" aria-label="nori-swing-row">
        <span className="knob-name">跳ね</span>
        <span className="knob-end">まっすぐ</span>
        <input aria-label="nori-swing" type="range" min={0} max={1} step={0.05} value={swing} onChange={(e) => emit(Number(e.target.value), humanize)} />
        <span className="knob-end">はねる</span>
      </label>
      <div className="knob-seg" role="group" aria-label="nori-humanize">
        <span className="knob-name">人間味<small>自然な揺れ(1/f)・盛り上限あり</small></span>
        <span className="seg-ctl">
          {HUMANIZE_SEG.map(([lab, v], i) => (
            <button
              key={lab}
              type="button"
              className={"seg-b" + (seg === i ? " on" : "")}
              aria-label={`nori-humanize-${HUMANIZE_LV[i]}`}
              aria-pressed={seg === i}
              onClick={() => emit(swing, v)}
            >{lab}</button>
          ))}
        </span>
      </div>
    </div>
  );
}
