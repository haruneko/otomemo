// 歌詞先行メロ生成 M-1（design #13d・WP-L0）＝歌詞テキスト→ V2 の既存注入口（phrases＋rhythmParts）への計画。
// 正典＝docs/research/2026-07-15-lyrics-first-melody-{verdict,A}.md。純関数（pyopenjtalk spawn は呼び側 async＝
// ここへは抽出済みデータ or かなテキストだけ渡す）。音数厳密一致は buildPartVariant（rhythmParts.custom+placement）が担う。
// 思想：機械は候補まで・既定 bit一致（未注入＝従来）。アクセントは hard にしない＝ここでは音数/句割りのみ（採点は呼び側）。
import { analyzeMoras } from "@cm/music-core";
import { type RhythmPartsOpt } from "./rhythmParts";

// 各行の計画サマリ（診断/UI 表示用）。
export interface LyricLinePlan {
  line: number; // 何行目（0始まり・統合時はグループ番号）
  text: string; // その行/グループの原文
  moraCount: number; // 総モーラ数（特殊拍込み）
  onsetCount: number; // 実音になるモーラ数（=このグループの音符数）
  bar0: number; // 開始小節（0始まり）
  bars: number; // 割り当て小節数
}

export interface LyricMelodyPlan {
  phrases: { startBeat: number; beats: number; cadenceDegree: number }[]; // V2 既存契約（varLen＋句末カデンツ）
  rhythmParts: RhythmPartsOpt; // V2 既存契約（custom＝インラインパーツ／placement＝全小節に敷く＝音数厳密一致）
  syllables: string[]; // オンセットかな列（全行連結・flowLyric と analyzeLyricFit 用・length=総音符数）
  lineHeadNoteIdx: number[]; // 各行の先頭オンセットの note index（句頭 A-01 判定用）
  lines: LyricLinePlan[];
  warnings: string[];
  onsetTotal: number; // = syllables.length（音数一致 property の基準）
}

// モーラ role：実音（onset）になるのは normal / 撥音ん。長音ー＝tie（直前へ延長・新アタック無）／促音っ＝rest（詰め）。
// ＝suggestLyricRhythm(prosody.ts) の roleOf と同規約。tie/rest はグリッド上の音符を立てない＝音数から外れる（A-doc §3.1）。
function isOnsetMora(kind: string): boolean {
  return kind === "normal" || kind === "hatsuon";
}

// largest-remainder で weights 比に応じて total を配分（各要素 min 以上・合計＝total）。L<=total 前提（呼び側で保証）。
function allocBars(weights: number[], total: number, min = 1): number[] {
  const L = weights.length;
  const alloc = weights.map(() => min);
  let rem = total - L * min;
  if (rem <= 0) return alloc; // total==L（各1）で確定
  const sum = weights.reduce((a, b) => a + b, 0) || L;
  const ideal = weights.map((w) => (w / sum) * rem);
  const floors = ideal.map((v) => Math.floor(v));
  for (let i = 0; i < L; i++) alloc[i]! += floors[i]!;
  let left = rem - floors.reduce((a, b) => a + b, 0);
  const order = ideal.map((v, i) => [v - Math.floor(v), i] as [number, number]).sort((a, b) => b[0] - a[0]);
  for (let i = 0; i < left && i < order.length; i++) alloc[order[i]![1]]! += 1;
  return alloc;
}

// count 個のオンセットを bars 小節（各16枠・usable=barLen*4枠）へ「収まる最粗グリッド」で先頭から敷く。
// quarter(step4)→eighth(step2)→sixteenth(step1) の順に容量が足りる最初を選ぶ＝字余りほど細分（R-07）。
// 返り＝小節ごとの16文字パターン（'x'=onset/'.'=無）。count が容量超なら sixteenth で埋め切り overflow を返す。
function layoutOnsets(count: number, bars: number, barLen: number): { patterns: string[]; overflow: number } {
  const usable = Math.min(16, Math.max(1, Math.round(barLen * 4)));
  const steps = [4, 2, 1]; // quarter / eighth / sixteenth
  let step = 1;
  for (const st of steps) {
    const posPerBar = Math.floor((usable + st - 1) / st); // 0,st,2st,... 内 usable 未満の個数
    if (posPerBar * bars >= count) { step = st; break; }
    step = 1; // どれも足りなければ最細
  }
  const posPerBar: number[] = [];
  for (let s = 0; s < usable; s += step) posPerBar.push(s);
  const capacity = posPerBar.length * bars;
  const place = Math.min(count, capacity);
  const overflow = count - place;
  const grids = Array.from({ length: bars }, () => new Array<string>(16).fill("."));
  // bar-major に先頭から敷く（bar0 を埋めてから bar1…＝小節単位でまとまる＝反復が回復しやすい）。
  let placed = 0;
  for (let b = 0; b < bars && placed < place; b++) {
    for (const s of posPerBar) {
      if (placed >= place) break;
      grids[b]![s] = "x";
      placed++;
    }
  }
  return { patterns: grids.map((g) => g.join("")), overflow };
}

