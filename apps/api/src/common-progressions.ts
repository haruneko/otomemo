// #S11 コードレンズ（chord lens）の純関数。複数曲のコード列を度数正規化し、
// クロス曲 n-gram 頻度を集計する。調も拍子も無関係（度数化済み）＝研究の核心。
// TDD 先行（common-progressions.test.ts）。

export interface ChordSlot { root: number; quality: string; start: number; dur: number }

export interface CommonEntry {
  degrees: string[];   // e.g. ["0:m", "8:", "3:", "10:"]
  example: ChordSlot[]; // 実音コード列（C長調フレーム=tonic0でレンダ＝vi-IV-I-V→Am-F-C-G）
  songCount: number;   // 何曲に含まれるか
  songs: string[];     // 含む曲のタイトル一覧
}

export interface CommonProgressionsResult {
  common: CommonEntry[];
  stats: {
    songs: number;
    keys: Record<string, number>;   // "A"/"C#"/… → 曲数
    modes: Record<string, number>;  // "major"/"minor" → 曲数
  };
}

// ピッチクラス → 音名（stats.keys のラベル用）
const PC_NAME: Record<number, string> = {
  0: "C", 1: "C#", 2: "D", 3: "D#", 4: "E", 5: "F",
  6: "F#", 7: "G", 8: "G#", 9: "A", 10: "A#", 11: "B",
};

// ★「メイン調＆長短」を曲全体のコード分布（ヒートマップ）で決める。相対長短(Gm↔B♭)は音集合では
//   区別不能なので、**最も強い三和音**（root+長短）を実測から選ぶ＝トニック。重み＝各コードの**継続長(dur)**
//   （無ければ出現数）＝「長く鳴る/居座る和音＝調の中心」。開始/解決先(first/last)は弱いボーナス。
//   ※相対ペアに縛らないので Dm 中心(D Phrygian 的)も拾える（DeepSea＝Dm が最長→D minor）。
const _isMinQ = (q: string) => q === "m" || q === "m7" || q === "m6";
const _isMajQ = (q: string) => q === "" || q === "maj7" || q === "6" || q === "7" || q.startsWith("sus");
export function resolveTonic(chords: { root: number; quality: string; dur?: number }[]): { tonic: number; mode: "major" | "minor" } {
  if (chords.length === 0) return { tonic: 0, mode: "major" };
  const score = new Map<string, number>(); // "root:m"/"root:M" → 重み
  const add = (root: number, min: boolean, x: number) => { const k = `${root}:${min ? "m" : "M"}`; score.set(k, (score.get(k) ?? 0) + x); };
  const put = (c: { root: number; quality: string; dur?: number }, x: number) => {
    if (_isMinQ(c.quality)) add(c.root, true, x); else if (_isMajQ(c.quality)) add(c.root, false, x);
  };
  for (const c of chords) put(c, typeof c.dur === "number" && c.dur > 0 ? c.dur : 1); // 分布（継続長 or 出現数）
  put(chords[0]!, 0.6); // 開始はトニックになりやすい
  put(chords[chords.length - 1]!, 0.3); // 解決先も
  let bestK = "0:M", best = -1;
  for (const [k, v] of score) if (v > best) { best = v; bestK = k; }
  const [r, m] = bestK.split(":");
  return { tonic: parseInt(r!, 10), mode: m === "m" ? "minor" : "major" };
}

// 度数トークン列 → 実音化の基準トニック（PC）。短調フレーム=**A minor(9)** / 長調=**C major(0)**。
// ★窓依存の穴の対策：4/8連の"回転窓"にトニック(0:*)が入らない事がある。0:m があれば当然短調。
//   無くても、♭III/♭VI/♭VII(3:/8:/10:)の major が居て I(0:)が居ないなら Aeolian＝短調フレームと判断する
//   （例 [8: 3: 8: 10:]＝♭VI-♭III-♭VI-♭VII は明らかに短調なのに旧実装は C長調枠で G#… と誤表示していた）。
export function renderFrameTonic(degrees: string[]): number {
  if (degrees.includes("0:m")) return 9;                    // 短調トニックが窓内＝確定で Am 枠
  const hasMajorTonic = degrees.some((d) => d === "0:" || d.startsWith("0:maj") || d.startsWith("0:6") || d.startsWith("0:sus"));
  if (hasMajorTonic) return 0;                              // 長調トニックが窓内＝C 枠
  const aeolianColor = degrees.some((d) => d === "3:" || d === "8:" || d === "10:"); // ♭III/♭VI/♭VII(major)
  return aeolianColor ? 9 : 0;                              // トニック不在の回転窓＝色で推定（Aeolian→Am枠）
}

