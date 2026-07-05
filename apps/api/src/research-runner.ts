// #30 継続調査(scheduled research)の api 内実行器＝Python worker の handle_research/collect の置き換え。
// worker `claude_prompt`（`claude -p <prompt>` 単発・Max認証・web可）の node 版＋{summary,references} 解析。
// 実行器だけ差し替え＝schedule/job/reaper/トレイの既存パイプラインはそのまま（design「継続調査を api 内で」）。
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import type { Core } from "./core";
import type { Job } from "./types";
import { beginJobProc, endJobProc } from "./job-procs";

export interface ResearchResult {
  summary: string;
  references: { title: string; artist: string; why: string; points: string }[];
}

// 単発 claude。stdout をテキストで返す。timeout / signal(停止) で detached プロセスグループごと kill
// （孤児を断つ・worker `_killpg` と同型）。research は純テキスト＝MCP/tools 不要（web は claude 既定ツールで足りる）。
export function claudeShot(prompt: string, timeoutMs = 180_000, signal?: AbortSignal): Promise<string> {
  const nodeBin = dirname(process.execPath);
  const env = { ...process.env, PATH: `${nodeBin}:${process.env.PATH ?? ""}` };
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("停止しました"));
    const proc = spawn("claude", ["-p", prompt], { env, detached: true });
    let out = "";
    let err = "";
    let done = false;
    const killGroup = () => {
      try {
        if (proc.pid) process.kill(-proc.pid, "SIGKILL"); // プロセスグループごと（detached）
      } catch {
        proc.kill("SIGKILL");
      }
    };
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const timer = setTimeout(() => {
      killGroup();
      finish(() => reject(new Error("claude timeout")));
    }, timeoutMs);
    // ★停止：削除/停止で abort されたら実プロセスを殺す（研究の裏処理を走り切らせない）。
    const onAbort = () => {
      killGroup();
      finish(() => reject(new Error("停止しました")));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (d: string) => (out += d));
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (d: string) => (err += d));
    proc.on("error", (e) => finish(() => reject(e)));
    proc.on("close", (code) =>
      finish(() => (code === 0 ? resolve(out.trim()) : reject(new Error(`claude failed (${code}): ${err.trim().slice(0, 300)}`)))),
    );
  });
}

type Params = unknown; // job.params は JSON 由来＝unknown。str() で安全に引く。
const str = (p: Params, k: string): string => {
  const v = p && typeof p === "object" ? (p as Record<string, unknown>)[k] : undefined;
  return typeof v === "string" ? v : "";
};

// research/collect のプロンプト（worker handle_research/handle_collect と同契約＝JSON {summary,references}）。
export function researchPrompt(params: Params): string {
  const topic = str(params, "topic") || str(params, "context");
  const instruction = str(params, "instruction") || `「${topic}」の参考になる曲を挙げ、作曲面の学びをまとめる。`;
  return (
    "DTM/作曲のリサーチャーとして、必要なら web を使って調べる。\n" +
    "テーマに対する参考曲を挙げ、各曲の作曲的な学び（コード進行/リズム/構成/音色など）を簡潔にまとめる。\n" +
    '出力は JSON のみ：{"summary":"全体の要点（数行）",' +
    '"references":[{"title":"曲名","artist":"アーティスト","why":"なぜ参考になるか","points":"作曲的ポイント"}]}\n' +
    "references は2〜5曲。前置き/説明/コードフェンス禁止、JSONのみ。\n\n" +
    `# テーマ\n${topic}\n\n# 依頼\n${instruction}`
  );
}
export function collectPrompt(params: Params): string {
  const topic = str(params, "topic") || str(params, "context");
  const instruction = str(params, "instruction") || `「${topic}」で試せる断片・アイデアを集める。`;
  return (
    "DTM/作曲のアシスタントとして、必要なら web を使い、テーマに沿ってすぐ試せる断片やアイデアを集める" +
    "（コード進行例・リズムパターン・歌詞フレーズ・音色や技法のヒント等）。\n" +
    '出力は JSON のみ：{"summary":"集めた要点（数行）",' +
    '"references":[{"title":"アイデア名","artist":"","why":"なぜ使えるか","points":"使い方/具体"}]}\n' +
    "references は3〜6件。前置き/説明/コードフェンス禁止、JSONのみ。\n\n" +
    `# テーマ\n${topic}\n\n# 依頼\n${instruction}`
  );
}

// claude の出力から {summary, references} を頑健に抽出。前後の散文/コードフェンスが混じっても
// 最初の { 〜 最後の } を JSON として拾う。壊れていたら全文を summary に（references=[]）＝無言で捨てない。
export function parseResearch(text: string): ResearchResult {
  const t = (text ?? "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try {
      const data = JSON.parse(t.slice(s, e + 1)) as { summary?: unknown; references?: unknown };
      const summary = typeof data.summary === "string" ? data.summary.trim() : "";
      const refs = Array.isArray(data.references) ? data.references : [];
      const references = refs
        .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as { title?: unknown }).title === "string" && !!(r as { title?: string }).title)
        .map((r) => ({
          title: String(r.title).slice(0, 120),
          artist: typeof r.artist === "string" ? r.artist : "",
          why: typeof r.why === "string" ? r.why : "",
          points: typeof r.points === "string" ? r.points : "",
        }));
      return { summary: summary || t, references };
    } catch {
      /* fallthrough */
    }
  }
  return { summary: t, references: [] };
}

// 1件の research/collect ジョブを実行＝claude を叩き結果を job.result_summary(JSON)へ書いて done に。
// shot は注入可（テストで fake を差す）。失敗は failJob（無言で消さない）。
export async function runResearchJob(
  core: Core,
  job: Job,
  shot: (prompt: string, timeoutMs?: number, signal?: AbortSignal) => Promise<string> = claudeShot,
): Promise<void> {
  const signal = beginJobProc(job.id); // 停止/削除で abort→実プロセスを殺せるよう登録
  try {
    // scheduler は テーマ(neta の title/text)を job.instruction に載せる（params.topic ではない）。
    // topic/context が無ければ instruction をテーマとして流す＝汎用プロンプトに落ちない。
    const base: Record<string, unknown> =
      job.params && typeof job.params === "object" ? { ...(job.params as Record<string, unknown>) } : {};
    if (typeof base.topic !== "string" && typeof base.context !== "string") base.topic = job.instruction ?? "";
    const prompt = job.intent === "collect" ? collectPrompt(base) : researchPrompt(base);
    const text = await shot(prompt, undefined, signal);
    core.completeJob(job.id, parseResearch(text)); // 既存 reaper が done research を reference ネタ化→トレイ
  } catch (e) {
    core.failJob(job.id, e instanceof Error ? e.message : String(e));
  } finally {
    endJobProc(job.id);
  }
}
