// W-K1 アクセント自動注入：apps/audio/accent.py（pyopenjtalk）を叩いて日本語アクセント核を取り、
// analyzeLyricFit(opts.accents) へ供給する薄い spawn ヘルパ。audio-analyze.ts の run() と同型
// （detached spawn＋timeout＋abort でプロセスグループ kill＋stdout から JSON 抽出）。
// 正典＝docs/research/2026-07-15-kariuta-accent-feasibility.md（L3・spawn 0.13〜0.23秒/回＝都度起動で十分）。
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { analyzeMoras, type AccentEntry, type LyricReading } from "@cm/music-core";

const REPO = resolve(import.meta.dirname, "../../.."); // apps/api/src → リポジトリルート
// 呼ぶたびに env を読む（読み込み時に固定しない）＝差し替えて失敗の道を試せるようにするため。
const pyBin = () => process.env.CM_ACCENT_PY ?? join(REPO, "apps/audio/.venv/bin/python");
const scriptPath = () => process.env.CM_ACCENT_SCRIPT ?? join(REPO, "apps/audio/accent.py");

// accent.py の1文ぶんの出力（phrases＝アクセント句ごとの {moras数, kernel核位置}）。
export interface AccentPhrase { moras: number; kernel: number }
/** accent.py が返す語（run_frontend 由来・未加工）。 */
export interface AccentWord { surface: string; read: string; pron: string; mora_size: number; pos: string }
export interface AccentResult {
  text: string;
  phrases: AccentPhrase[];
  mora_total: number;
  hl?: number[];
  words?: AccentWord[];
  error?: string;
}

// 子プロセスを spawn し stdout を集める（audio-analyze.ts run と同型）。timeout / abort で detached グループごと kill。
// `stdin` を渡すとそれを書いて閉じる（＝複数文をまとめて1回で解かせる口。design #31-3(b)）。
function run(cmd: string, args: string[], timeoutMs: number, signal?: AbortSignal, stdin?: string): Promise<string> {
  return new Promise((res, rej) => {
    if (signal?.aborted) return rej(new Error("停止しました"));
    const proc = spawn(cmd, args, { detached: true });
    if (stdin !== undefined) {
      proc.stdin.on("error", () => {}); // 相手が先に死んだ時の EPIPE で落ちない（close の code で判る）
      proc.stdin.end(stdin);
    }
    let out = "", err = "", done = false;
    const killGroup = () => {
      try { if (proc.pid) process.kill(-proc.pid, "SIGKILL"); } catch { proc.kill("SIGKILL"); }
    };
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const t = setTimeout(() => { killGroup(); finish(() => rej(new Error(`${cmd} timeout`))); }, timeoutMs);
    const onAbort = () => { killGroup(); finish(() => rej(new Error("停止しました"))); };
    signal?.addEventListener("abort", onAbort, { once: true });
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += String(d).slice(0, 2000)));
    proc.on("error", (e) => finish(() => rej(e)));
    proc.on("close", (code) => finish(() => (code === 0 ? res(out) : rej(new Error(`${cmd} failed (${code}): ${err.trim().slice(0, 300)}`)))));
  });
}

/** テキスト（かな/漢字混在可）→ アクセント句ごとの核情報。失敗時は投げる（呼び側で fallback）。 */
export async function extractAccents(text: string, signal?: AbortSignal): Promise<AccentResult> {
  const out = await run(pyBin(), [scriptPath(), text], 10_000, signal); // 軽い＝10秒で十分
  const arr = parseAccentJson(out);
  const r = arr[0];
  if (!r) throw new Error("accent.py: 空の結果");
  return r;
}

/** accent.py の stdout から JSON 配列を取り出す（警告が stdout に混じっても拾えるように前後を切る）。 */
function parseAccentJson(out: string): AccentResult[] {
  const s = out.indexOf("["), e = out.lastIndexOf("]");
  if (s < 0 || e <= s) throw new Error("accent.py: JSON が取れませんでした");
  return JSON.parse(out.slice(s, e + 1)) as AccentResult[];
}

/**
 * アクセント句境界に沿って syllables を切り、各句の kana を再結合して {kana, kernel} にする（純関数）。
 * analyzeMoras(kana).length が phrase.moras と一致することを保証（round-trip）。
 * pyopenjtalk のモーラ総数が syllable 数と食い違う／エラー／空 の時は null＝呼び側は内蔵ヒューリスティックへ fallback。
 */
export function mapAccents(syllables: string[], r: AccentResult): AccentEntry[] | null {
  if (r.error || !r.phrases.length) return null;
  const total = r.phrases.reduce((s, p) => s + p.moras, 0);
  if (total !== syllables.length) return null; // モーラ数不一致＝安全側に倒して fallback
  const accents: AccentEntry[] = [];
  let i = 0;
  for (const p of r.phrases) {
    accents.push({ kana: syllables.slice(i, i + p.moras).join(""), kernel: p.kernel });
    i += p.moras;
  }
  return accents;
}

