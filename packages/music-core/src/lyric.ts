// @cm/music-core — 歌詞（句）のデータの形と、音符へ読みを写す純関数（design #31 スライス1〜3）。
//
// ⚠ 上位の設計（docs/design.md #31・docs/requirements.md「歌詞を書く」・docs/architecture.md 2026-07-29 追記）は
//    **オーナーのレビューを受けていない**。留保つきで先行している段階。
//    ただし歌詞の置き場は **2026-07-30 のオーナー裁定で確定**＝案(い)（人が合図して空のメロを置きそこに書く）＋
//    (い-c)（空のうちは実体を作らず、句を書いた瞬間に作って置く）。本ファイルが持つのは「句の形」と
//    「範囲・モーラ列・音符列だけを見る純関数」なので、この裁定でも中身は変わらない（design §31-0 の検算どおり）。
//
// 芯（design §31-0）：
//  ・歌詞の正データ＝句（漢字仮名交じりの普通の文章）。メロネタの content.lyric に持つ。
//  ・Note.syllable は仮歌のための写しであって歌詞の本体ではない。
//  ・正の規則は1行＝「句の範囲にある音符では句の読みが正／どの句にも覆われていない音符では Note.syllable が正」。
//    ＝既存のかな入力の口を1つも殺さない（後退ゼロ）。
//
// music-core の憲章どおり、ここに置くのは純データと純関数だけ（DB/Fastify/Tone/MCP には触らない）。
// 読み取り（漢字仮名交じり→かな）は pyopenjtalk＝api 側の仕事で、ここには持ち込まない。

import { analyzeMoras } from "./prosody";

// ── §1 句のデータの形（design §31-1） ───────────────────────────────────────

/** メロネタの content.lyric に入る層。句の並びだけを持つ。 */
export interface LyricLayer {
  phrases: LyricPhrase[];
}

/**
 * 句＝歌詞のひとかたまり。表記（漢字仮名交じり）が正データで、かな・高低・音符への割付は
 * 表記から機械が導く。人はいつでも上書きできる（edits・design §31-6＝スライス4）。
 */
export interface LyricPhrase {
  id: string;        // 札。表記を直しても直し・割付が剥がれないための不変キー
  start: number;     // 開始拍（このメロの中の拍。弱起の負拍も可）
  beats: number;     // 拍数。既定＝そのメロの尺（design §31-0）。人が切れば分かれる
  text: string;      // 表記＝正データ（漢字仮名交じり。改行可。穴は「＿」1個以上）
  memo?: string;     // 人が書く意味メモ（機械は書かない）
  plan?: { moras?: number; bars?: number; note?: string };  // 予定（すべて任意）
  reading?: LyricReading;   // 機械の読みの控え
  edits?: LyricEdit[];      // 人の直し（design §31-6・スライス4で効かせる）
  source?: { netaId: string; line: number };  // 写し元（lyric ネタから写したとき機械が記録・任意）
  // 割付（モーラ→音符）は最初は保存しない＝省略時「範囲内の音符へ頭から1対1」。
  // 手でずらす・自動符割りを足すときは alloc?: を足すだけ＝データの入れ直しは要らない。
}

/** 機械が取った読みの控え（api の /music/reading 由来）。 */
export interface LyricReading {
  forText: string;   // 控えたときの表記。今の text と違えば控えは使わない＝古い読みが残らない
  words: { surface: string; read: string; pron: string; moraCount: number }[]; // 語の列
  moras: { kana: string; word: number }[];  // pron 由来のモーラ列（「’」除去済み）。word=-1＝語の対応が取れない区間
  hl: (0 | 1)[] | null;   // モーラごとの高低。門番で不一致なら null＝読みは出すが高低は出さない
  breaks: number[];       // 読みの句の切れ目（モーラ添字）
}

/**
 * 人の直し（design §31-6・効かせるのはスライス4）。
 * 貼り先は「文字位置＋そのときの文字列」＝並び順の番号は使わない（表記を直すと全部ずれるため）。
 */
