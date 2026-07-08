// コード名文字列 → {root, quality}。U-FRET 等の人手譜面の表記を、当エンジンの quality 語彙へ正規化。
// 度数/機能の粒度で扱うのでテンション(add9/9/11/13)やオンコードのベースは落とし、基底(三和音/7th)へ寄せる。
import { normRoot } from "./theory";

export type ParsedChord = { root: number; quality: string; bass?: number };

/** 接尾辞 → 基底 quality（QUALITY_INTERVALS の語彙）。複雑なテンションは三和音/7thへ縮約。 */
function normalizeQuality(suffixRaw: string): string {
  const s = suffixRaw.trim();
  // 装飾を除去：オンコードのベース(/X, onX)は呼び出し側で除去済み前提。add系/テンション数字を落とす前に種別判定。
  // ※ M7(大文字=メジャー7) と m7(小文字=マイナー7) は大文字小文字が命＝minor 判定は case-sensitive。
  // H1(2026-07-08)：mM7/mmaj7/m(maj7)＝マイナーメジャー7th を先に判定（旧: /maj7/i が勝ちメジャー化）。
  const isMinorHead = /^(m(?!aj)|min|-)/.test(s) && !/^M(?![a-z])/.test(s);
  const isMinMaj7 = isMinorHead && /(maj7|M7|[△Δ]7)/i.test(s.slice(1));
  const isMaj7 = !isMinMaj7 && (/maj7/i.test(s) || /(^|[^A-Za-z])M7/.test(s) || /[△Δ]7?/.test(s));
  const isHalfDim = /(m7-5|m7b5|ø|Φ|φ)/i.test(s);
  // H2/H3(2026-07-08)：dim7/°7/o7＝フルディミッシュを保持（旧: dimへ縮約で減7音消失）。
  // "o" は単独語のみ dim（旧: 任意の o に誤爆）。"+" は aug 文脈（+5/単独/aug）のみ（旧: 7+5 が aug 化け）。
  const isDim7 = /(dim7|°7|o7)/.test(s) && !isHalfDim;
  const isDim = !isDim7 && ((/(dim|°)/.test(s) && !isHalfDim) || /^o$/.test(s));
  const isAug7 = /(aug7|7\+5|7#5)/.test(s);
  const isAug = !isAug7 && (/aug/.test(s) || /^\+$/.test(s) || /(\+5|#5)/.test(s));
  const isSus4 = /sus4|sus(?!2)/.test(s);
  const isSus2 = /sus2/.test(s);
  const isMinor = isMinorHead && !/^maj/i.test(s);
  const hasDom7 = /(^|[^a-zA-Z])7/.test(s) || /7/.test(s);

  if (isHalfDim) return "m7b5";
  if (isMinMaj7) return "mM7";
  if (isDim7) return "dim7";
  if (isDim) return "dim";
  if (isAug7) return "aug7";
  if (isAug) return "aug";
  if (isSus2) return "sus2";
  if (isSus4) return "sus4";
  if (isMaj7) return "maj7";
  if (isMinor) return hasDom7 ? "m7" : /6/.test(s) ? "m6" : "m";
  if (hasDom7) return "7";
  if (/6/.test(s)) return "6";
  return ""; // major triad（add9/9/M 等の素直な明るい系もここへ縮約）
}

/** "A#m7" や "C/G"(オンコード) → {root, quality, bass?}。解釈不能は null。
 * M7(2026-07-08)：分数コードのベースを捨てず bass(pc) に保持（"C/E"・"ConE" 両表記）。 */
export function parseChordSymbol(name: string): ParsedChord | null {
  if (!name) return null;
  // eslint-disable-next-line no-irregular-whitespace -- 全角スペース(U+3000)/BOM(U+FEFF)を除去する意図的な正規表現
  let s = String(name).trim().replace(/　/g, "").replace(/^[﻿\s]+/, "");
  if (!s) return null;
  // N.C.（無音）等は無視
  if (/^(N\.?C\.?|%|‐|-)$/i.test(s)) return null;
  // オンコード（分数）：/X と onX（例 ConE）＝ベースを bass に保持してルート側を解析。
  let bass: number | undefined;
  const slash = s.split("/");
  if (slash.length > 1 && /^[A-Ga-g][#♯b♭]?$/.test(slash[1]!.trim())) {
    bass = normRoot(slash[1]!.trim().toUpperCase());
    s = slash[0]!.trim();
  } else {
    const on = s.match(/^(.+?)on([A-G][#♯b♭]?)$/);
    if (on) {
      bass = normRoot(on[2]!);
      s = on[1]!.trim();
    } else {
      s = slash[0]!.trim(); // "/以降が音名でない" 場合は従来どおり切り捨て
    }
  }
  const m = s.match(/^([A-Ga-g])([#♯b♭]?)(.*)$/);
  if (!m) return null;
  const root = normRoot(m[1]!.toUpperCase() + (m[2] ?? ""));
  const out: ParsedChord = { root, quality: normalizeQuality(m[3] ?? "") };
  if (bass !== undefined) out.bass = bass;
  return out;
}