/**
 * 音符に載った syllable 列（モーラ片）から accents（語ごと核位置）を組む。accent.py を spawn し mapAccents で整形。
 * 失敗（未導入/モーラ数不一致/spawn失敗）は null を返す＝呼び側は内蔵ヒューリスティックへ graceful fallback。
 */
export async function accentsFromSyllables(syllables: string[], signal?: AbortSignal): Promise<AccentEntry[] | null> {
  const kana = syllables.join("");
  if (!kana) return null;
  const r = await extractAccents(kana, signal);
  return mapAccents(syllables, r);
}

// ══ #31 スライス1：表記（漢字仮名交じり）から読みを取る（design §31-3・⚠オーナー未レビュー） ══
//
// 上の `accentsFromSyllables` が **音符に載ったかなを連結して** pyopenjtalk に渡す道。実測30行で
// アクセント句の割れ方が 30/30行変わり、高低は 139/284モーラ＝**48.9% 反転**した。しかもモーラの総数は
// 一致するので `mapAccents` は null を返さず、**誤った高低が誰にも気づかれずに通る**。
// ＝入力源を表記に改める。ここから下がその道。上の道は当面そのまま残す（既存の呼び側を止めない）。
//
// 3つの決め：
//  (1) **必ずまとめて1回**で解く。1回あたりの時間のほとんどは Python の起動と辞書読み込み
//      （実測 2026-07-29・40文：まとめて 0.13秒／1文ずつ40回 3.21秒＝約24倍）。
//  (2) accent.py は **1行1文**しか受けられないので、句の表記を「行」と「穴」で断片に割って渡し、返りを句へ組み戻す。
//  (3) **門番2つ**（下）。合わないときは黙って通さない＝読みは出すが高低は出さない。

/** 表記の上限（http の門番と共用＝2箇所に散らさない）。通しの面でも曲1本はこれで足りる。 */
export const READING_MAX_TEXTS = 200;
export const READING_MAX_CHARS = 20_000;

/** 句1つぶんの読み（music-core の `LyricReading` から `forText` を抜いた形＝控える側が付ける）。 */
export type ReadingResult = Omit<LyricReading, "forText"> & { error?: string };

const HOLE = /＿+/;              // 穴＝「＿」1個以上（design §31-3(b)）
const DEVOICE = /’/g;            // 無声化の印。読みにも仮歌にも要らないので落とす
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufeff]/g; // 改行以外の制御文字＝1行1文の約束を壊すので落とす
const NOT_KANA = /[^\p{Script=Hiragana}\p{Script=Katakana}ーｰ]/gu;

/** カタカナ1文字→ひらがな（analyzeMoras の toHira と同じ範囲）。 */
const toHira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCodePoint(c.codePointAt(0)! - 0x60));

/**
 * 句の表記 → accent.py へ渡す断片。改行と穴（＿1個以上）で割り、空の断片は送らない。
 * accent.py が 1行1文で読む（`for l in sys.stdin`）ため、断片に改行を残さないことがこの関数の責任。
 */
export function splitFragments(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.split(HOLE))
    .map((f) => f.replace(CONTROL, "").trim())
    .filter((f) => f.length > 0);
}

/**
 * 発音（pron・カタカナ）→ 音符に載るかな片。
 * - 「’」（無声化）は落とす。かな以外（読点など）も落とす＝モーラを増やさない。
 * - ひらがなにそろえる：音符の `syllable` は既存データも手打ちもひらがなで、仮歌（VOICEVOX）は
 *   どちらでも歌える。混ざると画面で見た目が割れるのでこちら側にそろえた。
 *   ※設計文書は大小仮名の別を決めていない＝ここは実装側の判断（design §31-3(a) の範囲内）。
 * - 数え方は `analyzeMoras` 1本（拗音は直前と結合して1モーラ・ー/っ/ん はそれぞれ1モーラ）＝design §31-4 の線。
 */
export function moraPiecesOfPron(pron: string): string[] {
  const kana = toHira(pron.replace(DEVOICE, "")).replace(NOT_KANA, "");
  return analyzeMoras(kana).map((m) => m.kana);
}

/** 断片1つぶんの読み（門番はここで働かせる）。 */
interface FragmentReading {
  words: ReadingResult["words"];
  moras: ReadingResult["moras"];
  hl: (0 | 1)[] | null;
  breaks: number[]; // 断片の中のアクセント句の切れ目（モーラ添字・先頭と末尾は入れない）
  error?: string;
}

