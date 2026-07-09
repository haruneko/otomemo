// ① アナリーゼ（音源解析）の api 内実行器。継続調査(research-runner)と同じ骨格：
// audio_analyze job → ここで Python音声CLI(_audio_poc/analyze.py)を叩き {facts} → Claude が
// アナリーゼ文に統合 → reaper が知見ネタ化 → トレイ。音源/stem は解析後に削除（著30-4＝派生事実のみ残す）。
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { claudeShot } from "./research-runner";
import { beginJobProc, endJobProc } from "./job-procs";
import { saveAudioAsset } from "./audio-asset";
import type { Core } from "./core";
import type { Job } from "./types";

const REPO = resolve(import.meta.dirname, "../../.."); // apps/api/src → リポジトリルート
const PY = process.env.CM_AUDIO_PY ?? join(REPO, "_audio_poc/.venv/bin/python");
const SCRIPT = process.env.CM_AUDIO_SCRIPT ?? join(REPO, "_audio_poc/analyze.py");
const YTDLP = process.env.CM_YTDLP ?? join(REPO, "_audio_poc/.venv/bin/yt-dlp");

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
export async function fetchAudioFromUrl(url: string, dir: string, signal?: AbortSignal): Promise<string> {
  await run(YTDLP, ["-x", "--audio-format", "mp3", "--no-playlist", "-o", join(dir, "dl.%(ext)s"), url], 180_000, signal);
  return join(dir, "dl.mp3");
}

// analyze.py を叩いて facts(JSON) を得る。stdout に混じりがあっても {..} を拾う。meter=ユーザー指定拍子。
export async function analyzeAudioFile(audioPath: string, workdir: string, meter = 4, bpmHint = 0, signal?: AbortSignal): Promise<unknown> {
  const out = await run(PY, [SCRIPT, audioPath, workdir, String(meter), String(bpmHint || "")], 900_000, signal); // 分離が重い＝最大15分
  const s = out.indexOf("{"), e = out.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("analyze.py: JSON が取れませんでした");
  return JSON.parse(out.slice(s, e + 1));
}

// facts → 日本語アナリーゼ文のプロンプト。調は検出器でなくコードから読む（POC実証）・信頼度を分ける。
export function synthesisPrompt(facts: unknown, label: string): string {
  return (
    "以下はある曲の音源解析(MIR)の結果＝事実データ。これを日本語のアナリーゼ文にまとめて。\n" +
    "【重要】\n" +
    "- 調(key)は自動検出器の値＝相対調/属和音で外しやすい。**コード進行(chords)の並びから本当の調を読み**、必要なら検出器値を訂正して述べる。\n" +
    "- 事実(BPM・調・音域・機能和声)と、候補どまり(7th/テンション・混合音源の楽器)を分けて、信頼度が低い所は『候補』と明記。\n" +
    "- コード進行は主ループ＋差し色を要約（全部列挙しない）。メロ/音域の特徴を一言。\n" +
    "- 最後に『学ぶなら〜』の一言。前置き不要、アナリーゼ文だけ。\n\n" +
    `# 曲: ${label}\n# 解析結果(JSON)\n${JSON.stringify(summarizeFacts(facts))}`
  );
}

// ★プロンプトに生の巨大配列(beat_times/melody_f0/melody_notes 数千点)を入れると Claude がタイムアウトする。
//   文章化に要る要約だけ渡す（BPM/拍子/調/音域/コード頻度top/コード列）。
function summarizeFacts(facts: unknown): unknown {
  const f = (facts ?? {}) as {
    bpm?: number; meter?: number; key?: unknown; vocal_range?: unknown; duration_sec?: number;
    chord_freq_top?: unknown; chord_labels_seq?: unknown[];
  };
  return {
    bpm: f.bpm, meter: f.meter, key: f.key, vocal_range: f.vocal_range, duration_sec: f.duration_sec,
    chord_freq_top: f.chord_freq_top,
    chords: Array.isArray(f.chord_labels_seq) ? f.chord_labels_seq.slice(0, 80) : undefined,
  };
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
    core.failJob(job.id, e instanceof Error ? e.message : String(e));
  } finally {
    rmSync(dir, { recursive: true, force: true }); // 音源・stem を削除（30-4：派生事実のみ残す）
    core.stripJobAudio(job.id); // P2：params の base64 を除去（asset へ保存済み・done後に残さない）
    endJobProc(job.id);
  }
}
