// 連想エンジン：感情シフト。「このコードだけ もっと切なく/明るく」＝ルートは変えず品質だけ変える（単体・データ不要）。
// 決定的ルール。主観の良し悪しは最終的に人の耳（候補出しまでが道具の役）。
import { type Degree } from "./theory";
import { canonicalQuality } from "@cm/music-core";

export type EmotionDir = "darker" | "brighter";
export type ShiftResult = { degree: number; quality: string; why: string };

// 切なく＝短調化／テンション付与。明るく＝長調化／明色のテンション。
// M9(2026-07-08)：よくある品質(m7/dim/m7b5/sus4/6/dim7/aug/mM7)が黙って空[]＝「Am7を切なく」が無反応
// だった穴を埋め、複数候補も返せる形に（機械は候補まで＝選ぶのは人）。
const DARKER: Record<string, { q: string; why: string }[]> = {
  "": [{ q: "m", why: "短調化（長三度→短三度）" }],
  maj7: [{ q: "m7", why: "短調化（メジャー7th→マイナー7th）" }, { q: "mM7", why: "短調化＋メジャー7th残し＝ドラマチックな翳り" }],
  "7": [{ q: "m7", why: "短調化（ドミナント→マイナー7th）" }],
  "6": [{ q: "m6", why: "短調化（6thの浮遊感は残す）" }],
  sus4: [{ q: "m", why: "サスを短三度へ解決＝切なく" }],
  sus2: [{ q: "m", why: "短調化" }],
  aug: [{ q: "m", why: "短調化" }],
  m: [{ q: "m7", why: "7thを足して翳りを深く" }, { q: "mM7", why: "メジャー7thで劇的な翳り" }],
  m6: [{ q: "m7", why: "7thで翳りを深く" }],
  m7: [{ q: "m7b5", why: "♭5で更に翳らせる（ハーフディミニッシュ）" }, { q: "mM7", why: "メジャー7thで劇的な翳り" }],
  m7b5: [{ q: "dim7", why: "フルディミニッシュで極限の緊張" }],
  dim: [{ q: "dim7", why: "減7thを足して緊張を極める" }],
  mM7: [{ q: "m7b5", why: "♭5で不安定さを足す" }],
};
const BRIGHTER: Record<string, { q: string; why: string }[]> = {
  m: [{ q: "", why: "長調化（短三度→長三度）" }],
  m7: [{ q: "maj7", why: "長調化（マイナー7th→メジャー7th）" }],
  m6: [{ q: "6", why: "長調化" }],
  dim: [{ q: "m", why: "減を短へ緩める" }],
  dim7: [{ q: "7", why: "属7へ読み替え＝進行感のある明るさ" }, { q: "m", why: "減の緊張を短三和音へ緩める" }],
  m7b5: [{ q: "m7", why: "翳りを少し晴らす" }],
  mM7: [{ q: "maj7", why: "長調化（劇的な翳り→澄んだ響き）" }],
  "": [{ q: "6", why: "6thを足して明るく" }, { q: "add9", why: "9thで開けた明るさ" }],
  maj7: [{ q: "6", why: "6thで素直な明るさに" }],
  "7": [{ q: "", why: "緊張を解いて素直な長三和音へ" }],
  "6": [{ q: "add9", why: "9thで更に開けた響き" }],
  sus4: [{ q: "", why: "サスを長三度へ解決" }],
  sus2: [{ q: "add9", why: "2度の浮遊を9thの彩りに" }],
  aug: [{ q: "", why: "増の緊張を解いて素直な長三和音へ" }],
};

/** 単体コードの感情シフト候補（ルート＝度数は不変・品質のみ）。表記ゆれはエイリアス解決。無ければ空。 */
export function emotionShift(chord: Degree, dir: EmotionDir): ShiftResult[] {
  const q0 = canonicalQuality(chord.quality || "");
  const map = dir === "darker" ? DARKER : BRIGHTER;
  const hits = map[q0] ?? [];
  const deg = ((Math.trunc(chord.degree) % 12) + 12) % 12;
  return hits.filter((h) => h.q !== q0).map((h) => ({ degree: deg, quality: h.q, why: h.why }));
}