export interface LyricEdit {
  kind: "read" | "hl" | "kana";  // 読み（語単位）／高低（モーラ単位）／音符に載るかな（モーラ単位＝仮歌の崩し）
  from: number; to: number;      // 貼り先＝直した時点の表記の何文字目〜何文字目
  was: string;                   // そのときそこにあった文字列
  mora?: number;                 // hl / kana：その語の中で何番目のモーラか
  value: string | 0 | 1;
  detached?: true;               // 付け先が分からなくなった＝人に見せて「付け直す／捨てる」
}

/** 句の範囲（このメロの中の拍）。 */
export interface PhraseRange {
  start: number;
  beats: number;
}

// ── §2 かな列の分割（design §31-4「かな列の分割の正 ＝ analyzeMoras 1本」） ──────────
//
// もとは web `lyrics.ts` と api `lyric.ts` に**同じ splitMora が2本**あり、さらに music-core の
// analyzeMoras と合わせて数え方が3系統に散っていた。ここでは analyzeMoras 1本を正とし、
// splitMora はその薄い皮に置き換える（拗音は直前と結合して1モーラ・ー/っ/ん はそれぞれ1モーラ）。
//
// **線＝「かな分割関数に漢字を含む文字列を渡さない」**（design §31-4）。漢字は1字1音に化ける。
// 表記（漢字仮名交じり）のモーラ数の正は pyopenjtalk＝api 側で、ここでは扱わない。

/** かな列 → モーラ片の配列。analyzeMoras の薄い皮（数え方の正は analyzeMoras 1本）。 */
export function splitMora(kana: string): string[] {
  return analyzeMoras(kana).map((m) => m.kana);
}

// かな（＋長音記号・空白）だけでできているか。ひらがな/カタカナ/ー/〜/ｰ と空白のみ true。
// 漢字・英数・記号（、。等）が混ざれば false＝この文字列にモーラ数を出すと嘘になる。
const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー〜ｰ\s]*$/u;

/** その文字列がかな（＋長音記号・空白）だけでできているか。 */
export function isKanaOnly(text: string): boolean {
  return KANA_ONLY.test(text);
}

/**
 * 行ごとのモーラ数え（歌詞ネタ画面の音数表示）。返す形は移動前と同じ（呼び側・既存テストを変えない）。
 *
 * ⚠ **かな以外が混ざる行の count は信用できない**（漢字が1字1音に化ける）。
 *    画面はその行の音数を出さず「〜文字」に落とすこと＝判定は `isKanaOnly(line)`（design §31-4 の線）。
 *    画面側の出し分けは web の担当（このスライスでは関数を用意するところまで）。
 */
export function moraLines(text: string): { line: string; count: number }[] {
  return text.split("\n").map((line) => ({ line, count: splitMora(line).length }));
}

/**
 * 画面に出す行ごとの数（§31-4 の線をここで引く＝画面側に判断を書かない）。
 * かなだけの行＝モーラ数を「音」で出す。かな以外が混ざる行＝**音数は数えられない**ので文字数を「字」で出す。
 * （漢字は `splitMora` が1字1音に数える＝「雨の日は」が4になる。読みを取って正しい音数を出すのはメロ側の句の仕事。）
 */
export function moraLinesForDisplay(text: string): { line: string; n: number; unit: "音" | "字" }[] {
  return text.split("\n").map((line) =>
    isKanaOnly(line)
      ? { line, n: splitMora(line).length, unit: "音" as const }
      : { line, n: [...line].length, unit: "字" as const },
  );
}

// ── §3 音符を作り替えて流し込む（既存の flowLyric・挙動は変えない） ──────────────
//
// もとは web `lyrics.ts:34` と api `lyric.ts:37` に**同じものが2本**あった。ここへ移して1本にする
// （web/api は re-export＝呼び側の import は変わらない・挙動も変えない）。
// **この関数は音符を作り替える**（モーラが多ければ音符を割る）＝人が「合わせる」と言ったときだけ走らせる。
// 詞を打っただけで音符が割れてはいけない。読みを写すだけなら placeMoras（下）を使う。

