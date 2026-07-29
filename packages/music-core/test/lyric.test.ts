import { describe, it, expect } from "vitest";
import {
  splitMora,
  isKanaOnly,
  moraLinesForDisplay,
  moraLines,
  flowLyric,
  notesInRange,
  placeMoras,
  phraseStatus,
  isReadingStale,
  readingOf,
  effectiveReading,
  DEFAULT_GAP_BEATS,
  type LyricPhrase,
  type LyricReading,
} from "../src/lyric";
import { analyzeMoras } from "../src/prosody";

// 正典＝docs/design.md #31（作詞補助・スライス1〜3）。⚠ その節はオーナー未レビュー＝確定ではない。
// ここで縛るのは「純関数の契約」だけ＝歌詞の置き場（未裁定）に依存しない部分。

type TNote = { pitch: number; start: number; dur: number; vel?: number; syllable?: string };
const N = (start: number, dur: number, syllable?: string, pitch = 60): TNote => ({ pitch, start, dur, syllable });
const strip = (ns: TNote[]) => ns.map(({ syllable, ...rest }) => rest);

// 決定的な擬似乱数（property 用・seed 固定＝同じ入力で同じ列）。
function rng(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── §31-4 かな列の分割＝analyzeMoras 1本に寄せる ─────────────────────────────

describe("splitMora（かな列の分割・数え方の正は analyzeMoras 1本）", () => {
  it("拗音は直前と結合して1モーラ／ー・っ・ん はそれぞれ1モーラ", () => {
    expect(splitMora("はしる")).toEqual(["は", "し", "る"]);
    expect(splitMora("きゃー")).toEqual(["きゃ", "ー"]);
    expect(splitMora("がっこう")).toEqual(["が", "っ", "こ", "う"]);
    expect(splitMora("きょう")).toEqual(["きょ", "う"]);
    expect(splitMora("とうきょう")).toEqual(["と", "う", "きょ", "う"]);
  });

  it("空白は読み飛ばす・空文字は空", () => {
    expect(splitMora("")).toEqual([]);
    expect(splitMora("は し る")).toEqual(["は", "し", "る"]);
  });

  it("analyzeMoras の kana 列と常に同じ（薄い皮であることの担保）", () => {
    const alphabet = [..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんっーぁぃぅぇぉゃゅょアイウエオカキクケコンッー"];
    const rand = rng(20260729);
    for (let t = 0; t < 300; t++) {
      const len = 1 + Math.floor(rand() * 12);
      let s = "";
      for (let i = 0; i < len; i++) s += alphabet[Math.floor(rand() * alphabet.length)]!;
      expect(splitMora(s)).toEqual(analyzeMoras(s).map((m) => m.kana));
    }
  });

  // 旧 web/api の splitMora（2本の同一実装）との差分の記録。
  // 旧実装は「ー/っ/ん の直後に小書きかな」を1モーラに結合していた（例「ーゃ」→["ーゃ"]）。
  // analyzeMoras は ー/っ/ん を独立1モーラとして先に切るので ["ー","ゃ"] になる。
  // 実在しない並びで、analyzeMoras 側が正しい＝寄せ先の挙動を採る（design §31-4 の裁定「正は analyzeMoras」）。
  it("旧実装との唯一の差＝「ー/っ/ん＋小書きかな」の並び（実在しない・新の方が正しい）", () => {
    expect(splitMora("ーゃ")).toEqual(["ー", "ゃ"]);
    expect(splitMora("っゃ")).toEqual(["っ", "ゃ"]);
    expect(splitMora("んゃ")).toEqual(["ん", "ゃ"]);
    // 実際に使う並び（小書きの直前が通常のかな）では旧と同じ。
    expect(splitMora("しゃっきり")).toEqual(["しゃ", "っ", "き", "り"]);
  });
});

describe("isKanaOnly / moraLines（かな以外が混ざる行に音数を出させない・§31-4 の線）", () => {
  it("かな＋長音＋空白だけ true。漢字・英数・記号は false", () => {
    expect(isKanaOnly("あめのひは")).toBe(true);
    expect(isKanaOnly("キャーッ ー〜")).toBe(true);
    expect(isKanaOnly("")).toBe(true);
    expect(isKanaOnly("雨の日は")).toBe(false);
    expect(isKanaOnly("あめの日は")).toBe(false);
    expect(isKanaOnly("あめ、ひ")).toBe(false);
    expect(isKanaOnly("ame")).toBe(false);
  });

  it("moraLines の返す形は移動前と同じ（呼び側と既存テストを変えない）", () => {
    expect(moraLines("よる\nかける")).toEqual([
      { line: "よる", count: 2 },
      { line: "かける", count: 3 },
    ]);
  });

  it("漢字交じりの行は count が信用できない＝画面は isKanaOnly で音数を出さない側に落とす", () => {
    const out = moraLines("雨の日は");
    expect(out[0]!.count).toBe(4); // 正しくは5モーラ（あ/め/の/ひ/わ）＝この数は出してはいけない
    expect(isKanaOnly(out[0]!.line)).toBe(false);
  });
});

// ── §31-2 音符を作り替える flowLyric（移動しただけ・挙動は変えない） ──────────────

describe("flowLyric（音符を作り替えて流し込む・移動前と同じ挙動）", () => {
  it("モーラ数=音符数なら1対1", () => {
    const out = flowLyric([N(0, 1), N(1, 1)], ["あ", "い"]);
    expect(out.map((n) => n.syllable)).toEqual(["あ", "い"]);
  });

  it("音符が多い：余りはメリスマ「ー」", () => {
    const out = flowLyric([N(0, 1), N(1, 1), N(2, 1)], ["あ", "ん"]);
    expect(out.map((n) => n.syllable)).toEqual(["あ", "ん", "ー"]);
  });

  it("モーラが多い：一番長い音符を半分に割って枠を増やす（総尺は保存・下限16分）", () => {
    const out = flowLyric([N(0, 2)], ["あ", "い", "う"]);
    expect(out).toHaveLength(3);
    expect(out.map((n) => n.syllable)).toEqual(["あ", "い", "う"]);
    expect(Math.round(out.reduce((s, n) => s + n.dur, 0) * 1000) / 1000).toBe(2);
    expect(out.every((n) => n.dur >= 0.25)).toBe(true);
  });

  it("これ以上割れないのにモーラが多い：残りを最後の音符へ連結", () => {
    const out = flowLyric([N(0, 0.25)], ["あ", "い"]);
    expect(out).toHaveLength(1);
    expect(out[0]!.syllable).toBe("あい");
  });

  it("純関数（入力は破壊しない）・pitch 等の他フィールドは素通し", () => {
    const notes = [{ pitch: 62, start: 0, dur: 2, vel: 90 }];
    const out = flowLyric(notes, ["あ", "い"]);
    expect(notes[0]!.dur).toBe(2);
    expect(out.every((n) => n.pitch === 62 && n.vel === 90)).toBe(true);
  });
});

// ── §31-2 placeMoras＝音符を変えずに読みを写す（契約1〜3） ─────────────────────

describe("placeMoras（音符を変えずに読みを音符へ写す）", () => {
  const range = { start: 0, beats: 4 };

  it("契約1：syllable を取り除くと入力と完全一致（数・順序・start・dur・pitch・vel）", () => {
    const notes = [N(0, 1), N(1, 1), N(2, 1), N(3, 1)];
    const out = placeMoras(notes, ["あ", "い"], range);
    expect(strip(out)).toEqual(strip(notes));
  });

  it("契約1（property）：ばらばらの音符列・ばらばらのモーラ数でも音符は1つも増減しない", () => {
    const rand = rng(31);
    for (let t = 0; t < 200; t++) {
      const n = Math.floor(rand() * 8);
      const notes: TNote[] = [];
      for (let i = 0; i < n; i++) {
        notes.push(N(Math.round(rand() * 16 * 4) / 4, Math.round(rand() * 4 * 4) / 4 || 0.25, rand() < 0.3 ? "旧" : undefined, 48 + Math.floor(rand() * 24)));
      }
      const moras = Array.from({ length: Math.floor(rand() * 10) }, (_, i) => String(i));
      const rg = { start: Math.round(rand() * 8), beats: Math.round(rand() * 12) };
      const out = placeMoras(notes, moras, rg);
      expect(out).toHaveLength(notes.length);
      expect(strip(out)).toEqual(strip(notes));
    }
  });

  it("契約1：非破壊（入力配列と要素をどちらも触らない）", () => {
    const notes = [N(0, 1, "も"), N(1, 1)];
    placeMoras(notes, ["あ", "い"], range);
    expect(notes[0]!.syllable).toBe("も");
    expect(notes[1]!.syllable).toBeUndefined();
  });

  it("契約2：範囲外の音符は syllable も含めて一切触らない", () => {
    const notes = [N(-1, 1, "前"), N(0, 1, "旧"), N(4, 1, "後"), N(9, 1)];
    const out = placeMoras(notes, ["あ"], range);
    expect(out.map((n) => n.syllable)).toEqual(["前", "あ", "後", undefined]);
  });

  it("契約2：範囲は start が [start, start+beats) に入るかだけで決める（dur ははみ出てよい）", () => {
    const notes = [N(3.5, 4, "旧")]; // 範囲末をまたぐ長い音符＝start が範囲内なので対象
    const out = placeMoras(notes, ["あ"], range);
    expect(out[0]!.syllable).toBe("あ");
  });

  it("契約3：範囲内の音符へ時間順に頭から1対1（配列の並びが時間順でなくても）", () => {
    const notes = [N(2, 1), N(0, 1), N(1, 1)];
    const out = placeMoras(notes, ["あ", "い", "う"], range);
    expect(out.map((n) => n.syllable)).toEqual(["う", "あ", "い"]); // 並びは入力のまま・値は時間順
  });

  it("契約3：音符が余ればメリスマ「ー」", () => {
    const notes = [N(0, 1), N(1, 1), N(2, 1)];
    const out = placeMoras(notes, ["あ"], range);
    expect(out.map((n) => n.syllable)).toEqual(["あ", "ー", "ー"]);
  });

  it("契約3：モーラが余っても音符は増えない・余りはどこにも書かない", () => {
    const notes = [N(0, 1), N(1, 1)];
    const out = placeMoras(notes, ["あ", "い", "う", "え"], range);
    expect(out).toHaveLength(2);
    expect(out.map((n) => n.syllable)).toEqual(["あ", "い"]);
    // flowLyric（音符を作り替える方）との違い＝同じ入力で音符が3つ以上に割れる。
    expect(flowLyric(notes, ["あ", "い", "う", "え"]).length).toBeGreaterThan(2);
  });

  it("モーラが空（読みがまだ無い・読み取り失敗）＝何も書かない＝写しを消さない", () => {
    const notes = [N(0, 1, "旧"), N(1, 1, "い")];
    const out = placeMoras(notes, [], range);
    expect(out.map((n) => n.syllable)).toEqual(["旧", "い"]);
  });

  it("範囲に音符が無ければ全部そのまま", () => {
    const notes = [N(8, 1, "旧")];
    expect(placeMoras(notes, ["あ"], range)).toEqual(notes);
  });

  it("同時刻の音符は元の並び順で頭から", () => {
    const notes = [N(0, 1), N(0, 1), N(1, 1)];
    expect(placeMoras(notes, ["あ", "い", "う"], range).map((n) => n.syllable)).toEqual(["あ", "い", "う"]);
  });
});

describe("notesInRange", () => {
  it("start が [start, start+beats) の音符の添字を時間順で返す", () => {
    const notes = [N(4, 1), N(0, 1), N(-1, 1), N(3.99, 1)];
    expect(notesInRange(notes, { start: 0, beats: 4 })).toEqual([1, 3]);
  });
  it("負の拍（弱起）も範囲に入れられる", () => {
    const notes = [N(-1, 1), N(0, 1)];
    expect(notesInRange(notes, { start: -2, beats: 2 })).toEqual([0]);
  });
  it("beats が 0 以下なら空", () => {
    expect(notesInRange([N(0, 1)], { start: 0, beats: 0 })).toEqual([]);
  });
});

// ── §31-5 言い分け ────────────────────────────────────────────────────────

describe("phraseStatus（字余り／あと／ちょうど／メロが途中／メロなし）", () => {
  const range = { start: 0, beats: 8 };
  const full = [N(0, 2), N(2, 2), N(4, 2), N(6, 2)]; // 範囲を隙間なく埋める4音

  it("メロなし＝範囲に音符が1つも無い（置き場の裁定を待たずに言える）", () => {
    expect(phraseStatus(range, 5, [])).toEqual({ kind: "メロなし" });
    expect(phraseStatus(range, 5, [N(20, 1)])).toEqual({ kind: "メロなし" });
  });

  it("ちょうど＝モーラ数と範囲内の音符数が同じ", () => {
    expect(phraseStatus(range, 4, full)).toEqual({ kind: "ちょうど" });
  });

  it("字余りN＝モーラが余る（機械は詰めない・削らない）", () => {
    expect(phraseStatus(range, 6, full)).toEqual({ kind: "字余り", count: 2 });
  });

  it("あとN＝音符が余る", () => {
    expect(phraseStatus(range, 1, full)).toEqual({ kind: "あと", count: 3 });
  });

  it("メロが途中＝覆われていないひと続きの空きが目盛り以上（一番大きい空きを返す）", () => {
    const half = [N(0, 2), N(2, 2)]; // 4拍目以降が空き4拍
    expect(phraseStatus(range, 2, half)).toEqual({ kind: "メロが途中", gapBeats: 4 });
  });

  it("メロが途中：頭が空いている場合も言う", () => {
    const late = [N(5, 1), N(6, 2)];
    expect(phraseStatus(range, 3, late)).toEqual({ kind: "メロが途中", gapBeats: 5 });
  });

  it("空きが目盛り未満なら「途中」と言わず数を比べる（既定の目盛り＝1小節4拍）", () => {
    expect(DEFAULT_GAP_BEATS).toBe(4);
    const gapped = [N(0, 2), N(2, 2), N(6, 2)]; // 空き2拍＝目盛り未満
    expect(phraseStatus(range, 3, gapped)).toEqual({ kind: "ちょうど" });
  });

  it("目盛りは引数で変えられる（4/4 以外・人が変える余地を塞がない）", () => {
    const gapped = [N(0, 2), N(2, 2), N(6, 2)];
    expect(phraseStatus(range, 3, gapped, { gapBeats: 2 })).toEqual({ kind: "メロが途中", gapBeats: 2 });
  });

  it("空きの合計ではなくひと続きの一番大きい空きで見る", () => {
    // 空き 2拍 + 2拍 = 合計4拍だが、ひと続きは2拍＝「途中」とは言わない。
    const notes = [N(0, 2), N(4, 2)];
    expect(phraseStatus({ start: 0, beats: 8 }, 2, notes, { gapBeats: 3 })).toEqual({ kind: "ちょうど" });
    // 細かい空きが4つ（合計4拍）＝合計で見ると「途中」になってしまう並び。ひと続きは1拍なので言わない。
    const sparse = [N(0, 1), N(2, 1), N(4, 1), N(6, 1), N(8, 1)];
    expect(phraseStatus({ start: 0, beats: 10 }, 5, sparse, { gapBeats: 4 })).toEqual({ kind: "ちょうど" });
  });

  it("範囲をまたぐ長い音符は範囲の外まで覆っているとは数えない（範囲内だけで見る）", () => {
    expect(phraseStatus(range, 1, [N(0, 100)])).toEqual({ kind: "ちょうど" });
  });

  it("重なった音符（和音・同時刻）でも空きの計算が壊れない", () => {
    const chord = [N(0, 4), N(0, 4), N(4, 4)];
    expect(phraseStatus(range, 3, chord)).toEqual({ kind: "ちょうど" });
  });
});

// ── §31-3/§31-6 控えの鮮度と効いている読み ───────────────────────────────────

const reading = (forText: string, kana: string[]): LyricReading => ({
  forText,
  words: [],
  moras: kana.map((k) => ({ kana: k, word: 0 })),
  hl: null,
  breaks: [],
});
const phrase = (over: Partial<LyricPhrase> = {}): LyricPhrase => ({
  id: "p1", start: 0, beats: 8, text: "雨の日は", ...over,
});

describe("控えが古いか／効いている読み", () => {
  it("控えが無ければ古い扱い＝読みは空", () => {
    const p = phrase();
    expect(isReadingStale(p)).toBe(true);
    expect(readingOf(p)).toBeUndefined();
    expect(effectiveReading(p)).toEqual([]);
  });

  it("控えの forText が今の表記と違えば使わない（古い読みが残らない）", () => {
    const p = phrase({ text: "雨の日に", reading: reading("雨の日は", ["あ", "め", "の", "ひ", "わ"]) });
    expect(isReadingStale(p)).toBe(true);
    expect(effectiveReading(p)).toEqual([]);
  });

  it("控えが今の表記のものなら、そのモーラ列が効いている読み", () => {
    const p = phrase({ reading: reading("雨の日は", ["あ", "め", "の", "ひ", "わ"]) });
    expect(isReadingStale(p)).toBe(false);
    expect(effectiveReading(p)).toEqual(["あ", "め", "の", "ひ", "わ"]);
  });

  it("効いている読みをそのまま placeMoras に渡せる（表記の読みで音符が鳴る＝スライス1の芯）", () => {
    const p = phrase({ reading: reading("雨の日は", ["あ", "め", "の", "ひ", "わ"]) });
    const notes = [N(0, 1), N(1, 1), N(2, 1), N(3, 1), N(4, 1)];
    const out = placeMoras(notes, effectiveReading(p), { start: p.start, beats: p.beats });
    expect(out.map((n) => n.syllable)).toEqual(["あ", "め", "の", "ひ", "わ"]);
    // 漢字を1字1音に化かす経路（かな分割関数に表記を渡す）とは違う値になる＝これがスライス1の直し。
    expect(splitMora("雨の日は")).toHaveLength(4);
  });
});

// ── §31-8「っ」「ー」に音符を立てる＝現況の食い違いの記録 ──────────────────────

describe("「っ」「ー」に音符を立てる（裁定＝立てる）", () => {
  it("かな列の分割は っ/ー を1モーラとして立てる（裁定どおり）", () => {
    expect(splitMora("がっこう")).toEqual(["が", "っ", "こ", "う"]);
    expect(splitMora("きゃー")).toEqual(["きゃ", "ー"]);
    expect(analyzeMoras("あっー").map((m) => m.kind)).toEqual(["normal", "sokuon", "long"]);
  });

  it("flowLyric / placeMoras も っ/ー に音符を1つずつ当てる", () => {
    const notes = [N(0, 1), N(1, 1), N(2, 1), N(3, 1)];
    expect(placeMoras(notes, splitMora("がっこう"), { start: 0, beats: 4 }).map((n) => n.syllable))
      .toEqual(["が", "っ", "こ", "う"]);
    expect(flowLyric([N(0, 4)], splitMora("がっこう")).map((n) => n.syllable))
      .toEqual(["が", "っ", "こ", "う"]);
  });

  // 【現況の記録・直さない】詞先メロ生成の音数計画（apps/api/src/music/lyricsPlan.ts:30-32 isOnsetMora）は
  // 長音ー＝延長・促音っ＝休符として**音符を立てない**＝裁定に反する。直すと生成される音符数が変わる＝
  // 出音が変わるのでオーナーの耳が要る（design §31-8・スライス7）。ここでは食い違いの量だけ可視化する。
  it("詞先メロ生成の数え方（normal/ん だけ音符を立てる）との差", () => {
    const isOnset = (kind: string) => kind === "normal" || kind === "hatsuon"; // lyricsPlan.ts:30-32 の写し
    const rows = ["がっこう", "きゃー", "とうきょう", "まっすぐー", "ん"].map((s) => {
      const ms = analyzeMoras(s);
      return { s, mora: ms.length, onset: ms.filter((m) => isOnset(m.kind)).length };
    });
    expect(rows).toEqual([
      { s: "がっこう", mora: 4, onset: 3 },
      { s: "きゃー", mora: 2, onset: 1 },
      { s: "とうきょう", mora: 4, onset: 4 },
      { s: "まっすぐー", mora: 5, onset: 3 },
      { s: "ん", mora: 1, onset: 1 },
    ]);
    // 立てる側（splitMora/flowLyric/placeMoras）の音符数はモーラ数と一致する＝この差がそのまま食い違い。
    for (const r of rows) expect(splitMora(r.s)).toHaveLength(r.mora);
  });
});

// 独立監査（2026-07-29）の食い違い3：`isKanaOnly` は作られたのに画面が呼んでおらず、
// 歌詞ネタの音数表示が漢字混じりの行で嘘を出していた（「雨の日は」に 4／正しくは5）。
// 画面に判断を書かず、出す数と単位をここで決める（design §31-4 の線）。
describe("moraLinesForDisplay（画面に出す数＝音数か文字数か）", () => {
  it("かなだけの行はモーラ数を「音」で出す", () => {
    expect(moraLinesForDisplay("あめのひは")).toEqual([{ line: "あめのひは", n: 5, unit: "音" }]);
  });

  it("拗音は1モーラにまとめる（かなの数え方は splitMora と同じ）", () => {
    expect(moraLinesForDisplay("きょうは")[0]).toEqual({ line: "きょうは", n: 3, unit: "音" });
  });

  it("漢字が混ざる行は音数を出さず文字数を「字」で出す（1字1音の嘘を出さない）", () => {
    const r = moraLinesForDisplay("雨の日は")[0]!;
    expect(r.unit).toBe("字");
    expect(r.n).toBe(4); // 文字数としての4（音数なら5＝この数を「音」として出すのが嘘だった）
  });

  it("行ごとに独立して決める（かなの行と漢字の行が混ざってもよい）", () => {
    expect(moraLinesForDisplay("あめ\n雨").map((m) => m.unit)).toEqual(["音", "字"]);
  });

  it("空行でも落ちない", () => {
    expect(moraLinesForDisplay("")).toEqual([{ line: "", n: 0, unit: "音" }]);
  });
});
