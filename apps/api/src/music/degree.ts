// メロ生成の「度数内部モデル」（design #12-M）。保存は絶対ピッチのまま＝ここは genMelody の内部で
// 「度数(+oct+alter)＋コード文脈→文法で組む→degreeToPitch で絶対ピッチへ描画」するための純関数。
// #86：音符はルール（決定的）が作る。調非依存（度数）＝要件「調に依存せず流用・比較・差し替え」。
import { chordPcs, MAJOR_SCALE, MINOR_SCALE } from "./theory";

// コードは root 任意（chordAt 由来の緩い形も受ける）。root 既定=0。
export type ChordLike = { root?: number | string; quality?: string };

export type Mode = "major" | "minor";
// degree=1..7（音階度数）、alter=半音変化（0=音階音／+1=半音上＝下位音階音からの#）、octave=相対オクターブ。
export interface Deg {
  degree: number;
  alter: number;
  octave: number;
}

const scaleOf = (mode: Mode): number[] => (mode === "minor" ? MINOR_SCALE : MAJOR_SCALE);

// 絶対ピッチ → 度数（key/mode 相対）。音階外は「下位の音階音＋alter(+1)」で表す（半音接近の表現に必須）。
export function pitchToDegree(pitch: number, key = 0, mode: Mode = "major"): Deg {
  const scale = scaleOf(mode);
  const rel = pitch - key;
  const octave = Math.floor(rel / 12);
  const pc = rel - octave * 12; // 0..11（tonic基準）
  // 音階音ならそのまま。違えば直下の音階音＋alter。
  let degree = 1;
  let alter = 0;
  for (let i = scale.length - 1; i >= 0; i--) {
    if (pc >= scale[i]!) {
      degree = i + 1;
      alter = pc - scale[i]!;
      break;
    }
  }
  return { degree, alter, octave };
}

// 度数 → 絶対ピッチ（pitchToDegree の逆）。
export function degreeToPitch(d: Deg, key = 0, mode: Mode = "major"): number {
  const scale = scaleOf(mode);
  const idx = ((d.degree - 1) % scale.length + scale.length) % scale.length;
  return key + d.octave * 12 + scale[idx]! + d.alter;
}

// その音がコードトーンか（pitch%12 ∈ chordPcs）。既存 chordPcs を使う＝コード既知前提。
export function isChordTone(pitch: number, chord: ChordLike): boolean {
  const pc = ((pitch % 12) + 12) % 12;
  return chordPcs(chord.root ?? 0, chord.quality ?? "").includes(pc);
}

export type NctKind = "chord" | "passing" | "neighbor" | "appoggiatura" | "suspension" | "escape" | "other";

// 非和声音の分類（単旋律＝ポップス的処理。多声対位法は対象外＝要件line160）。prev/next は隣接ピッチ(無ければnull)。
// 「滑り込み」文法の判定＋連想エッセンスE5の材料を兼ねる。歩進=|半音|≤2、跳躍=≥3。
export function classifyNCT(prev: number | null, cur: number, next: number | null, chord: ChordLike): NctKind {
  if (isChordTone(cur, chord)) return "chord";
  const din = prev == null ? null : cur - prev; // 入りの音程
  const dout = next == null ? null : next - cur; // 抜けの音程
  const stepIn = din != null && din !== 0 && Math.abs(din) <= 2;
  const stepOut = dout != null && dout !== 0 && Math.abs(dout) <= 2;
  const leapIn = din != null && Math.abs(din) >= 3;
  const leapOut = dout != null && Math.abs(dout) >= 3;
  const held = din === 0; // 同音保留＝掛留の準備

  if (held && stepOut) return "suspension"; // 保留→歩進解決（強拍不協の正攻法）
  if (prev == null && stepOut) return "appoggiatura"; // 句頭の倚音的入り→歩進解決
  if (stepIn && stepOut) return Math.sign(din!) === Math.sign(dout!) ? "passing" : "neighbor";
  if (leapIn && stepOut) return "appoggiatura"; // 跳躍で入り歩進解決＝倚音（もたれ）
  if (stepIn && leapOut) return "escape"; // 歩進で入り跳躍で抜ける＝逸音
  return "other"; // 孤立（跳躍入り跳躍抜け・未解決）＝生成では禁止対象
}

// 非和声音が「解決を伴う合法な滑り込み」か（other＝孤立を弾く）。生成時の保証に使う。
export function isResolvedNct(kind: NctKind): boolean {
  return kind !== "other";
}
