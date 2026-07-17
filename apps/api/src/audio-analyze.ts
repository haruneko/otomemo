// ① アナリーゼ（音源解析）の api 内実行器。継続調査(research-runner)と同じ骨格：
// audio_analyze job → ここで Python音声CLI(apps/audio/analyze.py)を叩き {facts} → Claude が
// アナリーゼ文に統合 → reaper が知見ネタ化 → トレイ。音源/stem は解析後に削除（著30-4＝派生事実のみ残す）。
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { claudeShot } from "./research-runner";
import { beginJobProc, endJobProc } from "./job-procs";
import { saveAudioAsset } from "./audio-asset";
import { buildDigest } from "./music/audio-digest";
import type { Core } from "./core";
import type { Job } from "./types";

const REPO = resolve(import.meta.dirname, "../../.."); // apps/api/src → リポジトリルート
const PY = process.env.CM_AUDIO_PY ?? join(REPO, "apps/audio/.venv/bin/python");
const SCRIPT = process.env.CM_AUDIO_SCRIPT ?? join(REPO, "apps/audio/analyze.py");
const YTDLP = process.env.CM_YTDLP ?? join(REPO, "apps/audio/.venv/bin/yt-dlp");

// 子プロセスを spawn し stdout を集める。timeout / signal(停止) で detached プロセスグループごと kill。
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
    const t = setTimeout(() => {
      killGroup();
      finish(() => rej(new Error(`${cmd} timeout`)));
    }, timeoutMs);
    // ★停止：削除/停止で abort されたら実プロセス（demucs/python/yt-dlp）を殺す。
    const onAbort = () => {
      killGroup();
      finish(() => rej(new Error("停止しました")));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += String(d).slice(0, 2000)));
    proc.on("error", (e) => finish(() => rej(e)));
    proc.on("close", (code) => finish(() => (code === 0 ? res(out) : rej(new Error(`${cmd} failed (${code}): ${err.trim().slice(0, 300)}`)))));
  });
}

// YouTube等のURLから音源を一時DL（yt-dlp・best-effort＝SABR/POトークンで失敗し得る）。
// --js-runtimes: yt-dlp 2026系はYouTube抽出にJSランタイム必須（既定deno）。systemd環境にdenoは無いが
// api自身を動かしているnode(process.execPath)は必ず在る＝明示パスで渡す（nvmのPATH非継承にも耐える）。
export async function fetchAudioFromUrl(url: string, dir: string, signal?: AbortSignal): Promise<string> {
  await run(YTDLP, ["--js-runtimes", `node:${process.execPath}`, "-x", "--audio-format", "mp3", "--no-playlist", "-o", join(dir, "dl.%(ext)s"), url], 180_000, signal);
  return join(dir, "dl.mp3");
}

// analyze.py を叩いて facts(JSON) を得る。stdout に混じりがあっても {..} を拾う。meter=ユーザー指定拍子。
export async function analyzeAudioFile(audioPath: string, workdir: string, meter = 4, bpmHint = 0, signal?: AbortSignal): Promise<unknown> {
  const out = await run(PY, [SCRIPT, audioPath, workdir, String(meter), String(bpmHint || "")], 900_000, signal); // 分離が重い＝最大15分
  const s = out.indexOf("{"), e = out.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("analyze.py: JSON が取れませんでした");
  return JSON.parse(out.slice(s, e + 1));
}

// facts → 日本語アナリーゼ文のプロンプト。#S10続 v2.1「読み筋」層：facts でなく **digest（射影・度数化・spots）**
// を丸ごと渡し、pedagogy テンプレA の3層（事実→解釈→転用）＋深さ優先（効いてる1〜2点だけ深掘り・網羅禁止）で書かせる。
// ★digest は ~4K tokens に設計済み（配列は統計/上位N/spots へ要約済）＝旧・巨大配列(beat_times/melody_f0)による
//   Claude タイムアウト対策のカットは不要になった（digest がそのカット済みの姿＝ここでは digest を丸ごと渡す）。
export function synthesisPrompt(facts: unknown, label: string): string {
  const digest = digestFromFacts(facts);
  return (
    "以下はある曲の音源解析(MIR)を「読み筋」に射影した digest＝事実の要約＋見どころ候補(spots)。\n" +
    "これを日本語のアナリーゼ文にまとめて。良い分析文は「事実→解釈→転用」の3層で、**網羅せず深さ優先**。\n" +
    "【書き方】\n" +
    "- spots（見どころ候補）から**最も効いている1〜2点だけ**を選び深掘りする。全項目を均等に語らない・全部列挙しない。\n" +
    "- 各点を3層で：①事実（度数・小節・具体）→②解釈（それが何を生んでいるか＝色/推進力/翳り）→③転用（自作でどう使うか・最小の実験手順）。\n" +
    "- 調(key)は digest の値が相対調/属和音で外れていれば、コード進行(chords)の度数の並びから訂正して述べてよい。\n" +
    "- 信頼度(conf)が低い spot は『候補』と明記。無理に見どころを作らない（spots が薄ければ素直に）。\n" +
    "- **メタ情報(BPM/調/構成)は前景化しない＝末尾に1行だけ**。前置き不要、アナリーゼ文だけ。\n\n" +
    `# 曲: ${label}\n# digest(JSON)\n${JSON.stringify(digest)}`
  );
}

