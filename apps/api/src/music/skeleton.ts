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

// 2小節=phrase、4小節=period(antecedent+consequent)。前楽節末=属音(問い)、後楽節/最終=主音(答え)。
export function planSkeleton(bars: number, meter?: string | null): Phrase[] {
  const bpb = meterInfo(meter).beatsPerBar;
  const total = Math.max(1, Math.trunc(bars));
  const phraseBars = total >= 2 ? 2 : 1; // 既定2小節phrase（1小節しか無ければ1）
  const out: Phrase[] = [];
  let bar = 0;
  let idx = 0;
  while (bar < total) {
    const pBars = Math.min(phraseBars, total - bar);
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