const MORA_FLOOR = 0.25; // 16分。これ以上は音符を分割しない
const MELISMA = "ー";    // 母音継続（sing.ts と PianoRoll がこの文字を読む）。flowLyric の余り音符にだけ使う（placeMoras は書かない＝§31-2 契約3）

/** flowLyric / placeMoras が触る音符の最小形（pitch 等の他フィールドは素通し）。 */
export interface LyricNoteLike {
  start: number;
  dur: number;
  syllable?: string;
}

/**
 * 歌詞(モーラ列)をメロ(notes)に1:1で流し込み、syllable を埋める。純関数（入力は破壊しない）。
 * モーラ>音符＝一番長い音符を半分に分割して枠を増やす（下限16分）。モーラ<音符＝余りはメリスマ「ー」。
 * これ以上割れず音符<モーラなら、残りのモーラを最後の音符に連結する。
 * 返りは start 昇順に並べ替わる（元の並び順は保たない）＝旧 web/api 実装と同じ挙動。
 */
export function flowLyric<T extends LyricNoteLike>(notes: readonly T[], moras: readonly string[], floor = MORA_FLOOR): T[] {
  if (!notes.length || !moras.length) return notes.map((n) => ({ ...n }));
  const work: T[] = notes.map((n) => ({ ...n })).sort((a, b) => a.start - b.start);
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

  // 割当：先頭から1:1。余った音符（音符>モーラ）はメリスマ「ー」。
  const out = work.map((n, i) => ({ ...n, syllable: i < M ? moras[i]! : MELISMA }) as T);
  // モーラが余った（これ以上割れず音符<モーラ）→残りを最後の音符に連結。
  if (work.length < M) {
    const last = out[out.length - 1]!;
    last.syllable = (last.syllable ?? "") + moras.slice(work.length).join("");
  }
  return out;
}

// ── §4 音符を変えずに読みを音符へ写す（design §31-2 placeMoras） ─────────────────

/**
 * 範囲に入る音符の添字を、時間順（start 昇順・同時刻は元の並び順）で返す。
 * 範囲＝`range.start <= note.start < range.start + range.beats`（design §31-1）。
 */
export function notesInRange<T extends { start: number }>(notes: readonly T[], range: PhraseRange): number[] {
  const end = range.start + range.beats;
  const idx: number[] = [];
  for (let i = 0; i < notes.length; i++) {
    const s = notes[i]!.start;
    if (s >= range.start && s < end) idx.push(i);
  }
  return idx.sort((a, b) => notes[a]!.start - notes[b]!.start || a - b);
}

/**
 * 読み（モーラ列）を範囲内の音符へ頭から1対1で写す。**音符は1つも増えも減りもしない。**
 *
 * 契約（テストで縛る・design §31-2）：
 *  1. 純関数・非破壊。返りから syllable を取り除くと入力と完全一致（数・順序・start・dur・pitch・vel）。
 *  2. 範囲外の音符は syllable も含めて一切触らない（他の句・手打ちかなを壊さない）。
 *  3. 範囲内の音符へ頭から1対1。**音符が余っても書かない＝余り音符の syllable は空にする**（かなが空の
 *     音符は仮歌の既定「ラ」で鳴る＝sing.ts の DEFAULT_MORA・2026-07-29 オーナー裁定）。**モーラが余れば
 *     書かない＝音符は増えない。** 余りの数はここでは言わない（言い分けは phraseStatus が別に言う）。
 *     旧契約（余り音符に「ー」を自動で書く）は 2026-07-30 に廃止＝「あとN音」表示と矛盾し、
 *     詞モードの手打ちかなを写し直しで消していた（design §31-2 契約3 改訂）。
 *  4. 導出（表記→モーラ）／割付（この関数）／音符の作り替え（flowLyric）は別の段。
 *
 * moras が空＝読みがまだ無い（読み取り失敗を含む）とみなし、**何も書かない**（写しを消さない）。
 */
