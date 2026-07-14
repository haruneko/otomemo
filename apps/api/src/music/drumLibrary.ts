// ドラム定型ビート＋フィル語彙の純データ辞書（WP-D1・2026-07-14）。
// 正準＝docs/research/2026-07-14-drum-pattern-genre-library.md（定型ビート型辞書）／
//       docs/research/2026-07-14-drum-fill-vocabulary.md（フィル型辞書）／
//       docs/research/2026-07-14-stem-groove-measurements.md（頻度の実測較正）。
// 方針（D5 §11）：型は**素の格子(straight)**で保持しスイング/微小 timing は feel 層(applyFeel)へ委譲。
//   三連が主役の shuffle.* のみ triplet=true（12格子）。ゴースト等の非一様 vel はレーン分割 or フィルの velCurve で表現。
// 本ファイルは「不変知識」＝生成器(generate.ts)から分離。genDrums がこのデータを realize する。

// GM ドラムノート（D5 §1 の対応表）。
export const DRUM = {
  Kick: 36, Snare: 38, SideStick: 37, Clap: 39,
  HHc: 42, HHpedal: 44, HHopen: 46, Ride: 51, RideBell: 53, Tamb: 54,
  TomHi: 48, TomMid: 45, TomFloor: 41, Crash: 49,
} as const;

// 出力レーン（genDrums content の rhythm.lanes と同形）。
// vel=レーン代表ベロシティ。velCurve=hits と同順の per-hit ベロシティ（フィルのカーブ用・旧 consumer は無視＝bit 安全）。
export interface OutLane { name: string; midi: number; hits: number[]; vel: number; velCurve?: number[] }

// 定型ビート型（1小節・4/4は16格子/shuffleは12三連/6-8は12格子）。lanes は既に出力形（単一vel/レーン＝ゴーストは別レーン）。
export interface BeatPattern {
  id: string;
  meter: "4/4" | "6/8";
  grid: 16 | 12; // 1小節のstep数（4/4=16・triplet/6-8=12）
  triplet?: boolean; // shuffle系（feel のスイングでなく三連格子で持つ）
  bars: number; // パターン自体の小節数（amen/bossa=2）
  tempoMin: number; tempoMax: number;
  genres: string[];
  lanes: OutLane[]; // hits は 0..grid*bars-1 の絶対 step
}

const V = { kick: 115, snare: 105, ghost: 28, hh8: 55, hh16: 42, open: 70, ride: 60, bell: 75, clap: 100, side: 92, tamb: 60 };
const L = (name: string, midi: number, hits: number[], vel: number): OutLane => ({ name, midi, hits, vel });

