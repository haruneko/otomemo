// フィール層（2026-07-11・研究 docs/research/2026-07-11-swing-feel-layer-audit.md／design.md「フィール層分離」）。
// スイング/微小タイミングは performative＝ストレート格子(SSOT)に**後からかける非破壊のタイムマップ**。
// notes は常にストレート格子。applyFeel をレンダ境界（web再生・MIDI書き出し・音声レンダ）で適用する純関数。
// 核＝**拍内の単調な区分線形タイムワープ**（start と end を両方写像）。単調ゆえ順序保存＝16分との衝突が原理的に
// 起きず（16分は自然に入れ子で跳ねる：s=1で {1/3, 5/6}）、逆写像が存在＝quantize/往復編集が可逆。

export type Feel = {
  swing?: number;            // 0..1（0=ストレート・1=3連2/3＝2:1）
  swingUnit?: "eighth" | "sixteenth"; // 跳ねの単位（既定 eighth＝拍内の8分ペア／sixteenth＝8分内の16分ペア）
  humanize?: number;         // 0..1（微小タイミング揺れ・velocity はデータ層＝ここでは扱わない）
  seed?: number;             // humanize の決定的シード
};
export type FeelCtx = {
  barLen?: number;           // 1小節の拍数（4/4=4）。ワープは拍(=1.0)基準なので現状未使用だが将来の整合用に受ける
  compound?: boolean;        // 6/8等＝跳ねは拍構造に内在＝スイング対象外（skip）
  tempo?: number;            // 将来のテンポ連動比（Stage5）用・現状未使用
};

type Note = { pitch: number; start: number; dur: number; vel?: number };

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// mulberry32（決定的PRNG・melodyCells の makeRng と同系）。humanize の相関乱歩用。
function makeRng(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 拍内タイムワープ W_s：窓 w（8分スイング=1拍／16分スイング=0.5拍）ごとに、局所 u∈[0,1) を
// 区分線形で写像。折れ点 u=0.5 → 0.5+s/6（s=1で 2/3）。両区間の傾きは (1±s/3)>0 ＝**単調**。
// 窓境界で連続（W(1)=1）＝タイムライン全体で連続かつ順序保存。
export function warpTime(t: number, s: number, w: number): number {
  if (s <= 0) return t;
  const k = Math.floor(t / w + 1e-9);
  const base = k * w;
  const u = (t - base) / w;
  const bp = 0.5 + s / 6;
  const Wu = u <= 0.5 ? u * (bp / 0.5) : bp + (u - 0.5) * ((1 - bp) / 0.5);
  return base + Wu * w;
}

// notes（ストレート格子）→ feel 適用後の notes（新配列・入力不変＝純関数）。
// feel 空/0＝恒等（bit一致）。①swing ワープ（start/end両写像・compoundはskip）→②humanize タイミング揺れ
// （ワープ後の時間上・確率揺れ・LRC相関・端音は不動）の順（系統的写像の上に確率揺れ＝理論通り）。
export function applyFeel(notes: Note[], feel: Feel | null | undefined, ctx: FeelCtx = {}): Note[] {
  const out: Note[] = notes.map((n) => ({ ...n }));
  if (!feel) return out;
  const sw = clamp01(feel.swing ?? 0);
  const hum = clamp01(feel.humanize ?? 0);

  // ① スイング（拍内単調ワープ・start と end を両方）。6/8等 compound は対象外。
  if (sw > 0 && !ctx.compound) {
    const w = feel.swingUnit === "sixteenth" ? 0.5 : 1.0;
    for (const n of out) {
      const s2 = warpTime(n.start, sw, w);
      const e2 = warpTime(n.start + n.dur, sw, w);
      n.start = r3(s2);
      n.dur = r3(Math.max(0, e2 - s2));
    }
    // 単調ゆえ順序不変＝ソート不要
  }

  // ② humanize タイミング（ワープ後の上に微小揺れ・端音不動・前音を越えない）。velocity は扱わない（データ層）。
  if (hum > 0 && out.length > 2) {
    const hr = makeRng((feel.seed ?? 1) + 29);
    const decay = 0.6;
    let te = 0;
    for (let i = 1; i < out.length - 1; i++) {
      te = decay * te + (1 - decay) * (hr() * 2 - 1);
      const ns = r3(out[i]!.start + hum * te * 0.03); // ±~0.03拍
      if (ns > out[i - 1]!.start + 0.02) out[i]!.start = ns; // 前音を越えない
    }
    out.sort((a, b) => a.start - b.start);
    for (let i = 0; i + 1 < out.length; i++) { const g = out[i + 1]!.start - out[i]!.start; if (g > 0) out[i]!.dur = Math.min(out[i]!.dur, r3(g)); }
  }

  return out;
}

// 逆写像 W_s⁻¹（quantize/往復編集用・単調全単射ゆえ存在）。swing のみ（humanize は非可逆な揺れ＝対象外）。
export function unwarpTime(t: number, s: number, w: number): number {
  if (s <= 0) return t;
  const k = Math.floor(t / w + 1e-9);
  const base = k * w;
  const y = (t - base) / w; // 写像後の局所位置 [0,1)
  const bp = 0.5 + s / 6;
  const u = y <= bp ? y * (0.5 / bp) : 0.5 + (y - bp) * (0.5 / (1 - bp));
  return base + u * w;
}
