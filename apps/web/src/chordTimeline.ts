// コード進行タイムラインの純粋ドメイン（design #26）。ChordEditor から reflow を外出しし、
// 挿入/削除/長さスナップ/折り返し行割りを「レイアウト非依存の契約」として一箇所に集約する（TDD先行・SSOT）。
// すべての変更は reflow を通す＝start は dur の連なりから自動再計算（手入力/ズレを排除）。
import type { ChordEntry } from "./music";

// start を dur の累積から再計算（順番＝進行）。全ミューテーションの出口。
export function reflow(chords: ChordEntry[]): ChordEntry[] {
  let t = 0;
  return chords.map((c) => {
    const out = { ...c, start: t };
    t += c.dur;
    return out;
  });
}

// 境界 index(0..len) にコードを挿入。直前コード chords[index-1] の複製（root/quality/bass/dur）を入れる。
// index===0 or 空のときは素のメジャー1小節（bpb 拍）。挿入後 reflow で以降を右送り。
export function insertAt(chords: ChordEntry[], index: number, bpb = 4): ChordEntry[] {
  const i = Math.max(0, Math.min(index, chords.length));
  const prev = i > 0 ? chords[i - 1] : undefined;
  const nu: ChordEntry = prev
    ? { root: prev.root, quality: prev.quality, start: 0, dur: prev.dur, ...(prev.bass != null ? { bass: prev.bass } : {}) }
    : { root: 0, quality: "", start: 0, dur: bpb };
  return reflow([...chords.slice(0, i), nu, ...chords.slice(i)]);
}

// index を削除して reflow（総拍は −dur）。
export function removeAt(chords: ChordEntry[], index: number): ChordEntry[] {
  return reflow(chords.filter((_, k) => k !== index));
}

// 端ドラッグの長さを {1拍, 2拍, 1小節=bpb, 2小節=2·bpb} とその付点(×1.5) の最近傍へスナップ。
export function snapLength(dur: number, bpb: number): number {
  const bases = [1, 2, bpb, 2 * bpb];
  const allowed = Array.from(new Set(bases.flatMap((b) => [b, b * 1.5]))).sort((a, b) => a - b);
  let best = allowed[0];
  let bestD = Math.abs(dur - best);
  for (const a of allowed) {
    const d = Math.abs(dur - a);
    if (d < bestD) { best = a; bestD = d; } // 同距離は小さい方（<）＝先勝ちで安定
  }
  return best;
}

// 段内の1ブロック（＝1コードの1行分）。startBeat/widthBeat は「その段の先頭」からの相対拍。
// head=そのコードの実開始を含む段（ラベルはここだけに出す）。tail=前段からの続き（タイの見た目・ラベルなし）。
export interface Seg {
  index: number; // chords 上のコード番号
  startBeat: number; // 段先頭からの相対拍
  widthBeat: number;
  head: boolean; // このコードの開始を含む＝ラベル/左角丸を出す
  tail: boolean; // 前段からの続き（段跨ぎの後半）
}
export interface Row {
  bars: number; // この段の小節数（ルーラのメモリ数。最終段だけ barsPerRow 未満になり得る）
  segments: Seg[];
}

// 総拍を barsPerRow 小節/段で段配列へ分割。段境界をまたぐコードは
// 「前段末で切れる head セグメント」＋「次段頭(0)から続く tail セグメント」に割る（リードシート式）。
// 段内で小節境界だけをまたぐコードは1本の連続セグメント（小節線はルーラの目盛りにすぎない）。
export function wrapRows(chords: ChordEntry[], bpb: number, barsPerRow: number): Row[] {
  const rowBeats = barsPerRow * bpb;
  if (!chords.length || rowBeats <= 0) return [];
  const end = Math.max(...chords.map((c) => c.start + c.dur));
  const rowCount = Math.max(1, Math.ceil(end / rowBeats));
  const rows: Row[] = [];
  for (let r = 0; r < rowCount; r++) {
    const rowStart = r * rowBeats;
    const rowEnd = rowStart + rowBeats;
    const segments: Seg[] = [];
    chords.forEach((c, index) => {
      const cStart = c.start;
      const cEnd = c.start + c.dur;
      const segStart = Math.max(cStart, rowStart);
      const segEnd = Math.min(cEnd, rowEnd);
      if (segEnd <= segStart) return; // この段には掛からない
      segments.push({
        index,
        startBeat: segStart - rowStart,
        widthBeat: segEnd - segStart,
        head: segStart === cStart, // 実開始を含む段＝ラベルを出す
        tail: segStart > cStart, // 前段からの続き
      });
    });
    // この段が実際に使う小節数（最終段は barsPerRow 未満になり得る＝ルーラを早く止める）。
    const usedBars = Math.min(barsPerRow, Math.max(1, Math.ceil((end - rowStart) / bpb)));
    rows.push({ bars: usedBars, segments });
  }
  return rows;
}

// root ピッチクラス(C基準=0)→ 度数色。左3pxの度数バーに使う（機械的ハブ hue=度数×30°）。
// I=root0(赤)・II=root2(黄)・♭VII=root10(青紫)…＝機能分析の曖昧さに依存しない色分け。
export function degreeColor(root: number): string {
  const pc = (((Math.round(root) % 12) + 12) % 12);
  const hue = (pc * 30) % 360;
  return `hsl(${hue} 70% 55%)`;
}