// ── 定型ビート辞書（D5 §2-7・代表18型） ───────────────────────────────
export const BEAT_PATTERNS: BeatPattern[] = [
  // §2 8ビート系
  { id: "beat8.basic", meter: "4/4", grid: 16, bars: 1, tempoMin: 70, tempoMax: 140, genres: ["jpop", "rock", "pop"], lanes: [
    L("HiHat", DRUM.HHc, [0, 2, 4, 6, 8, 10, 12, 14], V.hh8), L("Snare", DRUM.Snare, [4, 12], V.snare), L("Kick", DRUM.Kick, [0, 8], V.kick),
  ] },
  { id: "beat8.offbeat_hh", meter: "4/4", grid: 16, bars: 1, tempoMin: 100, tempoMax: 132, genres: ["dance", "idol", "pop"], lanes: [
    L("OpenHat", DRUM.HHopen, [2, 6, 10, 14], V.open), L("Snare", DRUM.Snare, [4, 12], V.snare), L("Kick", DRUM.Kick, [0, 8], V.kick),
  ] },
  { id: "beat8.syncopated", meter: "4/4", grid: 16, bars: 1, tempoMin: 80, tempoMax: 150, genres: ["jpop", "pop", "rock"], lanes: [
    L("HiHat", DRUM.HHc, [0, 2, 4, 6, 8, 10, 12, 14], V.hh8), L("Snare", DRUM.Snare, [4, 12], V.snare), L("Kick", DRUM.Kick, [0, 8, 10, 12], V.kick),
  ] },
  // §3 16ビート系
  { id: "beat16.basic", meter: "4/4", grid: 16, bars: 1, tempoMin: 70, tempoMax: 110, genres: ["citypop", "ballad", "rnb"], lanes: [
    L("HiHat", DRUM.HHc, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], V.hh16), L("Snare", DRUM.Snare, [4, 12], V.snare), L("Kick", DRUM.Kick, [0, 6, 8], V.kick),
  ] },
  { id: "beat16.ghost", meter: "4/4", grid: 16, bars: 1, tempoMin: 75, tempoMax: 115, genres: ["funk", "citypop", "rnb"], lanes: [
    L("HiHat", DRUM.HHc, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], V.hh16), L("Snare", DRUM.Snare, [4, 12], V.snare), L("SnareGhost", DRUM.Snare, [2, 6, 9, 14], V.ghost), L("Kick", DRUM.Kick, [0, 6, 8, 11], V.kick),
  ] },
  // §4 4つ打ち系
  { id: "four.house", meter: "4/4", grid: 16, bars: 1, tempoMin: 118, tempoMax: 140, genres: ["dance", "idol"], lanes: [
    L("OpenHat", DRUM.HHopen, [2, 6, 10, 14], V.open), L("Clap", DRUM.Clap, [4, 12], V.clap), L("Kick", DRUM.Kick, [0, 4, 8, 12], V.kick),
  ] },
  { id: "four.rock", meter: "4/4", grid: 16, bars: 1, tempoMin: 120, tempoMax: 170, genres: ["rock", "jpop", "dance"], lanes: [
    L("HiHat", DRUM.HHc, [0, 2, 4, 6, 8, 10, 12, 14], V.hh8), L("Snare", DRUM.Snare, [4, 12], V.snare), L("Kick", DRUM.Kick, [0, 4, 8, 12], V.kick),
  ] },
  // §5 ハーフ/ダブル/シャッフル
  { id: "halftime.basic", meter: "4/4", grid: 16, bars: 1, tempoMin: 120, tempoMax: 170, genres: ["jpop", "rock", "emo"], lanes: [
    L("HiHat", DRUM.HHc, [0, 2, 4, 6, 8, 10, 12, 14], V.hh8), L("Snare", DRUM.Snare, [8], V.snare), L("Kick", DRUM.Kick, [0, 12], V.kick),
  ] },
  { id: "doubletime.basic", meter: "4/4", grid: 16, bars: 1, tempoMin: 70, tempoMax: 110, genres: ["punk", "rock"], lanes: [
    L("HiHat", DRUM.HHc, [0, 2, 4, 6, 8, 10, 12, 14], V.hh8), L("Snare", DRUM.Snare, [2, 6, 10, 14], V.snare), L("Kick", DRUM.Kick, [0, 4, 8, 12], V.kick),
  ] },
  { id: "shuffle.basic", meter: "4/4", grid: 12, triplet: true, bars: 1, tempoMin: 80, tempoMax: 140, genres: ["blues", "citypop"], lanes: [
    L("HiHat", DRUM.HHc, [0, 2, 3, 5, 6, 8, 9, 11], V.hh8), L("Snare", DRUM.Snare, [3, 9], V.snare), L("Kick", DRUM.Kick, [0, 6], V.kick),
  ] },
  { id: "shuffle.halftime", meter: "4/4", grid: 12, triplet: true, bars: 1, tempoMin: 80, tempoMax: 100, genres: ["aor", "citypop", "funk"], lanes: [
    L("HiHat", DRUM.HHc, [0, 2, 3, 5, 6, 8, 9, 11], V.hh8), L("Snare", DRUM.Snare, [6], V.snare), L("SnareGhost", DRUM.Snare, [1, 2, 4, 5, 8, 10, 11], V.ghost), L("Kick", DRUM.Kick, [0, 9], V.kick),
  ] },
  // §6 ブレイク（構造抽象・2小節）
  { id: "break.amen_abstract", meter: "4/4", grid: 16, bars: 2, tempoMin: 90, tempoMax: 180, genres: ["dnb", "breakbeat"], lanes: [
    L("HiHat", DRUM.HHc, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30], V.hh8),
    L("Snare", DRUM.Snare, [4, 12, 20, 30], V.snare), L("SnareGhost", DRUM.Snare, [2, 10, 19, 23, 26, 29], V.ghost),
    L("Kick", DRUM.Kick, [0, 6, 14, 16, 22, 25], V.kick),
  ] },
  // §7 モータウン/ラテン/6-8/ロック極型
  { id: "motown.four_on_snare", meter: "4/4", grid: 16, bars: 1, tempoMin: 110, tempoMax: 140, genres: ["motown", "pop"], lanes: [
    L("Tamb", DRUM.Tamb, [2, 6, 10, 14], V.tamb), L("Snare", DRUM.Snare, [0, 4, 8, 12], V.snare), L("Kick", DRUM.Kick, [0, 8], V.kick),
  ] },
  { id: "bossa.basic", meter: "4/4", grid: 16, bars: 2, tempoMin: 110, tempoMax: 170, genres: ["bossa", "latin"], lanes: [
    L("HiHat", DRUM.HHc, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30], V.ride),
    L("SideStick", DRUM.SideStick, [0, 6, 12, 18, 22, 28], V.side), L("Kick", DRUM.Kick, [0, 8, 16, 24], V.kick),
  ] },
  { id: "samba.simplified", meter: "4/4", grid: 16, bars: 1, tempoMin: 95, tempoMax: 130, genres: ["samba", "latin"], lanes: [
    L("HiHat", DRUM.HHc, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], V.hh16),
    L("SnareGhost", DRUM.Snare, [2, 4, 7, 10, 12, 15], V.ghost), L("Kick", DRUM.Kick, [0, 3, 4, 7, 8, 11, 12, 15], V.kick),
  ] },
  { id: "six8.ballad", meter: "6/8", grid: 12, bars: 1, tempoMin: 50, tempoMax: 80, genres: ["ballad", "gospel", "rnb"], lanes: [
    L("HiHat", DRUM.HHc, [0, 2, 4, 6, 8, 10], V.hh8), L("Snare", DRUM.Snare, [6], V.snare), L("Kick", DRUM.Kick, [0], V.kick),
  ] },
  { id: "dbeat.basic", meter: "4/4", grid: 16, bars: 1, tempoMin: 160, tempoMax: 220, genres: ["punk", "hardcore"], lanes: [
    L("HiHat", DRUM.HHc, [0, 2, 4, 6, 8, 10, 12, 14], V.hh8), L("Snare", DRUM.Snare, [4, 12], V.snare), L("Kick", DRUM.Kick, [0, 2, 6, 8, 10, 14], V.kick),
  ] },
  { id: "blast.traditional", meter: "4/4", grid: 16, bars: 1, tempoMin: 200, tempoMax: 300, genres: ["metal"], lanes: [
    L("HiHat", DRUM.HHc, [0, 4, 8, 12], V.hh8), L("Snare", DRUM.Snare, [2, 6, 10, 14], V.snare), L("Kick", DRUM.Kick, [0, 4, 8, 12], V.kick),
  ] },
];

