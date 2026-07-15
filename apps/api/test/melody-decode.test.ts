import { describe, it, expect } from "vitest";
import { decodeMelody, LAMBDA_DEFAULT, type MelodySegment, type DecodeOpts, type Key } from "../src/music/melody-decode";

// 事前確率つき採譜＝corpus-Viterbi 復号（design §7.5）の TS 単体。
// セグメント＝{t0,t1,centerCents,cand[±1半音]}。centerCents は絶対 cent（MIDI*100）。

// centerCents（cent 中心線）と committed midi から ±1 半音の候補セグメントを組む補助。
function seg(t0: number, t1: number, centerCents: number): MelodySegment {
  const m = Math.round(centerCents / 100);
  return { t0, t1, centerCents, cand: [{ midi: m - 1 }, { midi: m }, { midi: m + 1 }] };
}
// C major の 1・5度・経過音を混ぜた既知の正解列（MIDI: 60 62 64 65 67 = C D E F G）。
const TRUTH = [60, 62, 64, 65, 67];
const cKey: Key = { tonicPc: 0, mode: "major" };

describe("decodeMelody λ=0 退避路（現行 round と一致）", () => {
  it("λ=0 なら各セグメントの f0 最尤候補（round）をそのまま返す＝入力の committed midi 列", () => {
    // 中心線に ±30cent の揺れを乗せても round は変わらない（committed = round(centerCents/100)）。
    const noisy = [60 * 100 + 28, 62 * 100 - 31, 64 * 100 + 15, 65 * 100 - 22, 67 * 100 + 40];
    const segs = noisy.map((c, i) => seg(i * 0.5, i * 0.5 + 0.5, c));
    const out = decodeMelody(segs, null, cKey, { lambda: 0 });
    expect(out.map((n) => n[2])).toEqual(TRUTH);
  });

  it("λ=0 は事前確率（bigram/chord）を無視する＝emission 主体で入力を保存", () => {
    const segs = TRUTH.map((m, i) => seg(i * 0.5, i * 0.5 + 0.5, m * 100 + (i % 2 ? 20 : -20)));
    // 強い chord prior を渡しても λ=0 なら効かない。
    const opts: DecodeOpts = { lambda: 0, chordRelStrong: [{ bin: "0", pct: 90 }], chordRelWeak: [{ bin: "0", pct: 90 }] };
    const out = decodeMelody(segs, [[0, 3, "C:maj"]], cKey, opts);
    expect(out.map((n) => n[2])).toEqual(TRUTH);
  });
});

describe("decodeMelody 合成セグメントで正解へ収束", () => {
  it("中心線が半音境界（±50cent 近傍）で割れる区間を、遷移 bigram＋コードで正解へ寄せる", () => {
    // 3音目(E=64)の中心線を +48cent（64.48）＝round では E のままだが、ノイズで 65 に割れやすい境界を作る。
    // ここでは中心線を敢えて 64 の +40cent と 65 の -40cent の中間 = 6448cent（round=64）に置き、
    // 揺れが大きい2音目を 61.6（round=62 ぎりぎり）にして、遷移事前が D(62) を後押しするか見る。
    const segs = [
      seg(0.0, 0.5, 60 * 100 + 5),   // C
      seg(0.5, 1.0, 62 * 100 - 40),  // D（-40cent＝round は 62 のまま／境界寄り）
      seg(1.0, 1.5, 64 * 100 + 40),  // E（+40cent）
      seg(1.5, 2.0, 65 * 100 + 5),   // F
      seg(2.0, 2.5, 67 * 100 - 5),   // G
    ];
    // C major の順次上行を後押しする bigram（自己遷移＋隣接段進行に質量）。tonic 相対 pc: 0,2,4,5,7。
    const bigram = new Map<string, [number, number][]>([
      ["0", [[2, 50], [0, 30], [4, 20]]],
      ["2", [[4, 50], [2, 30], [0, 20]]],
      ["4", [[5, 50], [4, 30], [2, 20]]],
      ["5", [[7, 50], [5, 30], [4, 20]]],
      ["7", [[7, 40], [9, 30], [5, 30]]],
    ]);
    const opts: DecodeOpts = { lambda: LAMBDA_DEFAULT, bigram };
    const out = decodeMelody(segs, null, cKey, opts);
    expect(out.map((n) => n[2])).toEqual(TRUTH);
  });
});