export function placeMoras<T extends { start: number; syllable?: string }>(
  notes: readonly T[],
  moras: readonly string[],
  range: PhraseRange,
): T[] {
  const out = notes.map((n) => ({ ...n })) as T[];
  if (!moras.length) return out;
  const order = notesInRange(notes, range);
  for (let i = 0; i < order.length; i++) {
    const ni = order[i]!;
    const nn = { ...out[ni]! } as T;
    if (i < moras.length) nn.syllable = moras[i]!;
    else delete (nn as { syllable?: string }).syllable; // 余り音符には書かない（契約3・仮歌は既定「ラ」）
    out[ni] = nn;
  }
  return out;
}

/**
 * 音符ごとの読みの高低（0=低・1=高・null=分からない）。**印（赤黄）の元になる値**（design §31-3）。
 *
 * 割付は `placeMoras` と同じ規則＝範囲内の音符へ頭から1対1。ここがずれると、
 * 音符に載っているかなと、その音符に当てる高低が食い違う（＝嘘の印が出る）ので、
 * **必ず `notesInRange` を通す**（1対1の規則をこの1本に閉じ込める）。
 *
 * null を返すのは「分からない」＝ 句に覆われていない音符／控えが古い／高低が取れなかった（門番が落とした）／
 * モーラが尽きた先（メリスマ）。**分からない所では印を出さない**＝機械が黙って断定しないため。
 */
export function noteHighLow<T extends { start: number }>(
  notes: readonly T[],
  phrases: readonly LyricPhrase[] | undefined,
): (0 | 1 | null)[] {
  const out: (0 | 1 | null)[] = notes.map(() => null);
  for (const p of phrases ?? []) {
    const r = readingOf(p); // 控えが古ければ undefined＝この句は分からない扱い
    if (!r) continue;
    // 人の直しを重ねた高低（読みを直した語は「分からない」・高低を直したモーラはその値）。
    // 語に属さないモーラの位置は effectiveReading と同じ組み方で揃える必要があるが、
    // 高低は語単位でしか分からないので、語の並びぶんだけを順に並べる（余りは null）。
    const info = effectiveWordInfo(p, r);
    const hl: (0 | 1 | null)[] = info.flatMap((w) => w.hl);
    if (!hl.length) continue;
    const order = notesInRange(notes, { start: p.start, beats: p.beats });
    for (let i = 0; i < order.length; i++) out[order[i]!] = i < hl.length ? hl[i]! : null;
  }
  return out;
}

// ── §5 字余りとメロが途中の言い分け（design §31-5 phraseStatus） ────────────────

/**
 * 句と音符の関係の言い分け。UI に出す言葉もこの語彙をそのまま使う（比喩・造語を作らない）。
 * 「メロなし」は音符を持つメロを開いている間はほぼ出ないが、**最初から入れておく**＝
 * 歌詞の置き場の裁定がどちらに転んでも（曲持ちの句／空メロ）この関数がそのまま言える。
 */
export type PhraseStatus =
  | { kind: "メロなし" }                     // 範囲に音符が1つも無い
  | { kind: "メロが途中"; gapBeats: number } // 範囲のうち音符が覆っていない空きが目盛り以上
  | { kind: "字余り"; count: number }        // 音符が範囲を埋めていて、モーラが余る
  | { kind: "あと"; count: number }          // 音符が範囲を埋めていて、音符が余る
  | { kind: "ちょうど" };

/** 「メロが途中」と言う空きの既定＝1小節ぶんの拍。4/4 以外の呼び側は opts.gapBeats で渡す。 */
export const DEFAULT_GAP_BEATS = 4;

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * 句の言い分け。入力は（範囲・モーラ数・音符列）だけ＝句がどのネタにあるかを知らない。
 *
 * ・音符が1つも無い→「メロなし」。
 * ・範囲のうち音符が覆っていない**ひと続きの空き**が gapBeats 以上→「メロが途中」（一番大きい空きを返す）。
 * ・そうでなければモーラ数と範囲内の音符数を比べて「字余りN／あとN／ちょうど」。
 *
 * **機械は詰めない・削らない・止めない。** 直すのは人（表記を変える／メロを変える／「合わせる」を押す）。
 */