// ── フィル型辞書（D1 §6-7・代表 F01-F12） ─────────────────────────────
// grid=1小節のstep数（4/4=16）。lanes は velCurve 付き（hits と同順のカーブ）。landing=次小節頭の着地。
export interface FillLane { name: string; midi: number; hits: number[]; velCurve: number[] }
export interface FillType {
  id: string;
  meter: "4/4" | "6/8";
  grid: 16 | 12;
  bars: number; // フィル本体の小節数（F10=2）
  category: "tomDesc" | "tomAsc" | "snareRoll" | "synco" | "rest" | "crashSetup" | "buildup";
  intensity: 1 | 2 | 3 | 4 | 5;
  landing: "crashKick" | "crashOnly" | "rideKick" | "silent";
  energyDir: "up" | "flat" | "down";
  lanes: FillLane[];
}
const FL = (name: string, midi: number, hits: number[], velCurve: number[]): FillLane => ({ name, midi, hits, velCurve });
const flat = (n: number, v: number): number[] => Array.from({ length: n }, () => v);

// ── ビルドアップ・ロール生成（buildup テンプレ・正準＝docs/research/2026-07-14-buildup-drop-mechanics.md §5-1）─────
// divs=各小節の分割（4=4分/8=8分/16=16分・grid16なので step間隔=16/div）。**密度倍加**＝divs を段階的に倍化（§1-1 本命）。
//   32分は16格子で表せないため 16分連打（div=16）で近似＝加速の到達点は末尾小節（§5-2 の「32分は末尾1〜2拍限定」ガードは grid16 では16分上限で自然充足）。
// gapBeats=最終小節**末尾の無音拍**（1..4）＝ドロップ直前の「予測の宙吊り」（§1-5・必須の一級要素）。
// vel は全 hit を通して vStart→vEnd の**単調ランプ**（フィルタ開き/クレッシェンドの MIDI 近似・§1-2）＝溜めは単調増でないと抜ける（§0）。
// スネア単声＝ビルド区間は自動で**キック抜き**（applyDrumFill が fill 小節に base を敷かない＝低域除去が自動・§1-4）。着地(次小節頭)で crash+kick 復帰＝ドロップ頭の一斉復帰（§2-1）。
function makeBuildRoll(id: string, divs: number[], gapBeats: number, vStart: number, vEnd: number, intensity: 1 | 2 | 3 | 4 | 5): FillType {
  const bars = divs.length;
  const hits: number[] = [];
  for (let b = 0; b < bars; b++) {
    const interval = Math.max(1, Math.round(16 / divs[b]!)); // 16/4=4・16/8=2・16/16=1
    const gapStart = b === bars - 1 ? Math.max(0, 16 - gapBeats * 4) : 16; // 末尾小節のみ gap 手前で打ち止め
    for (let s = 0; s < gapStart; s += interval) hits.push(b * 16 + s);
  }
  const M = hits.length;
  const velCurve = hits.map((_, k) => Math.round(vStart + (vEnd - vStart) * (M <= 1 ? 1 : k / (M - 1)))); // 単調ランプ（非減少）
  return { id, meter: "4/4", grid: 16, bars, category: "buildup", intensity, landing: "crashKick", energyDir: "up", lanes: [FL("Snare", DRUM.Snare, hits, velCurve)] };
}

