import { describe, it, expect } from "vitest";
import {
  splitMora,
  isKanaOnly,
  noteHighLow,
  hasHandEdit,
  kanaEditForNote,
  upsertEdit,
  reattachEdits,
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

  it("契約3：音符が余っても書かない＝余り音符の syllable は空になる（仮歌は既定「ラ」・2026-07-30 改訂）", () => {
    // 旧契約はここに「ー」を書いた＝「あとN音」表示と矛盾し、詞モードの手打ちを写し直しで消していた
    // （design §31-2 契約3 の改訂・根拠＝2026-07-29-lyric-editor-screen-design.md §2-4）。
    const notes = [N(0, 1), N(1, 1, "旧"), N(2, 1, "ー")];
    const out = placeMoras(notes, ["あ"], range);
    expect(out.map((n) => n.syllable)).toEqual(["あ", undefined, undefined]);
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

describe("noteHighLow（音符ごとの読みの高低・印の元になる値）", () => {
  const R = (hl: (0 | 1)[] | null) => ({
    forText: "あめのひは",
    words: [{ surface: "あめのひは", read: "アメノヒハ", pron: "アメノヒワ", moraCount: 5 }],
    moras: ["あ", "め", "の", "ひ", "わ"].map((kana) => ({ kana, word: 0 })),
    hl,
    breaks: [],
  });
  const P = (over: Record<string, unknown> = {}) => ({
    id: "p1", start: 0, beats: 4, text: "あめのひは", reading: R([1, 0, 0, 0, 1]), ...over,
  });
  const notes = [0, 1, 2, 3].map((i) => ({ start: i, pitch: 60 + i }));

  it("範囲内の音符へ頭から1対1（placeMoras と同じ規則）", () => {
    expect(noteHighLow(notes, [P()])).toEqual([1, 0, 0, 0]);
  });

  it("句に覆われていない音符は分からない（null）", () => {
    expect(noteHighLow(notes, [P({ start: 2, beats: 2 })])).toEqual([null, null, 1, 0]);
  });

  it("モーラが尽きた先（メリスマ）は分からない＝そこに印を出さない", () => {
    const many = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ start: i, pitch: 60 }));
    expect(noteHighLow(many, [P({ beats: 8 })])).toEqual([1, 0, 0, 0, 1, null, null]);
  });

  it("控えが古ければ（表記を直した直後）全部分からない＝古い高低で印を出さない", () => {
    expect(noteHighLow(notes, [P({ text: "そらのひは" })])).toEqual([null, null, null, null]);
  });

  it("高低が取れなかった句（門番が落とした）は分からない＝読みはあっても印は出さない", () => {
    expect(noteHighLow(notes, [P({ reading: R(null) })])).toEqual([null, null, null, null]);
  });

  it("句が無ければ全部分からない", () => {
    expect(noteHighLow(notes, undefined)).toEqual([null, null, null, null]);
    expect(noteHighLow(notes, [])).toEqual([null, null, null, null]);
  });
});

