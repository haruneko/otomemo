import type { Note } from "./music";

// 歌詞の音韻（モーラ）数え（design #13）。worker の split_mora と同じ規則：
// 拗音(小書き)は直前と結合して1モーラ、長音ー・促音っ・撥音ん はそれ自体で1モーラ。
// ※かな前提。漢字交じりは各字1カウント（厳密化は pyopenjtalk 側＝将来）。
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

export function moraLines(text: string): { line: string; count: number }[] {
  return text.split("\n").map((line) => ({ line, count: splitMora(line).length }));
}

const MORA_FLOOR = 0.25; // 16分。これ以上は音符を分割しない（design L2）

// 歌詞(モーラ列)をメロ(notes)に1:1で流し込み、Note.syllable を埋める（design L2・決定的な"とりあえずの割当"）。
// モーラ>音符＝一番長い音符を半分に分割して枠を増やす（下限16分）。モーラ<音符＝余りはメリスマ"ー"。
// 純関数（入力 notes は破壊しない）。start 昇順で扱う。
export function flowLyric(notes: Note[], moras: string[], floor = MORA_FLOOR): Note[] {
  if (!notes.length || !moras.length) return notes.map((n) => ({ ...n }));
  const work: Note[] = notes.map((n) => ({ ...n })).sort((a, b) => a.start - b.start);
  const M = moras.length;

  // モーラ>音符：分割可能な最長音符を半分に（音符数=モーラ数になるまで貪欲）。
  while (work.length < M) {
    let idx = -1;
    let maxDur = -1;
    for (let i = 0; i < work.length; i++) {
      if (work[i]!.dur / 2 >= floor - 1e-9 && work[i]!.dur > maxDur) {
        maxDur = work[i]!.dur;
        idx = i;
      }
    }
    if (idx < 0) break; // これ以上割れない
    const n = work[idx]!;
    const half = n.dur / 2;
    work.splice(idx, 1,
      { ...n, dur: half },
      { ...n, start: Math.round((n.start + half) * 1000) / 1000, dur: half });
  }

  // 割当：先頭から1:1。余った音符（音符>モーラ）はメリスマ"ー"。
  const out = work.map((n, i) => ({ ...n, syllable: i < M ? moras[i]! : "ー" }));
  // モーラが余った（これ以上割れず音符<モーラ）→残りを最後の音符に連結。
  if (work.length < M) {
    const last = out[out.length - 1]!;
    last.syllable = (last.syllable ?? "") + moras.slice(work.length).join("");
  }
  return out;
}
