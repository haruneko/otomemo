// #S11 コードレンズ（chord lens）の純関数。複数曲のコード列を度数正規化し、
// クロス曲 n-gram 頻度を集計する。調も拍子も無関係（度数化済み）＝研究の核心。
// TDD 先行（common-progressions.test.ts）。
import { detectKeyFromChords } from "./music";

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

// 度数トークン列 → 実音コード列（2拍/コードの模式的スキーマ）。
// ★度数は detectKeyFromChords が返す tonic 基準＝相対**長調**フレーム（Am-F-C-G も C major(tonic0) と検出）。
//   なので **tonic=0(C長調フレーム)** でレンダすると vi-IV-I-V → Am-F-C-G と自然な実音に戻る（tonic=9だとF#m-D-A-Eにズレる）。
function renderExample(degrees: string[]): ChordSlot[] {
  return degrees.map((d, i) => {
    const sep = d.indexOf(":");
    const deg = parseInt(d.slice(0, sep), 10);
    const quality = d.slice(sep + 1);
    const root = ((deg % 12) + 12) % 12; // tonic=0(C長調フレーム)で実音へ戻す
    return { root, quality, start: i * 2, dur: 2 };
  });
}

/**
 * 複数曲のコード列を度数正規化し、クロス曲 n-gram (n=2,3,4) の頻度を集計する。
 *
 * @param songs - {title, chords:[{root,quality}]} の配列。root は絶対ピッチクラス 0-11。
 * @returns common（songCount 降順 → n 長降順 → 合計出現数降順）＋ stats。
 */
export function commonProgressions(
  songs: { title: string; chords: { root: number; quality: string }[] }[],
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
    const cands = detectKeyFromChords(song.chords);
    const det = cands[0] ?? { key: 0, mode: "major" as const, score: 0 };
    const tonic = det.key;
    const mode = det.mode;

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

  for (const song of songData) {
    const { title, degs } = song;
    if (degs.length < 2) continue; // 1コード以下では2-gram作れない

    // このソングに出る各 n-gram とその出現数
    const occThisSong = new Map<string, number>(); // key → 出現数（in this song）
    const presentInSong = new Set<string>(); // key（distinct set per song）

    for (const n of [2, 3, 4] as const) {
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
