// 連想エンジン：感情シフト。「このコードだけ もっと切なく/明るく」＝ルートは変えず品質だけ変える（単体・データ不要）。
// 決定的ルール。主観の良し悪しは最終的に人の耳（候補出しまでが道具の役）。
import { type Degree } from "./theory";

export type EmotionDir = "darker" | "brighter";
export type ShiftResult = { degree: number; quality: string; why: string };

// 切なく＝短調化／テンション付与。明るく＝長調化／明色のテンション。
const DARKER: Record<string, { q: string; why: string }> = {
  "": { q: "m", why: "短調化（長三度→短三度）" },
  maj7: { q: "m7", why: "短調化（メジャー7th→マイナー7th）" },
  "7": { q: "m7", why: "短調化（ドミナント→マイナー7th）" },
  "6": { q: "m", why: "短調化" },
  sus4: { q: "m", why: "サスを短三度へ解決＝切なく" },
  sus2: { q: "m", why: "短調化" },
  aug: { q: "m", why: "短調化" },
  m: { q: "m7", why: "7thを足して翳りを深く" },
  m6: { q: "m7", why: "7thで翳りを深く" },
};
const BRIGHTER: Record<string, { q: string; why: string }> = {
  m: { q: "", why: "長調化（短三度→長三度）" },
  m7: { q: "maj7", why: "長調化（マイナー7th→メジャー7th）" },
  m6: { q: "6", why: "長調化" },
  dim: { q: "m", why: "減を短へ緩める" },
  m7b5: { q: "m7", why: "翳りを少し晴らす" },
  "": { q: "6", why: "6thを足して明るく" },
  maj7: { q: "6", why: "6thで素直な明るさに" },
  "7": { q: "", why: "緊張を解いて素直な長三和音へ" },
};

/** 単体コードの感情シフト候補（ルート＝度数は不変・品質のみ）。当てはまる規則が無ければ空。 */
export function emotionShift(chord: Degree, dir: EmotionDir): ShiftResult[] {
  const q0 = chord.quality || "";
  const map = dir === "darker" ? DARKER : BRIGHTER;
  const hit = map[q0];
  if (!hit || hit.q === q0) return [];
  return [{ degree: ((Math.trunc(chord.degree) % 12) + 12) % 12, quality: hit.q, why: hit.why }];
}