// prose 生成は reaper より前に走る＝reaper が計算する区間/downbeat をまだ持たない。よって facts だけから
// 軽い interp（meter は facts 指定 or 4・sections 空・downbeat 無し）で digest を作る。区間依存の spot（M2/F1）や
// 小節番号は出ないが、H1借用/H2セカドミ/H5転調/M4食い/R3ベース×キック・度数化コード・メロ統計は facts だけで出る。
// reaper 側は区間込みの完全 digest を content.digest に別途保存する（プロンプト用の軽 digest とは役割違い）。
function digestFromFacts(facts: unknown): unknown {
  const f = (facts ?? {}) as {
    bpm?: number; meter?: number; key?: { key?: string; mode?: string };
    chords_timeline?: unknown; chords?: unknown; beat_times?: unknown;
  };
  const timeline = (Array.isArray(f.chords_timeline) ? f.chords_timeline : Array.isArray(f.chords) ? f.chords : []) as [number, number, string][];
  return buildDigest(facts, {
    bpm: typeof f.bpm === "number" ? f.bpm : 0,
    meter: typeof f.meter === "number" && f.meter > 0 ? f.meter : 4,
    downbeat: null,
    sections: [],
    key: f.key ?? null,
    timeline,
    beatTimes: Array.isArray(f.beat_times) ? (f.beat_times as number[]) : [],
  });
}

// 失敗メッセージのユーザー向け丸め：yt-dlp/analyze.py の生失敗は `<絶対パス>/python failed (1): ...`
// のようにサーバ内部の絶対パスやスタックダンプを含む＝ユーザーに内部構造を晒す。詳細はサーバログ
// (console.error)にだけ残し、ユーザーには意味の分かる1行を返す。パスも内部ダンプも無い短文（"停止
// しました"・空 base64 の zod 由来など）はそのまま活かす＝停止/中断の区別を潰さない。
export function userFacingFailure(raw: string): string {
  if (/停止しました/.test(raw)) return "停止しました"; // ユーザー操作（削除/停止）＝そのまま
  // 絶対パス(/... や C:\...)・サブプロセスダンプ(failed (n)/Traceback)・timeout を含む＝内部詳細。1行に丸める。
  if (/(?:[A-Za-z]:)?[\\/][^\s]+|failed \(\d+\)|Traceback|timeout/i.test(raw)) {
    return "解析に失敗しました（音源を読み込めませんでした）";
  }
  return raw; // パスもダンプも無い短文はそのまま（診断性を保つ）
}

// 1件の audio_analyze ジョブを実行。file(b64) or url → analyze.py → facts → Claude統合 → done。
export async function runAudioAnalyzeJob(
  core: Core,
  job: Job,
  shot: (p: string, ms?: number, signal?: AbortSignal) => Promise<string> = claudeShot,
  analyze: (a: string, w: string, meter?: number, bpmHint?: number, signal?: AbortSignal) => Promise<unknown> = analyzeAudioFile,
): Promise<void> {
  const signal = beginJobProc(job.id); // 停止/削除で abort→demucs/python/yt-dlp を殺せるよう登録
  const dir = mkdtempSync(join(tmpdir(), "cm-audio-"));
  try {
    const p = (job.params ?? {}) as { audio_b64?: string; filename?: string; url?: string; meter?: number; bpm?: number };
    const label = p.filename || p.url || "アナリーゼ";
    const meter = typeof p.meter === "number" && p.meter > 0 ? p.meter : 0; // #S12 未指定=0(auto)＝ドラムから拍子推定（reaper）。>0はユーザー指定で常に優先
    const bpmHint = typeof p.bpm === "number" && p.bpm > 0 ? p.bpm : 0; // 任意のBPMヒント（拍検出を固定・綺麗に）
    let audioPath: string;
    let audioAssetId: string | undefined;
    if (p.url) {
      audioPath = await fetchAudioFromUrl(p.url, dir, signal);
    } else {
      audioPath = join(dir, (p.filename || "audio.mp3").replace(/[^\w.\-]/g, "_"));
      const bytes = Buffer.from(p.audio_b64 ?? "", "base64");
      writeFileSync(audioPath, bytes);
      // P2(design#16)：アップロード音源は asset(重複排除)へ保存＝params の base64 に頼らず残す。
      if (bytes.length > 0) audioAssetId = saveAudioAsset(core, bytes, label);
    }
    const facts = await analyze(audioPath, dir, meter, bpmHint, signal);
    // ★重いMIRが済んだら prose 失敗でも facts は残す（prose は二次的・タイムアウトで全部捨てない）。
    let prose = "";
    try {
      prose = (await shot(synthesisPrompt(facts, label), 120_000, signal)).trim();
    } catch (e) {
      if (signal.aborted) throw e; // 停止/削除は失敗として扱う
      prose = "（所見の自動生成に失敗＝再生成できます。実測データは揃っています）";
    }
    core.completeJob(job.id, { facts, prose, title: label, audio_asset_id: audioAssetId });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error("[audio_analyze] job failed:", job.id, raw); // 詳細（絶対パス含む）はサーバログにだけ残す
    core.failJob(job.id, userFacingFailure(raw)); // ユーザーには内部パスを晒さない1行
  } finally {
    rmSync(dir, { recursive: true, force: true }); // 音源・stem を削除（30-4：派生事実のみ残す）
    core.stripJobAudio(job.id); // P2：params の base64 を除去（asset へ保存済み・done後に残さない）
    endJobProc(job.id);
  }
}