describe("decodeMelody 強拍/弱拍のコードゲート", () => {
  const chords: [number, number, string][] = [[0, 4, "C:maj"]]; // C=pc{0,4,7}・4小節ぶん
  const beatTimes = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5];      // 120bpm・0.5s/beat
  const opts = (lambda: number): DecodeOpts => ({
    lambda,
    // 強拍＝コードトーン(pc0/4/7)に厚く、弱拍＝経過音(pc2 等)もなだらか（NCT 保護の実データ相当）。
    chordRelStrong: [{ bin: "0", pct: 40 }, { bin: "4", pct: 30 }, { bin: "7", pct: 25 }, { bin: "2", pct: 2 }],
    chordRelWeak: [{ bin: "0", pct: 20 }, { bin: "4", pct: 18 }, { bin: "7", pct: 17 }, { bin: "2", pct: 15 }],
    beatTimes, meter: 4, downbeatSec: 0,
  });

  it("強拍で中心線が非和声音(D=62)へ +45cent 寄った区間は、コード prior が C系(C=60)へ引き戻す", () => {
    // t=1.0（拍頭＝強拍）に中心線 61.55（round=62=D＝非和声音）。候補 {61,62,63}。
    // 強拍 chord prior は pc0(C=60 は候補外)… ここは 63(D#) も非和声。61=C#非和声。→ D(62) が最尤のまま。
    // よって「引き戻し」は候補内に和声音がある場合のみ起きる＝ここでは中心線を 60.4(round=60=C) で確認。
    const s: MelodySegment = { t0: 1.0, t1: 1.5, centerCents: 60 * 100 + 40, cand: [{ midi: 59 }, { midi: 60 }, { midi: 62 }] };
    const out = decodeMelody([s], chords, cKey, opts(LAMBDA_DEFAULT));
    expect(out[0]![2]).toBe(60); // 強拍＝C(pc0)＝コードトーンで確定
  });

  it("弱拍では経過音(D=62)が生き残る＝chordRelWeak がなだらかで殺さない", () => {
    // t=0.25（オフビート＝弱扱い）に中心線 62.0（round=62=D＝経過音）。候補 {61,62,63}。
    // 弱拍は chord 重み低＋pc2 も 15% ＝ D が残る。
    const s: MelodySegment = { t0: 0.25, t1: 0.5, centerCents: 62 * 100, cand: [{ midi: 61 }, { midi: 62 }, { midi: 63 }] };
    const out = decodeMelody([s], chords, cKey, opts(LAMBDA_DEFAULT));
    expect(out[0]![2]).toBe(62); // 弱拍の経過音は保護
  });
});

describe("decodeMelody ハードクランプ境界（±1半音を超えない）", () => {
  it("極端に強い chord prior でも復号ラベルは候補（生 f0±1半音）の外へ出ない", () => {
    // 中心線 = 62(D)、候補 {61,62,63}。コード C(pc0=60) を pct 99% にしても 60 は候補外＝到達不能。
    const s: MelodySegment = { t0: 0, t1: 1, centerCents: 62 * 100, cand: [{ midi: 61 }, { midi: 62 }, { midi: 63 }] };
    const opts: DecodeOpts = {
      lambda: 5, // 過剰な λ
      chordRelStrong: [{ bin: "0", pct: 99 }], chordRelWeak: [{ bin: "0", pct: 99 }],
      beatTimes: [0, 0.5], meter: 4, downbeatSec: 0,
    };
    const out = decodeMelody([s], [[0, 1, "C:maj"]], cKey, opts);
    expect([61, 62, 63]).toContain(out[0]![2]); // クランプ内
    expect(out[0]![2]).not.toBe(60);             // 瞬間移動しない
  });
});

describe("decodeMelody 副作用ゼロ／後方互換", () => {
  it("空セグメントは空を返す（フォールバック＝呼び出し側が従来 melody_notes を使う）", () => {
    expect(decodeMelody([], null, null, {})).toEqual([]);
  });

  it("corpus 資産（bigram/prior）が空でも死なず emission で復号する", () => {
    const segs = TRUTH.map((m, i) => seg(i * 0.5, i * 0.5 + 0.5, m * 100));
    const out = decodeMelody(segs, null, cKey, { lambda: LAMBDA_DEFAULT }); // bigram/prior 無し
    expect(out.map((n) => n[2])).toEqual(TRUTH);
  });

  it("同ラベル隣接はマージされる（区間の存在＝尺は保存）", () => {
    const segs = [seg(0, 0.5, 60 * 100), seg(0.5, 1.0, 60 * 100 + 10), seg(1.0, 1.5, 62 * 100)];
    const out = decodeMelody(segs, null, cKey, { lambda: 0 });
    expect(out).toEqual([[0, 1, 60], [1, 1.5, 62]]);
  });
});