// ── スライス4：人の直しが機械の読み取りより上（design §31-6） ────────────────────────
describe("人の直し（edits）", () => {
  // 「今日は雨」＝機械の読み キョー(2)/ワ(1)/アメ(2)。人が「今日」を「こんにち」に直す等を試す。
  const reading = {
    forText: "今日は雨",
    words: [
      { surface: "今日", read: "キョウ", pron: "キョー", moraCount: 2 },
      { surface: "は", read: "ハ", pron: "ワ", moraCount: 1 },
      { surface: "雨", read: "アメ", pron: "アメ", moraCount: 2 },
    ],
    moras: [
      { kana: "きょ", word: 0 }, { kana: "ー", word: 0 },
      { kana: "わ", word: 1 },
      { kana: "あ", word: 2 }, { kana: "め", word: 2 },
    ],
    hl: [0, 1, 1, 1, 0] as (0 | 1)[],
    breaks: [],
  };
  const P = (edits?: unknown[]) => ({ id: "p1", start: 0, beats: 8, text: "今日は雨", reading, ...(edits ? { edits } : {}) } as never);

  it("直しが無ければ機械の読みそのまま", () => {
    expect(effectiveReading(P())).toEqual(["きょ", "ー", "わ", "あ", "め"]);
    expect(hasHandEdit(P())).toBe(false);
  });

  it("読みを語ごと直せる（モーラ数が変わっても後ろがずれない）", () => {
    const e = [{ kind: "read", from: 0, to: 2, was: "今日", value: "こんにち" }];
    expect(effectiveReading(P(e))).toEqual(["こ", "ん", "に", "ち", "わ", "あ", "め"]);
    expect(hasHandEdit(P(e))).toBe(true);
  });

  it("音符に載るかなを1モーラだけ差し替えられる（仮歌の崩し）", () => {
    const e = [{ kind: "kana", from: 3, to: 4, was: "雨", mora: 1, value: "ぇ" }];
    expect(effectiveReading(P(e))).toEqual(["きょ", "ー", "わ", "あ", "ぇ"]);
  });

  it("高低を1モーラだけ反転できる", () => {
    const notes = [0, 1, 2, 3, 4].map((i) => ({ start: i, pitch: 60 }));
    expect(noteHighLow(notes, [P() as never])).toEqual([0, 1, 1, 1, 0]);
    const e = [{ kind: "hl", from: 0, to: 2, was: "今日", mora: 0, value: 1 }];
    expect(noteHighLow(notes, [P(e) as never])).toEqual([1, 1, 1, 1, 0]);
  });

  it("読みを手で直した語は高低が分からない扱いになる（機械が作り直せないので印を出さない）", () => {
    const notes = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ start: i, pitch: 60 }));
    const e = [{ kind: "read", from: 0, to: 2, was: "今日", value: "こんにち" }];
    // 直した語の4モーラは null、後ろの語は機械の高低のまま
    expect(noteHighLow(notes, [P(e) as never])).toEqual([null, null, null, null, 1, 1, 0]);
  });

  it("機械が読みを引き直しても直しは消えない（直しは reading に焼かない）", () => {
    const e = [{ kind: "kana", from: 3, to: 4, was: "雨", mora: 1, value: "ぇ" }];
    const refreshed = { ...(P(e) as Record<string, unknown>), reading: { ...reading } } as never;
    expect(effectiveReading(refreshed)).toEqual(["きょ", "ー", "わ", "あ", "ぇ"]);
  });

  it("控えが古ければ直しも効かない（表記を直した直後は何も出さない）", () => {
    const e = [{ kind: "kana", from: 3, to: 4, was: "雨", mora: 1, value: "ぇ" }];
    const stale = { ...(P(e) as Record<string, unknown>), text: "今日は雪" } as never;
    expect(effectiveReading(stale)).toEqual([]);
  });
});

