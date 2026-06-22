// U-FRET 譜面 → 進行コーパス取込。ufret_chord_datas(各行=[コード]＋歌詞) から
// 繰り返しループ(=再利用される進行単位)を抽出し、C基準度数で正規化＋タグ＋出典を付けて neta 化する素材を作る。
// 注：U-FRET の chord_datas にはセクションラベルが無い曲が多い → ループ検出で単位化（役割タグは付けず後補完）。
import { parseChordSymbol, type ParsedChord } from "./music/chordname";
import { detectKeyFromChords } from "./music";

export type SongMeta = { artist: string; song: string; url: string; popular?: boolean };
export type ProgressionInput = {
  kind: "chord_progression";
  title: string;
  key: number; // 0＝C基準保存
  mode: "major" | "minor";
  meter: string;
  content: { chords: { root: number; quality: string; start: number; dur: number }[]; source: SongMeta };
  tags: string[];
};

// U-FRET は実際の和声リズムを持たない（歌詞に対するコード位置のみ）。1拍ベタ並べは曲としてレアで不自然。
// 通例は2〜4拍/コード → 一番ニュートラルな **2拍/コード** をスキーマティック既定に（後で変更可）。
// timing は表示/試聴用のキャンバスで、連想・距離・名前あては列しか見ない（timing非依存）。
const CHORD_BEATS = 2;

/** <title>「曲名 / アーティスト ギターコード… - U-FRET」から曲名を取り出す。取れねば空。 */
export function extractSongTitle(html: string): string {
  const m = html.match(/<title>([^<]*)<\/title>/);
  if (!m) return "";
  return m[1]!.split("/")[0]!.replace(/\s+/g, " ").trim();
}

/** HTML から ufret_chord_datas 配列（行文字列）を取り出す。無ければ []。 */
export function extractUfretLines(html: string): string[] {
  const m = html.match(/ufret_chord_datas\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!m) return [];
  try {
    return JSON.parse(m[1]!) as string[];
  } catch {
    return [];
  }
}

/** 行配列 → コード列（[X]トークンを順に解析・解釈不能はスキップ・連続重複は畳む）。 */
export function linesToChords(lines: string[]): ParsedChord[] {
  const out: ParsedChord[] = [];
  for (const line of lines) {
    for (const mt of line.matchAll(/\[([^\]]+)\]/g)) {
      const c = parseChordSymbol(mt[1]!);
      if (!c) continue;
      const prev = out[out.length - 1];
      if (prev && prev.root === c.root && prev.quality === c.quality) continue; // 連続重複(歌詞跨ぎ)を畳む
      out.push(c);
    }
  }
  return out;
}

const sig = (cs: ParsedChord[]) => cs.map((c) => `${c.root}:${c.quality}`).join(",");

/** 連続して2回以上繰り返すサイクル(=ループ＝進行単位)を抽出。重複ループは1つに。非反復部はスキップ。 */
export function extractLoops(chords: ParsedChord[]): ParsedChord[][] {
  const n = chords.length;
  const loops: ParsedChord[][] = [];
  const seen = new Set<string>();
  let i = 0;
  while (i < n) {
    let found = false;
    for (let p = 2; p <= Math.min(8, Math.floor((n - i) / 2)); p++) {
      const cycle = chords.slice(i, i + p);
      let reps = 1;
      let j = i + p;
      while (j + p <= n && sig(chords.slice(j, j + p)) === sig(cycle)) {
        reps++;
        j += p;
      }
      if (reps >= 2) {
        const s = sig(cycle);
        if (!seen.has(s)) (seen.add(s), loops.push(cycle));
        i = j;
        found = true;
        break;
      }
    }
    if (!found) i++;
  }
  return loops;
}

/** 1曲の HTML → 進行neta 素材（ループごと・C基準度数・タグ・出典）。 */
export function songToProgressions(html: string, meta: SongMeta): ProgressionInput[] {
  const chords = linesToChords(extractUfretLines(html));
  if (chords.length < 2) return [];
  const loops = extractLoops(chords);
  const out: ProgressionInput[] = [];
  loops.forEach((loop, idx) => {
    const det = detectKeyFromChords(loop, 1)[0]!;
    const key = det.key;
    // C基準へ移調して保存（design「C基準保存」）。neta.key=0。各コード CHORD_BEATS(2)拍。
    // ただしコード数が奇数なら最後を4拍に伸ばし、合計を小節(4拍)の切れ目に着地させる(2+2+4=8=2小節)。
    const odd = loop.length % 2 === 1;
    const cChords = loop.map((c, i) => ({
      root: ((c.root - key) % 12 + 12) % 12,
      quality: c.quality,
      start: i * CHORD_BEATS,
      dur: odd && i === loop.length - 1 ? CHORD_BEATS * 2 : CHORD_BEATS,
    }));
    // 「取込」＝コーパス由来（手作りネタと区別しネタ帳が埋もれないように）。
    const tags = ["取込", meta.popular ? "定番" : "", meta.artist, det.mode === "minor" ? "切ない" : "明るい"].filter(Boolean);
    out.push({
      kind: "chord_progression",
      title: `${meta.artist} - ${meta.song}${loops.length > 1 ? ` (loop${idx + 1})` : ""}`,
      key: 0,
      mode: det.mode,
      meter: "4/4",
      content: { chords: cChords, source: meta },
      tags,
    });
  });
  return out;
}