// 度数トークン列 → 実音コード列（2拍/コード）。度数は「メイン調相対」（短調曲は i=0:m）。
function renderExample(degrees: string[]): ChordSlot[] {
  const renderTonic = renderFrameTonic(degrees); // モード対応で自然な実音枠を選ぶ
  return degrees.map((d, i) => {
    const sep = d.indexOf(":");
    const deg = parseInt(d.slice(0, sep), 10);
    const quality = d.slice(sep + 1);
    const root = (((deg + renderTonic) % 12) + 12) % 12;
    return { root, quality, start: i * 2, dur: 2 };
  });
}

/**
 * 複数曲のコード列を度数正規化し、クロス曲 n-gram (n=4,8=フレーズ長) の頻度を集計する。
 *
 * @param songs - {title, chords:[{root,quality}]} の配列。root は絶対ピッチクラス 0-11。
 * @returns common（songCount 降順 → n 長降順 → 合計出現数降順）＋ stats。
 */
export function commonProgressions(
  songs: { title: string; chords: { root: number; quality: string; dur?: number }[] }[],
  lengths: number[] = [4, 8], // 進行の長さ＝フレーズ単位（4個 or 8個の連続）。断片(2-3)は拾わない。
): CommonProgressionsResult {
  const stats = {
    songs: songs.length,
    keys: {} as Record<string, number>,
    modes: {} as Record<string, number>,
  };
  if (songs.length === 0) return { common: [], stats };

  // 各曲を度数列に変換（調検出→正規化）
  interface SongData { title: string; degs: string[]; tonic: number; mode: string }
  const songData: SongData[] = [];

  for (const song of songs) {
    if (!song.chords || song.chords.length === 0) {
      songData.push({ title: song.title, degs: [], tonic: 0, mode: "major" });
      const modeKey = "major";
      stats.modes[modeKey] = (stats.modes[modeKey] ?? 0) + 1;
      stats.keys["C"] = (stats.keys["C"] ?? 0) + 1;
      continue;
    }
    const { tonic, mode } = resolveTonic(song.chords); // ★分布でメイン調＆長短を決める

    const keyName = PC_NAME[tonic] ?? String(tonic);
    stats.keys[keyName] = (stats.keys[keyName] ?? 0) + 1;
    stats.modes[mode] = (stats.modes[mode] ?? 0) + 1;

    // 度数正規化: (root - tonic + 12) % 12 + ":" + quality
    const degs = song.chords.map((c) => `${((c.root - tonic) % 12 + 12) % 12}:${c.quality}`);
    songData.push({ title: song.title, degs, tonic, mode });
  }

  // n-gram 集計（songCount = 何曲に含まれるか / totalOcc = 全曲での合計出現数）
  interface NGramData {
    degrees: string[];
    songCount: number;
    totalOcc: number;
    songs: string[];
  }
  const ngramMap = new Map<string, NGramData>();

  const minLen = Math.min(...lengths);
  for (const song of songData) {
    const { title, degs } = song;
    if (degs.length < minLen) continue; // 最短フレーズ長に満たない曲は n-gram 無し

    // このソングに出る各 n-gram とその出現数
    const occThisSong = new Map<string, number>(); // key → 出現数（in this song）
    const presentInSong = new Set<string>(); // key（distinct set per song）

    for (const n of lengths) {
      for (let i = 0; i <= degs.length - n; i++) {
        const slice = degs.slice(i, i + n);
        const key = slice.join("|"); // "|" で連結（":" が品質に使われても干渉しない）
        occThisSong.set(key, (occThisSong.get(key) ?? 0) + 1);
        presentInSong.add(key);
      }
    }

    // マップへ反映
    for (const key of presentInSong) {
      let data = ngramMap.get(key);
      if (!data) {
        const degrees = key.split("|");
        ngramMap.set(key, (data = { degrees, songCount: 0, totalOcc: 0, songs: [] }));
      }
      data.songCount += 1;
      data.totalOcc += occThisSong.get(key) ?? 0;
      data.songs.push(title);
    }
  }

  // ソート：songCount 降順 → n(長さ) 降順 → totalOcc 降順
  const sorted = [...ngramMap.values()].sort((a, b) => {
    if (b.songCount !== a.songCount) return b.songCount - a.songCount;
    if (b.degrees.length !== a.degrees.length) return b.degrees.length - a.degrees.length;
    return b.totalOcc - a.totalOcc;
  });

  const common: CommonEntry[] = sorted.map((d) => ({
    degrees: d.degrees,
    example: renderExample(d.degrees),
    songCount: d.songCount,
    songs: d.songs,
  }));

  return { common, stats };
}