export const FILL_TYPES: FillType[] = [
  { id: "fill.snare.1beat", meter: "4/4", grid: 16, bars: 1, category: "snareRoll", intensity: 1, landing: "crashKick", energyDir: "flat", lanes: [
    FL("HiHat", DRUM.HHc, [0, 2, 4, 6, 8, 10], flat(6, V.hh8)), FL("Snare", DRUM.Snare, [12, 13, 14, 15], [70, 78, 87, 95]), FL("Kick", DRUM.Kick, [0, 6, 8], flat(3, V.kick)),
  ] },
  { id: "fill.tom.desc.1beat", meter: "4/4", grid: 16, bars: 1, category: "tomDesc", intensity: 2, landing: "crashKick", energyDir: "down", lanes: [
    FL("TomHi", DRUM.TomHi, [12, 13], [90, 90]), FL("TomMid", DRUM.TomMid, [14], [90]), FL("TomFloor", DRUM.TomFloor, [15], [95]), FL("Kick", DRUM.Kick, [0, 6, 8], flat(3, V.kick)),
  ] },
  { id: "fill.tom.asc.half", meter: "4/4", grid: 16, bars: 1, category: "tomAsc", intensity: 3, landing: "crashKick", energyDir: "up", lanes: [
    FL("TomFloor", DRUM.TomFloor, [8, 9], [85, 85]), FL("TomMid", DRUM.TomMid, [10, 11], [95, 95]), FL("TomHi", DRUM.TomHi, [12, 13], [105, 105]),
    FL("SnareGhost", DRUM.Snare, [0, 2, 4, 6], flat(4, 25)), FL("Snare", DRUM.Snare, [14, 15], [110, 120]), FL("Kick", DRUM.Kick, [0, 6], flat(2, V.kick)),
  ] },
  { id: "fill.snareRoll.half", meter: "4/4", grid: 16, bars: 1, category: "snareRoll", intensity: 3, landing: "crashKick", energyDir: "up", lanes: [
    FL("Snare", DRUM.Snare, [8, 9, 10, 11, 12, 13, 14, 15], [55, 64, 73, 82, 91, 100, 109, 118]), FL("Kick", DRUM.Kick, [0, 6], flat(2, V.kick)),
  ] },
  { id: "fill.tom.desc.1bar", meter: "4/4", grid: 16, bars: 1, category: "tomDesc", intensity: 4, landing: "crashKick", energyDir: "down", lanes: [
    FL("Snare", DRUM.Snare, [0, 1, 2, 3], [100, 93, 87, 80]), FL("TomHi", DRUM.TomHi, [4, 5, 6, 7], flat(4, 95)), FL("TomMid", DRUM.TomMid, [8, 9, 10, 11], flat(4, 95)), FL("TomFloor", DRUM.TomFloor, [12, 13, 14, 15], [100, 105, 110, 115]),
  ] },
  { id: "fill.tom.asc.1bar", meter: "4/4", grid: 16, bars: 1, category: "tomAsc", intensity: 4, landing: "crashKick", energyDir: "up", lanes: [
    FL("TomFloor", DRUM.TomFloor, [0, 1, 2, 3], [80, 83, 87, 90]), FL("TomMid", DRUM.TomMid, [4, 5, 6, 7], flat(4, 95)), FL("TomHi", DRUM.TomHi, [8, 9, 10, 11], flat(4, 105)), FL("Snare", DRUM.Snare, [12, 13, 14, 15], [110, 115, 118, 122]), FL("Kick", DRUM.Kick, [0], [V.kick]),
  ] },
  { id: "fill.synco.half", meter: "4/4", grid: 16, bars: 1, category: "synco", intensity: 3, landing: "crashKick", energyDir: "flat", lanes: [
    FL("Snare", DRUM.Snare, [1, 3, 5, 8, 10, 11, 13, 14], [25, 80, 25, 80, 25, 80, 105, 25]), FL("TomMid", DRUM.TomMid, [12, 15], [90, 90]), FL("Kick", DRUM.Kick, [0, 3, 6, 9, 12], flat(5, V.kick)),
  ] },
  { id: "fill.rest.setup", meter: "4/4", grid: 16, bars: 1, category: "rest", intensity: 1, landing: "crashOnly", energyDir: "down", lanes: [
    FL("Snare", DRUM.Snare, [0], [90]), FL("Kick", DRUM.Kick, [0, 14], [100, 100]),
  ] },
  { id: "fill.crashSetup.1beat", meter: "4/4", grid: 16, bars: 1, category: "crashSetup", intensity: 1, landing: "crashKick", energyDir: "up", lanes: [
    FL("HiHat", DRUM.HHc, [0, 2, 4, 6, 8, 10, 12, 14], flat(8, V.hh8)), FL("Snare", DRUM.Snare, [4, 12], [95, 95]), FL("Kick", DRUM.Kick, [0, 6, 8, 14], flat(4, V.kick)),
  ] },
  { id: "build.snareRoll.2bar", meter: "4/4", grid: 16, bars: 2, category: "buildup", intensity: 5, landing: "crashKick", energyDir: "up", lanes: [
    FL("Snare", DRUM.Snare, [0, 4, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 27, 28, 29, 30, 31], [40, 48, 56, 62, 66, 70, 74, 80, 86, 92, 98, 104, 108, 112, 116, 120, 124]),
  ] },
  { id: "fill.snare.tom.16th.1bar", meter: "4/4", grid: 16, bars: 1, category: "snareRoll", intensity: 4, landing: "crashKick", energyDir: "up", lanes: [
    FL("Snare", DRUM.Snare, [0, 1, 2, 3, 4, 5, 12, 13], [80, 84, 88, 92, 96, 100, 96, 100]), FL("TomHi", DRUM.TomHi, [6, 7], flat(2, 100)), FL("TomMid", DRUM.TomMid, [8, 9], flat(2, 100)), FL("TomFloor", DRUM.TomFloor, [10, 11, 14, 15], [105, 108, 114, 118]), FL("Kick", DRUM.Kick, [0], [V.kick]),
  ] },
  { id: "fill.halfTime.flip", meter: "4/4", grid: 16, bars: 1, category: "rest", intensity: 2, landing: "crashOnly", energyDir: "down", lanes: [
    FL("Snare", DRUM.Snare, [4, 12], [90, 90]), FL("Kick", DRUM.Kick, [0, 8], flat(2, V.kick)),
  ] },
  // ── ビルドアップ・テンプレ3種（buildup・§5-1 の A/B/C タイムライン）＝密度倍加＋vel単調ランプ＋末尾無音ギャップ ─────
  // fill=型ID で**明示選択**（数値 fill は bars===1 群からのみ選抜＝ビルドは既定 OFF＝bit 一致）。要 frame.bars≥bars+1（着地小節ぶん）。
  makeBuildRoll("build.tight.4bar", [4, 8, 8, 16], 1, 70, 110, 3), // C: J-pop プリコーラス（軽量遷移・末尾1拍タメ）
  makeBuildRoll("build.standard.8bar", [4, 4, 8, 8, 16, 16, 16, 16], 1, 50, 127, 5), // A: 汎用8小節（安全牌・末尾1拍ギャップ）
  makeBuildRoll("build.big.16bar", [4, 4, 4, 4, 8, 8, 8, 8, 16, 16, 16, 16, 16, 16, 16, 16], 4, 40, 127, 5), // B: 大サビ前・最大溜め（末尾1小節まるごと無音）
];