function readFragment(r: AccentResult): FragmentReading {
  if (r.error) return { words: [], moras: [], hl: null, breaks: [], error: r.error };
  const src = r.words ?? [];
  const words = src.map((w) => ({
    surface: w.surface,
    read: w.read.replace(DEVOICE, ""),
    pron: w.pron.replace(DEVOICE, ""),
    moraCount: w.mora_size,
  }));
  // 門番1：語ごとに「pron を割ったかな片の数 ＝ mora_size」。合わない語だけ **その語のモーラを word=-1**
  // （＝どのモーラがどの語かは言えない）にして、句ぜんたいは捨てない。実測 38行199語で不一致は1語。
  // ※モーラそのものは pron の割りから出す（語を1片に潰すとモーラ数＝音数が狂う。音数はこの機能の芯）。
  const moras: ReadingResult["moras"] = [];
  for (let i = 0; i < src.length; i++) {
    const pieces = moraPiecesOfPron(src[i]!.pron);
    const ok = pieces.length === src[i]!.mora_size;
    for (const kana of pieces) moras.push({ kana, word: ok ? i : -1 });
  }
  // 門番2：hl の長さ ＝ モーラ列の長さ。words は run_frontend・hl は extract_fullcontext ＝別々の解析なので
  // 一致の保証が無い。合わなければ **その断片は hl=null**＝読みとモーラは出す・高低と印は出さない。
  const raw = r.hl;
  const hlOk = Array.isArray(raw) && raw.length === moras.length && raw.every((h) => h === 0 || h === 1);
  const hl = hlOk ? (raw as (0 | 1)[]) : null;
  // アクセント句の切れ目は hl と同じ解析（extract_fullcontext）から出るので、hl が信用できないときは出さない。
  const breaks: number[] = [];
  if (hl) {
    let at = 0;
    for (const p of r.phrases) {
      at += p.moras;
      if (at > 0 && at < moras.length) breaks.push(at);
    }
  }
  return { words, moras, hl, breaks };
}

const EMPTY_READING = (): ReadingResult => ({ words: [], moras: [], hl: null, breaks: [] });

/**
 * accent.py の返り（断片ごと・順番どおり）→ 句ごとの読み。純関数＝Python 無しでテストできる。
 * 断片の並びは `texts.flatMap(splitFragments)` と同じ順であること（数が合わなければ投げる＝黙ってずらさない）。
 */
export function buildReadings(texts: readonly string[], results: readonly AccentResult[]): ReadingResult[] {
  const plan = texts.map(splitFragments);
  const total = plan.reduce((s, f) => s + f.length, 0);
  if (total !== results.length)
    throw new Error(`accent.py: 断片の数が合いません（送り ${total} / 返り ${results.length}）`);
  const out: ReadingResult[] = [];
  let at = 0;
  for (const frags of plan) {
    if (!frags.length) { out.push(EMPTY_READING()); continue; } // 表記が空・穴だけ＝読みも空（失敗ではない）
    const g = EMPTY_READING();
    const hl: (0 | 1)[] = [];
    let hlAlive = true;
    for (let i = 0; i < frags.length; i++) {
      const f = readFragment(results[at++]!);
      if (i > 0) g.breaks.push(g.moras.length); // 改行・穴そのものが読みの切れ目
      const wordBase = g.words.length, moraBase = g.moras.length;
      g.words.push(...f.words);
      for (const m of f.moras) g.moras.push({ kana: m.kana, word: m.word < 0 ? -1 : m.word + wordBase });
      for (const b of f.breaks) g.breaks.push(b + moraBase);
      if (f.hl) hl.push(...f.hl); else hlAlive = false;
      if (f.error && !g.error) g.error = f.error; // 1断片の失敗はその句だけに留める（他の句は生きる）
    }
    // 断片が1つでも高低を出せなければ、句ぜんたいで出さない（途中から1つずつずれた印を出さないため）。
    g.hl = hlAlive ? hl : null;
    out.push(g);
  }
  return out;
}

/** 断片（1行1文）をまとめて1回の spawn で解く。＝`extractReadings` の下回り。 */
async function extractLines(lines: readonly string[], signal?: AbortSignal): Promise<AccentResult[]> {
  const out = await run(pyBin(), [scriptPath()], 15_000, signal, lines.join("\n") + "\n");
  const arr = parseAccentJson(out);
  if (arr.length !== lines.length)
    throw new Error(`accent.py: 行の数が合いません（送り ${lines.length} / 返り ${arr.length}）`);
  return arr;
}

/**
 * 句の表記（漢字仮名交じり・改行と穴を含んでよい）→ 句ごとの読み。**必ず1回の spawn**で解く。
 * 失敗（venv 無し・起動失敗・時間切れ・JSON が取れない・数が合わない）は**投げる**
 * ＝呼び側（`POST /music/reading`）が 502 に落として「読みが取れませんでした」を出せるようにする。
 * 1文の解析だけが転んだ場合は投げずに `results[i].error`＝他の句は生きる（accent.py の流儀と同じ）。
 */
export async function extractReadings(texts: readonly string[], signal?: AbortSignal): Promise<ReadingResult[]> {
  const lines = texts.flatMap(splitFragments);
  if (!lines.length) return texts.map(() => EMPTY_READING()); // 解くものが無ければ Python を起こさない
  return buildReadings(texts, await extractLines(lines, signal));
}
