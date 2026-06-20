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
