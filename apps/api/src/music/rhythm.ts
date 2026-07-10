// リズム/密度の成形（mood→密度バイアス→リズム図形の選択）。generate.ts から分離（#5）。
// 「mood をどう刻みの密度に翻訳するか」の知識をここに集約＝生成本体は構造に集中できる。
import { Rng } from "./rng";

const MINOR_HINT = ["切な", "悲", "暗", "哀", "泣", "sad", "dark", "melanchol", "minor", "マイナー"];
export const isMinorMood = (mood: string): boolean =>
  MINOR_HINT.some((h) => mood.toLowerCase().includes(h) || mood.includes(h));

// リズム図形（1拍=四分を基準に、拍内オフセット[off,dur](拍単位)で刻む）。span=消費する拍数。
// busy=細かい(明るい/速い向き)、long=長音(切ない/遅い向き)、空onは休符。四分縛りを解くための核。
export interface RhyFig {
  on: [number, number][];
  span: number;
  w: number;
  busy?: boolean;
  long?: boolean;
  rest?: boolean;
}

export const MELODY_FIGS: RhyFig[] = [
  { on: [[0, 1]], span: 1, w: 2.5 }, // ♩
  { on: [[0, 0.5], [0.5, 0.5]], span: 1, w: 2.5, busy: true }, // ♪♪
  { on: [[0, 0.5], [0.5, 0.25], [0.75, 0.25]], span: 1, w: 1, busy: true }, // ♪♬
  { on: [[0, 0.25], [0.25, 0.25], [0.5, 0.5]], span: 1, w: 0.8, busy: true }, // ♬♪
  { on: [[0, 0.75], [0.75, 0.25]], span: 1, w: 1.2 }, // ♪.+16 付点
  { on: [[0.5, 0.5]], span: 1, w: 0.9 }, // 休符→♪（シンコペ）
  { on: [[0, 2]], span: 2, w: 1.3, long: true }, // 二分（長音）
  { on: [], span: 1, w: 0.8, rest: true }, // 休符
];

// 6/8 など複合拍子ネイティブのリズム図形（1ビート＝付点四分=1.5四分）。6/8の「長短」のうねりを出す。
export const COMPOUND_FIGS: RhyFig[] = [
  { on: [[0, 1.5]], span: 1.5, w: 2.2, long: true }, // ♩.（1ビート丸ごと）
  { on: [[0, 1], [1, 0.5]], span: 1.5, w: 2.6 }, // ♩♪（長短＝6/8基本ノリ）
  { on: [[0, 0.5], [0.5, 1]], span: 1.5, w: 1.1, busy: true }, // ♪♩（短長）
  { on: [[0, 0.5], [0.5, 0.5], [1, 0.5]], span: 1.5, w: 1.5, busy: true }, // ♪♪♪（3連八分）
  { on: [[0, 1]], span: 1.5, w: 0.9 }, // ♩＋八分休符（間）
  { on: [], span: 1.5, w: 0.7, rest: true }, // 休符（1ビート）
];

// ベースの図形（メロより落ち着き：四分主体＋たまに8分のルート→5度/オクターブ、長音）。
export const BASS_FIGS: RhyFig[] = [
  { on: [[0, 1]], span: 1, w: 3 }, // ♩
  { on: [[0, 2]], span: 2, w: 1.5, long: true }, // 二分（支え）
  { on: [[0, 0.5], [0.5, 0.5]], span: 1, w: 1.2, busy: true }, // ♪♪（ルート→5度等）
  { on: [[0, 0.75], [0.75, 0.25]], span: 1, w: 0.7 }, // 付点（軽い跳ね）
];
// 6/8 等の複合拍子ネイティブのベース図形（1ビート＝付点四分=1.5四分・各ビート頭にルート）。
export const COMPOUND_BASS_FIGS: RhyFig[] = [
  { on: [[0, 1.5]], span: 1.5, w: 3, long: true }, // ♩.（1ビート支え＝6/8の基本）
  { on: [[0, 1], [1, 0.5]], span: 1.5, w: 1.4 }, // ♩♪（ルート→5度）
  { on: [[0, 0.5], [0.5, 0.5], [1, 0.5]], span: 1.5, w: 0.8, busy: true }, // 八分3つ（歩き）
];

// mood/tempo から「密度バイアス」。切ない/遅い=長音・休符寄り、元気=細分寄り。
// テンポは"ノリ"でなく"1拍の実時間"を決める＝高BPMほど16分が速すぎて潰れる。旧仕様は tempo≥130 で busy=2.0 と
// **逆向き**(速い曲ほど細かく)だった(オーナーFB 2026-07-10・170bpmで16分だらけ)。テンポは mood と分離し、
// 高BPMは"長音寄り"へ倒して可読性を守る（細分は元気moodが担当）。しきい値=速い曲の16分の速さで決める。
export function densityBias(mood: string, tempo?: number): { busy: number; long: number; rest: number } {
  const m = mood.toLowerCase();
  const t = tempo ?? 0;
  const slow = isMinorMood(mood) || /バラード|ballad|遅|slow|静|アンビ|ambient/.test(m);
  const energetic = /明る|元気|アップ|upbeat|fast|速|ダンス|dance|ポップ|pop/.test(m);
  if (t >= 150) return { busy: 0.5, long: 1.6, rest: 0.8 }; // 高BPM＝1拍が短い＝16分は速すぎ＝長音寄り(旧: busy2.0の逆向きを是正)
  if (energetic) return { busy: 2.0, long: 0.4, rest: 0.6 }; // 元気mood＝細分寄り(テンポでなく性格で)
  if (slow) return { busy: 0.5, long: 1.8, rest: 1.4 };
  return { busy: 1, long: 1, rest: 1 };
}

export function pickFig(
  rng: Rng,
  figs: RhyFig[],
  bias: { busy: number; long: number; rest: number },
  remain: number,
  forceOnset: boolean,
): RhyFig {
  const cands = figs.filter(
    (c) => c.span <= remain + 1e-9 && !(forceOnset && (c.rest || c.on.length === 0 || c.on[0]![0] !== 0)),
  );
  const pool = cands.length ? cands : [figs[0]!];
  const weights = pool.map((c) => c.w * (c.busy ? bias.busy : 1) * (c.long ? bias.long : 1) * (c.rest ? bias.rest : 1));
  return rng.choices(pool, weights);
}
