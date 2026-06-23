// 拍子→拍構造（design #12-M / spec §10.2）。フレーズ/息継ぎ/カデンツ/オンセット配置が拍子に従うための土台。
// content は四分=1.0 基準（既存 #51）。beatsPerBar = numerator×4/denominator（4/4→4, 6/8→3, 3/4→3）。
// 6/8 は複合2拍子＝付点四分が2ビート（各3分割）。要件line99/104「6/8と言ったら6/8」の足場。

export interface MeterSlot {
  pos: number; // 小節頭からの位置（四分基準）
  strength: number; // メトリック重み（1.0=小節頭 / 0.5=中位アクセント / 0.25=下位）
}
export interface MeterInfo {
  meter: string;
  beatsPerBar: number; // 四分基準
  grouping: "simple" | "compound";
  slots: MeterSlot[]; // 1小節分のメトリック・グリッド（強拍構造）
  strongPositions: number[]; // strength>=0.5 の位置（句末着地・骨格音の置き場）
}

function parseMeter(meter: string): { n: number; d: number } {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter);
  if (!m) return { n: 4, d: 4 };
  const n = Number(m[1]);
  const d = Number(m[2]);
  return n > 0 && d > 0 ? { n, d } : { n: 4, d: 4 };
}

export function meterInfo(meter?: string | null): MeterInfo {
  const { n, d } = parseMeter(meter ?? "4/4");
  const beatsPerBar = (n * 4) / d;
  // 複合拍子：分母8で分子が3の倍数(6/8,9/8,12/8)＝付点四分のビート群（各3つの八分）。
  const compound = d === 8 && n % 3 === 0 && n >= 6;
  const slots: MeterSlot[] = [];
  if (compound) {
    const eighth = 0.5; // 八分=0.5四分
    for (let i = 0; i < n; i++) {
      const head = i % 3 === 0; // 付点四分ビートの頭
      slots.push({ pos: i * eighth, strength: i === 0 ? 1.0 : head ? 0.5 : 0.25 });
    }
  } else {
    const unit = 4 / d; // 1拍=四分換算
    for (let i = 0; i < n; i++) {
      // 偶数拍子は中央拍を中位アクセント（4/4 の3拍目）。
      const mid = n % 2 === 0 && i === n / 2;
      slots.push({ pos: i * unit, strength: i === 0 ? 1.0 : mid ? 0.5 : 0.25 });
    }
  }
  const strongPositions = slots.filter((s) => s.strength >= 0.5).map((s) => s.pos);
  return { meter: `${n}/${d}`, beatsPerBar, grouping: compound ? "compound" : "simple", slots, strongPositions };
}

// 小節内位置（四分）→メトリック重み。グリッド外は最小値。
export function beatStrengthAt(info: MeterInfo, posInBar: number): number {
  const slot = info.slots.find((s) => Math.abs(s.pos - posInBar) < 1e-6);
  return slot ? slot.strength : 0.1;
}
