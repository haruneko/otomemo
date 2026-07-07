// コード名文字列 → {root, quality}。U-FRET 等の人手譜面の表記を、当エンジンの quality 語彙へ正規化。
// 度数/機能の粒度で扱うのでテンション(add9/9/11/13)やオンコードのベースは落とし、基底(三和音/7th)へ寄せる。
import { normRoot } from "./theory";

export type ParsedChord = { root: number; quality: string };

/** 接尾辞 → 基底 quality（QUALITY_INTERVALS の語彙）。複雑なテンションは三和音/7thへ縮約。 */
function normalizeQuality(suffixRaw: string): string {
  const s = suffixRaw.trim();
  // 装飾を除去：オンコードのベース(/X)は呼び出し側で除去済み前提。add系/テンション数字を落とす前に種別判定。
  // ※ M7(大文字=メジャー7) と m7(小文字=マイナー7) は大文字小文字が命＝/i を使わない。
  const isMaj7 = /maj7/i.test(s) || /(^|[^A-Za-z])M7/.test(s) || /[△Δ]7?/.test(s);
  const isHalfDim = /(m7-5|m7b5|ø|Φ|φ)/i.test(s);
  const isDim = /(dim|°|o7|o)/.test(s) && !isHalfDim;
  const isAug = /(aug|\+)/.test(s);
  const isSus4 = /sus4|sus(?!2)/.test(s);
  const isSus2 = /sus2/.test(s);
  // minor 判定：先頭 m/min だが maj ではない（"maj" や "M" 大文字メジャーを誤判定しない）
  const isMinor = /^(m|min|-)/.test(s) && !/^maj/i.test(s) && !/^M(?![a-z])/.test(s);
  const hasDom7 = /(^|[^a-zA-Z])7/.test(s) || /7/.test(s);

  if (isHalfDim) return "m7b5";
  if (isDim) return "dim";
  if (isAug) return "aug";
  if (isSus2) return "sus2";
  if (isSus4) return "sus4";
  if (isMaj7) return "maj7";
  if (isMinor) return hasDom7 ? "m7" : /6/.test(s) ? "m6" : "m";
  if (hasDom7) return "7";
  if (/6/.test(s)) return "6";
  return ""; // major triad（add9/9/M 等の素直な明るい系もここへ縮約）
}

/** "A#m7" や "C/G"(オンコード) → {root, quality}。解釈不能は null。 */
export function parseChordSymbol(name: string): ParsedChord | null {
  if (!name) return null;
  // eslint-disable-next-line no-irregular-whitespace -- 全角スペース(U+3000)/BOM(U+FEFF)を除去する意図的な正規表現
  let s = String(name).trim().replace(/　/g, "").replace(/^[﻿\s]+/, "");
  if (!s) return null;
  // N.C.（無音）等は無視
  if (/^(N\.?C\.?|%|‐|-)$/i.test(s)) return null;
  // オンコード（分数）：ルート側だけ採る
  s = s.split("/")[0]!.trim();
  const m = s.match(/^([A-Ga-g])([#♯b♭]?)(.*)$/);
  if (!m) return null;
  const root = normRoot(m[1]!.toUpperCase() + (m[2] ?? ""));
  return { root, quality: normalizeQuality(m[3] ?? "") };
}