/**
 * 歌詞（改行＝行/句）→ V2 注入計画（phrases＋rhythmParts＋syllables）。純関数・決定的。
 * bars=セクション小節数（frame 由来）。beatsPerBar=V2 の barLen（4/4→4・3/4→3・6/4→6）。
 * 未指定/空歌詞＝空計画（呼び側は注入しない＝bit一致）。
 */
export function planLyricMelody(rawLines: string[], opts: { bars: number; beatsPerBar?: number }): LyricMelodyPlan {
  const barLen = Math.max(1, Math.round(opts.beatsPerBar ?? 4));
  const bars = Math.max(1, Math.round(opts.bars));
  const warnings: string[] = [];
  const lines = rawLines.map((s) => s.trim()).filter((s) => s.length > 0);
  const empty: LyricMelodyPlan = { phrases: [], rhythmParts: {}, syllables: [], lineHeadNoteIdx: [], lines: [], warnings, onsetTotal: 0 };
  if (!lines.length) return empty;

  // 行数 > 小節数：隣接行を統合して bars グループへ（各句≥1小節を保つ＝phrases 契約）。句割りは行と一致しなくなる＝警告。
  let groups: string[] = lines;
  if (lines.length > bars) {
    warnings.push(`行数(${lines.length}) > 小節数(${bars}) のため隣接行を統合（句割りは行と不一致）`);
    const g: string[] = Array.from({ length: bars }, () => "");
    for (let i = 0; i < lines.length; i++) {
      const gi = Math.min(bars - 1, Math.floor((i * bars) / lines.length));
      g[gi] = g[gi] ? g[gi] + lines[i]! : lines[i]!;
    }
    groups = g;
  }

  // グループごとにモーラ→オンセット。
  const perGroup = groups.map((text) => {
    const moras = analyzeMoras(text);
    const onsetKana = moras.filter((m) => isOnsetMora(m.kind)).map((m) => m.kana);
    return { text, moraCount: moras.length, onsetKana };
  });

  const bAlloc = allocBars(perGroup.map((g) => Math.max(1, g.onsetKana.length)), bars, 1);

  const phrases: { startBeat: number; beats: number; cadenceDegree: number }[] = [];
  const syllables: string[] = [];
  const lineHeadNoteIdx: number[] = [];
  const linesOut: LyricLinePlan[] = [];
  const customMap = new Map<string, string>(); // pattern文字列 → custom id（R-13＝同パターン再利用）
  const custom: { id: string; pattern: string }[] = [];
  const placement: { bar: number; partId: string }[] = [];

  let bar0 = 0;
  for (let gi = 0; gi < perGroup.length; gi++) {
    const g = perGroup[gi]!;
    const gb = bAlloc[gi]!;
    const onsetCount = g.onsetKana.length;
    lineHeadNoteIdx.push(syllables.length);
    for (const k of g.onsetKana) syllables.push(k);
    const last = gi === perGroup.length - 1;
    phrases.push({ startBeat: bar0 * barLen, beats: gb * barLen, cadenceDegree: last ? 1 : 5 });

    const { patterns, overflow } = layoutOnsets(onsetCount, gb, barLen);
    if (overflow > 0) warnings.push(`「${g.text}」はオンセット${onsetCount}個が${gb}小節に収まらず${overflow}個を省略（字余り＝行を分けるか小節増を）`);
    for (let b = 0; b < gb; b++) {
      const pat = patterns[b]!;
      let id = customMap.get(pat);
      if (!id) { id = `lyr${custom.length}`; customMap.set(pat, id); custom.push({ id, pattern: pat }); }
      placement.push({ bar: bar0 + b, partId: id });
    }
    linesOut.push({ line: gi, text: g.text, moraCount: g.moraCount, onsetCount, bar0, bars: gb });
    bar0 += gb;
  }

  return {
    phrases,
    rhythmParts: { custom, placement },
    syllables,
    lineHeadNoteIdx,
    lines: linesOut,
    warnings,
    onsetTotal: syllables.length,
  };
}