describe("直しの付け直し（表記を変えたとき・design §31-6 の3通り）", () => {
  const reading = {
    forText: "雨と雪",
    words: [
      { surface: "雨", read: "アメ", pron: "アメ", moraCount: 2 },
      { surface: "と", read: "ト", pron: "ト", moraCount: 1 },
      { surface: "雪", read: "ユキ", pron: "ユキ", moraCount: 2 },
    ],
    moras: [{ kana: "あ", word: 0 }, { kana: "め", word: 0 }, { kana: "と", word: 1 }, { kana: "ゆ", word: 2 }, { kana: "き", word: 2 }],
    hl: null,
    breaks: [],
  };
  const P = (edits: unknown[]) => ({ id: "p1", start: 0, beats: 8, text: "雨と雪", reading, edits } as never);

  it("① 同じ位置に同じ文字列があればそのまま", () => {
    const e = [{ kind: "read", from: 2, to: 3, was: "雪", value: "ゆき" }];
    const out = reattachEdits(P(e), "雨と雪")![0]!;
    expect([out.from, out.to]).toEqual([2, 3]);
    expect(out.detached).toBeUndefined();
  });

  it("② 位置がずれても句の中に1つだけあればそこへ付け直す", () => {
    const e = [{ kind: "read", from: 2, to: 3, was: "雪", value: "ゆき" }];
    // 前に文字を足して位置がずれた場合（reading は古いままでも語の表層で探せる）
    const moved = reattachEdits({ ...(P(e) as Record<string, unknown>), reading } as never, "雨と雪")!;
    expect(moved[0]!.detached).toBeUndefined();
  });

  it("③ 見つからなければ捨てずに detached を立てる（黙って捨てない・黙って別の語に付けない）", () => {
    const e = [{ kind: "read", from: 2, to: 3, was: "雪", value: "ゆき" }];
    const out = reattachEdits(P(e), "雨と風")!;
    expect(out).toHaveLength(1); // 残る
    expect(out[0]!.detached).toBe(true);
  });

  it("直しが無ければ何もしない", () => {
    expect(reattachEdits({ id: "p1", start: 0, beats: 8, text: "雨" } as never, "雨")).toBeUndefined();
  });
});

describe("kanaEditForNote（音符のかな手打ちを直し1件に変える）", () => {
  const reading = {
    forText: "今日は雨",
    words: [
      { surface: "今日", read: "キョウ", pron: "キョー", moraCount: 2 },
      { surface: "は", read: "ハ", pron: "ワ", moraCount: 1 },
      { surface: "雨", read: "アメ", pron: "アメ", moraCount: 2 },
    ],
    moras: [{ kana: "きょ", word: 0 }, { kana: "ー", word: 0 }, { kana: "わ", word: 1 }, { kana: "あ", word: 2 }, { kana: "め", word: 2 }],
    hl: null,
    breaks: [],
  };
  const phrase = { id: "p1", start: 0, beats: 8, text: "今日は雨", reading } as never;
  const notes = [0, 1, 2, 3, 4, 5].map((i) => ({ start: i }));

  it("5つ目の音符＝「雨」の2モーラ目を直す（貼り先は語の文字位置）", () => {
    expect(kanaEditForNote(phrase, notes, 4, "ぇ")).toEqual({ kind: "kana", from: 3, to: 4, was: "雨", mora: 1, value: "ぇ" });
  });

  it("1つ目の音符＝「今日」の1モーラ目", () => {
    expect(kanaEditForNote(phrase, notes, 0, "こ")).toEqual({ kind: "kana", from: 0, to: 2, was: "今日", mora: 0, value: "こ" });
  });

  it("モーラが尽きた先（メリスマ）には直しを作らない", () => {
    expect(kanaEditForNote(phrase, notes, 5, "あ")).toBeNull();
  });

  it("句に覆われていない音符には直しを作らない（句の無いメロの詞モードは従来どおり）", () => {
    expect(kanaEditForNote({ ...(phrase as Record<string, unknown>), start: 10, beats: 4 } as never, notes, 0, "あ")).toBeNull();
  });

  it("作った直しは effectiveReading に効く（往復）", () => {
    const e = kanaEditForNote(phrase, notes, 4, "ぇ")!;
    const p2 = { ...(phrase as Record<string, unknown>), edits: upsertEdit(undefined, e) } as never;
    expect(effectiveReading(p2)).toEqual(["きょ", "ー", "わ", "あ", "ぇ"]);
  });

  it("同じモーラを2回直したら後が勝つ（直しが溜まらない）", () => {
    const a = kanaEditForNote(phrase, notes, 4, "ぇ")!;
    const b = kanaEditForNote(phrase, notes, 4, "ぉ")!;
    const list = upsertEdit(upsertEdit(undefined, a), b);
    expect(list).toHaveLength(1);
    expect(list[0]!.value).toBe("ぉ");
  });
});