export function phraseStatus<T extends LyricNoteLike>(
  range: PhraseRange,
  moraCount: number,
  notes: readonly T[],
  opts: { gapBeats?: number } = {},
): PhraseStatus {
  const idx = notesInRange(notes, range);
  if (!idx.length) return { kind: "メロなし" };

  const gapLimit = opts.gapBeats ?? DEFAULT_GAP_BEATS;
  const end = range.start + range.beats;
  let cursor = range.start;
  let maxGap = 0;
  for (const i of idx) {
    const n = notes[i]!;
    const s = Math.max(n.start, range.start);
    const e = Math.min(n.start + n.dur, end);
    if (e <= s) continue; // 長さ0以下＝覆わない
    if (s > cursor) maxGap = Math.max(maxGap, s - cursor);
    if (e > cursor) cursor = e;
  }
  if (end > cursor) maxGap = Math.max(maxGap, end - cursor);
  if (maxGap >= gapLimit - 1e-9) return { kind: "メロが途中", gapBeats: r3(maxGap) };

  const diff = moraCount - idx.length;
  if (diff > 0) return { kind: "字余り", count: diff };
  if (diff < 0) return { kind: "あと", count: -diff };
  return { kind: "ちょうど" };
}

// ── §6 控えが古いか／効いている読み（design §31-3 の控え・§31-6 の口） ──────────────

/** 控えが今の表記のものでないか（表記を直したのに読みを引き直していない）。控えが無ければ古い扱い。 */
export function isReadingStale(phrase: LyricPhrase): boolean {
  return !phrase.reading || phrase.reading.forText !== phrase.text;
}

/** 今の表記に対して使ってよい控え。古ければ undefined＝印も高低も出さない。 */
export function readingOf(phrase: LyricPhrase): LyricReading | undefined {
  return isReadingStale(phrase) ? undefined : phrase.reading;
}

/**
 * 効いている読み（モーラのかな列）＝placeMoras・仮歌が読む値。控えが古ければ空。
 *
 * **人の直しが機械の読み取りより上**（architecture 2026-07-29・design §31-6）。
 * 機械が読みを引き直しても直しは消えない＝直しは reading に焼かず、ここで重ねる。
 *  ・kind:"read"（語単位）＝その語のモーラ列を、直した読みを割り直したもので置き換える。
 *  ・kind:"kana"（モーラ単位）＝その1モーラだけ差し替える（仮歌の崩し「思いわ」等）。
 * 語のモーラ数が変わりうるので、必ず語の順に組み直す（添字の付け替えを呼び側にさせない）。
 */
export function effectiveReading(phrase: LyricPhrase): string[] {
  const r = readingOf(phrase);
  if (!r) return [];
  const live = liveEdits(phrase, r);
  if (!live.length) return r.moras.map((m) => m.kana);

  const byWord = morasByWord(r);
  const readOf = new Map<number, string>();     // 語番号 → 直した読み
  const kanaOf = new Map<string, string>();     // `語番号:モーラ番号` → 直したかな
  for (const { edit, word } of live) {
    if (edit.kind === "read" && typeof edit.value === "string") readOf.set(word, edit.value);
    if (edit.kind === "kana" && typeof edit.value === "string" && edit.mora != null) kanaOf.set(`${word}:${edit.mora}`, edit.value);
  }

  const out: string[] = [];
  // 語に属さないモーラ（word=-1）は元の位置のまま残す＝語の切れ目が取れない区間を落とさない。
  const orphan = r.moras.map((m, i) => (m.word < 0 ? i : -1)).filter((i) => i >= 0);
  let orphanAt = 0;
  const flush = (before: number) => {
    while (orphanAt < orphan.length && orphan[orphanAt]! < before) {
      const at = orphan[orphanAt++]!;
      out.push(r.moras[at]!.kana);
    }
  };
  for (let w = 0; w < r.words.length; w++) {
    const idx = byWord[w] ?? [];
    flush(idx.length ? idx[0]! : Number.MAX_SAFE_INTEGER);
    const replaced = readOf.get(w);
    const base = replaced != null ? splitMora(replaced) : idx.map((i) => r.moras[i]!.kana);
    base.forEach((kana, mi) => out.push(kanaOf.get(`${w}:${mi}`) ?? kana));
  }
  flush(Number.MAX_SAFE_INTEGER);
  return out;
}