// 6/8 用の簡易フィル（12格子・後半3拍=step6..11 のタム下降＝D1 §8-5 の張替の最小対応）。
export const FILL_6_8: FillType = {
  id: "fill.six8.desc", meter: "6/8", grid: 12, bars: 1, category: "tomDesc", intensity: 3, landing: "crashKick", energyDir: "up", lanes: [
    FL("TomHi", DRUM.TomHi, [6, 7], [95, 95]), FL("TomMid", DRUM.TomMid, [8, 9], [98, 98]), FL("TomFloor", DRUM.TomFloor, [10, 11], [105, 110]), FL("Kick", DRUM.Kick, [0], [V.kick]),
  ],
};

// ── ジャンル×セクション役割→候補型（D5 §9 選択表・優先順） ─────────────
type Role = "intro" | "verse" | "prechorus" | "chorus" | "bridge" | "interlude" | "outro";
const GENRE_TABLE: Record<string, Partial<Record<Role, string[]>>> = {
  jpop: { intro: ["beat8.basic", "four.rock"], verse: ["beat8.syncopated", "beat8.basic", "beat16.ghost"], prechorus: ["halftime.basic", "beat8.offbeat_hh"], chorus: ["four.rock", "beat8.offbeat_hh", "beat16.basic"], bridge: ["halftime.basic", "six8.ballad"], outro: ["beat8.basic"] },
  rock: { intro: ["beat8.basic"], verse: ["beat8.basic", "beat8.syncopated"], prechorus: ["halftime.basic", "beat8.offbeat_hh"], chorus: ["four.rock", "beat8.offbeat_hh"], bridge: ["halftime.basic"], outro: ["four.rock"] },
  dance: { intro: ["beat8.offbeat_hh", "four.house"], verse: ["beat8.offbeat_hh", "four.house"], prechorus: ["four.house"], chorus: ["four.house", "four.rock"], bridge: ["halftime.basic"], outro: ["four.house"] },
  ballad: { intro: ["six8.ballad", "beat16.basic"], verse: ["six8.ballad", "beat16.basic"], prechorus: ["beat16.basic"], chorus: ["beat16.basic", "six8.ballad"], bridge: ["six8.ballad"], outro: ["six8.ballad"] },
  funk: { intro: ["beat16.ghost"], verse: ["beat16.ghost", "shuffle.halftime"], prechorus: ["beat16.ghost"], chorus: ["beat16.basic", "motown.four_on_snare"], bridge: ["bossa.basic"], outro: ["beat16.ghost"] },
};
const GENRE_ALIAS: Record<string, string> = { pop: "jpop", vocaloid: "jpop", idol: "dance", edm: "dance", house: "dance", band: "rock", punk: "rock", slow: "ballad", rnb: "funk", soul: "funk", citypop: "funk" };

