// 歌詞のモーラ数え＋メロへの流し込み（web lyrics.ts の api 移植・純関数）。
// ② 歌詞↔メロ：Chat から歌詞をメロに載せる（set_lyric）ため api 側に持つ。
// 拗音(小書き)は直前と結合して1モーラ、長音ー・促音っ・撥音ん はそれ自体で1モーラ。

export interface LNote {
  pitch: number;
  start: number;
  dur: number;
  vel?: number;
  syllable?: string;
  [k: string]: unknown;
}

const SMALL = new Set("ァィゥェォャュョヮぁぃぅぇぉゃゅょゎ");

export function splitMora(kana: string): string[] {
  const out: string[] = [];
  const chars = [...kana];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (/\s/.test(ch)) continue;
    const nxt = chars[i + 1] ?? "";
    if (nxt && SMALL.has(nxt)) {
      out.push(ch + nxt);
      i++;
    } else {
      out.push(ch);
    }
  }
  return out;
}

const MORA_FLOOR = 0.25; // 16分。これ以上は音符を分割しない。

// 歌詞(モーラ列)をメロ(notes)に1:1で流し込み、syllable を埋める。純関数。
// モーラ>音符＝最長音符を半分に割って枠を増やす（下限16分）。モーラ<音符＝余りはメリスマ"ー"。
export function flowLyric(notes: LNote[], moras: string[], floor = MORA_FLOOR): LNote[] {
  if (!notes.length || !moras.length) return notes.map((n) => ({ ...n }));
  const work: LNote[] = notes.map((n) => ({ ...n })).sort((a, b) => a.start - b.start);
  const M = moras.length;

  while (work.length < M) {
    let idx = -1;
    let maxDur = -1;
    for (let i = 0; i < work.length; i++) {
      if (work[i]!.dur / 2 >= floor - 1e-9 && work[i]!.dur > maxDur) {
        maxDur = work[i]!.dur;
        idx = i;
      }
    }
    if (idx < 0) break;
    const n = work[idx]!;
    const half = n.dur / 2;
    work.splice(idx, 1, { ...n, dur: half }, { ...n, start: Math.round((n.start + half) * 1000) / 1000, dur: half });
  }

  const out = work.map((n, i) => ({ ...n, syllable: i < M ? moras[i]! : "ー" }));
  if (work.length < M) {
    const last = out[out.length - 1]!;
    last.syllable = (last.syllable ?? "") + moras.slice(work.length).join("");
  }
  return out;
}
