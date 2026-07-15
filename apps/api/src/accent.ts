// W-K1 アクセント自動注入：_audio_poc/accent.py（pyopenjtalk）を叩いて日本語アクセント核を取り、
// analyzeLyricFit(opts.accents) へ供給する薄い spawn ヘルパ。audio-analyze.ts の run() と同型
// （detached spawn＋timeout＋abort でプロセスグループ kill＋stdout から JSON 抽出）。
// 正典＝docs/research/2026-07-15-kariuta-accent-feasibility.md（L3・spawn 0.13〜0.23秒/回＝都度起動で十分）。
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import type { AccentEntry } from "@cm/music-core";

const REPO = resolve(import.meta.dirname, "../../.."); // apps/api/src → リポジトリルート
const PY = process.env.CM_ACCENT_PY ?? join(REPO, "_audio_poc/.venv/bin/python");
const SCRIPT = process.env.CM_ACCENT_SCRIPT ?? join(REPO, "_audio_poc/accent.py");

// accent.py の1文ぶんの出力（phrases＝アクセント句ごとの {moras数, kernel核位置}）。
export interface AccentPhrase { moras: number; kernel: number }
export interface AccentResult { text: string; phrases: AccentPhrase[]; mora_total: number; error?: string }

// 子プロセスを spawn し stdout を集める（audio-analyze.ts run と同型）。timeout / abort で detached グループごと kill。
function run(cmd: string, args: string[], timeoutMs: number, signal?: AbortSignal): Promise<string> {
  return new Promise((res, rej) => {
    if (signal?.aborted) return rej(new Error("停止しました"));
    const proc = spawn(cmd, args, { detached: true });
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
  const out = await run(PY, [SCRIPT, text], 10_000, signal); // 軽い＝10秒で十分
  const s = out.indexOf("["), e = out.lastIndexOf("]");
  if (s < 0 || e <= s) throw new Error("accent.py: JSON が取れませんでした");
  const arr = JSON.parse(out.slice(s, e + 1)) as AccentResult[];
  const r = arr[0];
  if (!r) throw new Error("accent.py: 空の結果");
  return r;
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