export function beatPatternById(id: string): BeatPattern | undefined { return BEAT_PATTERNS.find((p) => p.id === id); }

// ジャンル名＋（frame の）役割/tempo/compound から候補型を絞り、seed で1つ選ぶ（決定的）。無ければ null。
export function pickBeatPattern(genre: string, role: Role | undefined, tempo: number | undefined, compound: boolean, seed: number): BeatPattern | null {
  const g = GENRE_ALIAS[genre] ?? genre;
  const table = GENRE_TABLE[g];
  if (!table) return null;
  const ids = table[role ?? "verse"] ?? table.verse ?? [];
  let cands = ids.map(beatPatternById).filter((p): p is BeatPattern => !!p);
  // 拍子ゲート：6/8(compound)は 6/8 型のみ／4/4 は 4/4 型のみ。
  cands = cands.filter((p) => (compound ? p.meter === "6/8" : p.meter === "4/4"));
  if (compound && cands.length === 0) { const b = beatPatternById("six8.ballad"); return b ?? null; }
  if (cands.length === 0) return null;
  // tempo 適正域を優先（域内があれば域内から・無ければ全候補）。
  const inRange = tempo != null ? cands.filter((p) => tempo >= p.tempoMin && tempo <= p.tempoMax) : [];
  const pool = inRange.length ? inRange : cands;
  return pool[((seed % pool.length) + pool.length) % pool.length] ?? null;
}

// フィルを解決：数値(0..1)→intensity で選抜／型ID→固定。compound は 6/8 フィル。無ければ null。
export function resolveFillType(fill: number | string, compound: boolean, seed: number): FillType | null {
  if (compound) return FILL_6_8; // 6/8 は簡易フィル1本（D1 §8-5・当面）
  if (typeof fill === "string") return FILL_TYPES.find((f) => f.id === fill) ?? null;
  // 数値：intensity 目標 = 1 + round(fill*4)。1小節フィル群から intensity 最近傍を seed で選ぶ。
  const target = 1 + Math.round(Math.max(0, Math.min(1, fill)) * 4);
  const pool = FILL_TYPES.filter((f) => f.bars === 1);
  let best = pool[0]!; let bestD = Infinity;
  const ranked = [...pool].sort((a, b) => a.intensity - b.intensity || a.id.localeCompare(b.id));
  for (const f of ranked) { const d = Math.abs(f.intensity - target); if (d < bestD) { bestD = d; best = f; } }
  // 同 intensity 複数なら seed で散らす（バリエーション）。
  const ties = ranked.filter((f) => f.intensity === best.intensity);
  return ties[((seed % ties.length) + ties.length) % ties.length] ?? best;
}
