// フレーズ骨格プランナ（design #12-M / spec §10.5-10.6）。音を作る前に「呼吸」を先に置く。
// bars+meter → phrase/period（前楽節=問い/後楽節=答え）＋句末カデンツ目標＋息継ぎ位置。決定的・純関数。
import { meterInfo } from "./meter";

export interface Phrase {
  startBeat: number; // 句頭（四分基準・小節頭）
  beats: number; // 句の長さ（四分）
  role: "antecedent" | "consequent" | "phrase";
  cadenceDegree: number; // 句末の着地度数（1=主音/5=属音=半終止感/2）
  breath: boolean; // 句末に息継ぎ（休符 or 長音）
  strongBreath: boolean; // period末/最終＝より長い息継ぎ
  isLast: boolean;
}

// P0-b：句割りパターン（小節数の配列）。対称＝2小節句（square）／非対称＝3小節基調の不等分割。
// 合計は必ず total に一致。末尾の1小節だけ残る弱い端句は直前へ吸収する（[..,3,1]→[..,4]）。
function symmetricBars(total: number): number[] {
  const phraseBars = total >= 2 ? 2 : 1; // 既定2小節phrase（1小節しか無ければ1）
  const out: number[] = [];
  for (let bar = 0; bar < total; ) {
    const p = Math.min(phraseBars, total - bar);
    out.push(p);
    bar += p;
  }
  return out;
}
function asymmetricBars(total: number): number[] {
  if (total <= 2) return [total];
  const out: number[] = [];
  for (let rem = total; rem > 0; ) {
    const p = rem >= 3 ? 3 : rem;
    out.push(p);
    rem -= p;
  }
  if (out.length >= 2 && out[out.length - 1] === 1) {
    out[out.length - 2]! += 1; // 1小節端句を前へ吸収＝弱い独り立ちを避ける
    out.pop();
  }
  return out;
}

// 2小節=phrase、4小節=period(antecedent+consequent)。前楽節末=属音(問い)、後楽節/最終=主音(答え)。
// opts.phrasing="asymmetric" で非対称な句割り（既定=対称＝従来どおり・後方互換）。
export function planSkeleton(bars: number, meter?: string | null, opts: { phrasing?: "symmetric" | "asymmetric" } = {}): Phrase[] {
  const bpb = meterInfo(meter).beatsPerBar;
  const total = Math.max(1, Math.trunc(bars));
  const pattern = opts.phrasing === "asymmetric" ? asymmetricBars(total) : symmetricBars(total);
  const out: Phrase[] = [];
  let bar = 0;
  let idx = 0;
  for (const pBars of pattern) {
    const periodPos = idx % 2; // 0=前楽節, 1=後楽節（4小節period）
    const isLast = bar + pBars >= total;
    // 役割：period内 前=antecedent(属音=問い)／後=consequent(主音=答え)。最終は必ず主音。
    let role: Phrase["role"] = total < 2 ? "phrase" : periodPos === 0 ? "antecedent" : "consequent";
    let cadenceDegree = role === "antecedent" ? 5 : 1;
    if (isLast) {
      cadenceDegree = 1; // 最終句は完全終止＝主音
      if (role === "antecedent") role = "consequent"; // 端数で前楽節止まりでも答えで閉じる
    }
    out.push({
      startBeat: bar * bpb,
      beats: pBars * bpb,
      role,
      cadenceDegree,
      breath: true, // 句末は必ず息継ぎ（spec §7-1）
      strongBreath: periodPos === 1 || isLast, // period末/最終はより長く
      isLast,
    });
    bar += pBars;
    idx += 1;
  }
  return out;
}