/**
 * 語ごとの「効いているモーラ数」と「高低が分かるか」。noteHighLow が使う（design §31-6）。
 * 読みを手で直した語は、機械がその語の高低を作り直せない＝**高低は分からない**（印を出さない）。
 */
function effectiveWordInfo(phrase: LyricPhrase, r: LyricReading): { count: number; hl: (0 | 1 | null)[] }[] {
  const live = liveEdits(phrase, r);
  const byWord = morasByWord(r);
  const readOf = new Map<number, string>();
  const hlOf = new Map<string, 0 | 1>();
  for (const { edit, word } of live) {
    if (edit.kind === "read" && typeof edit.value === "string") readOf.set(word, edit.value);
    if (edit.kind === "hl" && (edit.value === 0 || edit.value === 1) && edit.mora != null) hlOf.set(`${word}:${edit.mora}`, edit.value);
  }
  return r.words.map((_w, i) => {
    const idx = byWord[i] ?? [];
    const replaced = readOf.get(i);
    const count = replaced != null ? splitMora(replaced).length : idx.length;
    const hl: (0 | 1 | null)[] = [];
    for (let m = 0; m < count; m++) {
      const hand = hlOf.get(`${i}:${m}`);
      if (hand != null) { hl.push(hand); continue; }
      // 読みを手で直した語は機械の高低を当てられない＝分からない（§31-11 の裁定待ち7の当面の形）
      hl.push(replaced != null ? null : (r.hl?.[idx[m] ?? -1] ?? null));
    }
    return { count, hl };
  });
}

// ── §7 人の直し（design §31-6 スライス4） ───────────────────────────────────────
//
// 芯＝**機械の値と人の直しを別々に持ち、効いている値は「機械の読み＋人の直し」で導く**。
// 直しを読みそのものへ焼くと、表記を直して読みを引き直したときに人の直しが消える。
// architecture「人の手直しが機械の読み取りより上」の実装。

/** 語の並びを表記の文字位置へ当てる。見つからない語は null（表層が表記と揃わない場合＝空白/記号の食い違い）。 */
export function wordSpans(text: string, words: readonly { surface: string }[]): ({ from: number; to: number } | null)[] {
  let cursor = 0;
  return words.map((w) => {
    if (!w.surface) return null;
    const at = text.indexOf(w.surface, cursor);
    if (at < 0) return null;
    cursor = at + w.surface.length;
    return { from: at, to: at + w.surface.length };
  });
}

/**
 * 直しの貼り先＝語の番号を決める（design §31-6 の付け直し3通り）。
 *  ① 同じ位置に同じ文字列がある → そのまま
 *  ② 位置はずれたが、句の中にその文字列がちょうど1つだけある → そこへ
 *  ③ 見つからない・2つ以上ある → null（＝人に見せる。**黙って捨てない・黙って別の語に付けない**）
 */
export function resolveEditWord(
  text: string,
  spans: readonly ({ from: number; to: number } | null)[],
  edit: LyricEdit,
): number | null {
  const exact = spans.findIndex((s) => s && s.from === edit.from && s.to === edit.to && text.slice(s.from, s.to) === edit.was);
  if (exact >= 0) return exact;
  const hits = spans
    .map((s, i) => (s && text.slice(s.from, s.to) === edit.was ? i : -1))
    .filter((i) => i >= 0);
  return hits.length === 1 ? hits[0]! : null;
}

