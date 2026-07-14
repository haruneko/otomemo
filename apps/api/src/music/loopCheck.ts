// WP-X2 ゲームBGMループ境界チェック（純関数・指摘のみ・自動修正しない）。
// 正典＝docs/research/2026-07-14-intro-outro-game-loop.md §7.2 チェックリストの「機械判定できる分」。
// 思想＝機械は候補/指摘まで、継ぎ目の最終調整は人間の耳（骨格の机の接点と同じ）。
import { type Chord } from "./theory";
import { analyzeProgression, type Mode } from "./function";

export type LoopLayer = "harmony" | "melody" | "rhythm" | "tail" | "tech";
export type LoopSeverity = "ok" | "warn" | "info";
export interface LoopFinding {
  code: string;
  layer: LoopLayer;
  severity: LoopSeverity;
  message: string;
}
export interface LoopCheckInput {
  loop: { startBar: number; endBar: number; tailBars?: number };
  meter?: string | null;
  key?: number;
  mode?: Mode;
  chords?: Chord[]; // ループ本体の進行（時間順）。末尾＝ループ末尾の和音。
  melody?: { pitch: number; start?: number; dur?: number }[]; // 拍(beat・四分=1.0)・曲頭からの絶対位置
}
export interface LoopCheckResult {
  findings: LoopFinding[];
}

/** 拍子文字列 → 1小節の拍数（四分=1.0）。"6/8"→3.0, "4/4"→4.0。未指定/不正＝4。 */
function beatsPerBar(meter?: string | null): number {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec((meter ?? "4/4").trim());
  if (!m) return 4;
  return (Number(m[1]) * 4) / Number(m[2]);
}

/**
 * ループ境界の「継ぎ目が聞こえる」機械判定。所見(findings)を返すだけで一切修正しない。
 * - harmony: ループ長が整数小節か／末尾が完全終止(閉じている)か／末尾→頭が D→T 循環か
 * - melody:  末尾音→頭音の跳躍量／loopEnd 境界を跨ぐ持続ノート
 * - tail:    余韻(tailBars)の重ね指定の有無
 */
export function checkLoop(input: LoopCheckInput): LoopCheckResult {
  const findings: LoopFinding[] = [];
  const { startBar, endBar, tailBars } = input.loop;
  const bpb = beatsPerBar(input.meter);

  // --- harmony: ループ長は正の整数小節か（半端拍で終わらせない） ---
  const lenBars = endBar - startBar;
  if (!(lenBars > 0) || !Number.isInteger(lenBars)) {
    findings.push({
      code: "loop-length-integer",
      layer: "harmony",
      severity: "warn",
      message: `ループ長 ${lenBars} 小節＝半端。小節の整数倍で閉じる（拍頭で戻る）。`,
    });
  } else {
    findings.push({ code: "loop-length-integer", layer: "harmony", severity: "ok", message: `ループ長 ${lenBars} 小節＝整数。` });
  }

  // --- harmony: 境界の終止感（末尾で完全終止＝閉じていないか） ---
  const chords = input.chords ?? [];
  if (chords.length >= 2) {
    const ana = analyzeProgression(chords, { key: input.key, mode: input.mode });
    const cad = ana.cadence.type;
    if (cad === "authentic") {
      findings.push({
        code: "boundary-cadence",
        layer: "harmony",
        severity: "warn",
        message: `末尾が完全終止(PAC)＝閉じている。回り続けたいなら末尾を開く（V/借用で宙づり→頭トニックへ解決）。`,
      });
    } else {
      findings.push({ code: "boundary-cadence", layer: "harmony", severity: "ok", message: `末尾終止=${cad}＝開いた境界（回り続ける）。` });
    }
    // 末尾→頭の循環（V→I / D→T で噛み合うか）
    const degs = ana.degrees;
    const last = degs[degs.length - 1]!;
    const first = degs[0]!;
    if (last.function === "D" && first.function === "T") {
      findings.push({ code: "boundary-wrap", layer: "harmony", severity: "info", message: `末尾→頭＝${last.roman}→${first.roman}（D→T 循環）＝和声が噛み合う。` });
    }
  }

  // --- melody: 末尾音→頭音の音程 & 境界をまたぐ持続ノート ---
  const mel = (input.melody ?? []).map((n) => ({ pitch: n.pitch, start: n.start ?? 0, dur: n.dur ?? 0 })).sort((a, b) => a.start - b.start);
  if (mel.length >= 1) {
    const loopStartBeat = startBar * bpb;
    const loopEndBeat = endBar * bpb;
    const eps = 1e-6;
    const inLoop = mel.filter((n) => n.start >= loopStartBeat - eps && n.start < loopEndBeat - eps);
    if (inLoop.length >= 1) {
      const firstN = inLoop[0]!; // ループ頭の音（次周回の入り）
      const lastN = inLoop[inLoop.length - 1]!; // ループ末尾の音
      const interval = Math.abs(lastN.pitch - firstN.pitch); // 末尾音→頭音（ラップ）
      if (interval > 7) {
        findings.push({
          code: "boundary-melody-interval",
          layer: "melody",
          severity: "warn",
          message: `末尾音→頭音＝${interval}半音の跳躍＝継ぎ目が立つ。近接(≤完全5度)か導音→主音へ。`,
        });
      } else {
        findings.push({ code: "boundary-melody-interval", layer: "melody", severity: "ok", message: `末尾音→頭音＝${interval}半音＝近接。` });
      }
    }
    const crossing = mel.filter((n) => n.start < loopEndBeat - eps && n.start + n.dur > loopEndBeat + eps);
    if (crossing.length) {
      findings.push({
        code: "crossing-note",
        layer: "melody",
        severity: "warn",
        message: `${crossing.length}個のノートが loopEnd(${endBar}小節)を跨ぐ。頭で鳴らし直す/末尾でリリースへ正規化を。`,
      });
    } else {
      findings.push({ code: "crossing-note", layer: "melody", severity: "ok", message: `境界をまたぐ持続ノート無し。` });
    }
  }

  // --- tail: 余韻の重ね（テール処理）指定の有無 ---
  if (tailBars == null || tailBars <= 0) {
    findings.push({
      code: "tail-unset",
      layer: "tail",
      severity: "info",
      message: `テール(余韻の重ね)未設定。リバーブ/ディレイ尾が境界で切れるなら tailBars を設定し頭へ重ねる。`,
    });
  }

  return { findings };
}