/**
 * 表記を直したあと、直しの貼り先を付け直す（純関数）。付かなかった直しには `detached` を立てて**残す**。
 * 既に detached の直しは、付け先が復活すれば付き直る（人が表記を戻した場合）。
 */
export function reattachEdits(phrase: LyricPhrase, text: string): LyricEdit[] | undefined {
  const edits = phrase.edits;
  if (!edits?.length) return edits;
  const words = phrase.reading?.words ?? [];
  const spans = wordSpans(text, words);
  const next = edits.map((e) => {
    const wi = resolveEditWord(text, spans, e);
    if (wi == null) return { ...e, detached: true as const };
    const s = spans[wi]!;
    const { detached: _drop, ...rest } = e;
    return { ...rest, from: s.from, to: s.to };
  });
  return next;
}

/** 語ごとのモーラ添字の並び（reading.moras の word 欄から作る）。 */
function morasByWord(r: LyricReading): number[][] {
  const out: number[][] = r.words.map(() => []);
  r.moras.forEach((m, i) => { if (m.word >= 0 && m.word < out.length) out[m.word]!.push(i); });
  return out;
}

/** 効いている直しだけを、語番号つきで取り出す（detached と付け先不明は落とす）。 */
function liveEdits(phrase: LyricPhrase, r: LyricReading): { edit: LyricEdit; word: number }[] {
  const spans = wordSpans(phrase.text, r.words);
  const out: { edit: LyricEdit; word: number }[] = [];
  for (const e of phrase.edits ?? []) {
    if (e.detached) continue;
    const wi = resolveEditWord(phrase.text, spans, e);
    if (wi != null) out.push({ edit: e, word: wi });
  }
  return out;
}

/** この句で人の直しが1つでも効いているか（出所表示＝design §31-3(e) の accentSource:"hand"）。 */
export function hasHandEdit(phrase: LyricPhrase): boolean {
  const r = readingOf(phrase);
  return !!r && liveEdits(phrase, r).length > 0;
}

/**
 * 「この音符に載るかなを、この文字にしたい」を人の直し1件に変える（design §31-6 の最後の項）。
 *
 * 音符→モーラは placeMoras と同じ1対1、モーラ→語は控えの word 欄で辿る。
 * 語の切れ目が取れない区間（word=-1）や、モーラが尽きた先（メリスマ）には直しを作れない＝null。
 * 呼び側（画面）は null なら従来どおり `Note.syllable` へ直書きする＝句の無いメロの詞モードは変わらない。
 */
export function kanaEditForNote<T extends { start: number }>(
  phrase: LyricPhrase,
  notes: readonly T[],
  noteIdx: number,
  kana: string,
): LyricEdit | null {
  const r = readingOf(phrase);
  if (!r) return null;
  const order = notesInRange(notes, { start: phrase.start, beats: phrase.beats });
  const at = order.indexOf(noteIdx);
  if (at < 0) return null; // この句に覆われていない音符

  // 効いている読みの並びで数える（読みを直した語があるとモーラ数が変わるため）。
  const info = effectiveWordInfo(phrase, r);
  let cursor = 0;
  for (let w = 0; w < info.length; w++) {
    const n = info[w]!.count;
    if (at < cursor + n) {
      const span = wordSpans(phrase.text, r.words)[w];
      if (!span) return null; // 語を表記の上に置けない＝貼り先を作れない
      return { kind: "kana", from: span.from, to: span.to, was: phrase.text.slice(span.from, span.to), mora: at - cursor, value: kana };
    }
    cursor += n;
  }
  return null; // モーラが尽きた先（メリスマ）
}

/** 同じ貼り先の古い直しを落として1件足す（同じモーラを2回直したら後が勝つ）。 */
export function upsertEdit(edits: readonly LyricEdit[] | undefined, add: LyricEdit): LyricEdit[] {
  const same = (e: LyricEdit) => e.kind === add.kind && e.from === add.from && e.to === add.to && e.mora === add.mora;
  return [...(edits ?? []).filter((e) => !same(e)), add];
}
