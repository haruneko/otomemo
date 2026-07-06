// #S11 アナリーゼ研究（study）ジョブの api 内実行器。
// study job params: { topic, works:[{title,audioUrl?}], lenses? }
// ①work×lens の元ネタ収集（コードレンズ = audio URL → analyze → chords）
// ②共通進行集計 (commonProgressions)
// ③横断統合（Claude 1回の shot）→ study ネタ + chord_progression 出口ネタ。
// 停止/削除 = 既存 job-procs パターン（beginJobProc/endJobProc）。
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { claudeShot } from "./research-runner";
import { fetchAudioFromUrl, analyzeAudioFile } from "./audio-analyze";
import { beginJobProc, endJobProc } from "./job-procs";
import { chordSequenceFromTimeline } from "./audio-chords";
import { commonProgressions, songCoreLoops, type CoreLoop } from "./common-progressions";
import type { Core } from "./core";
import type { Job } from "./types";

export type AnalyzeFn = (url: string, signal?: AbortSignal) => Promise<unknown>;
export type ShotFn = (prompt: string, timeoutMs?: number, signal?: AbortSignal) => Promise<string>;

// デフォルト analyze：URL → yt-dlp → analyze.py → facts（テストは fake を差す）
export async function analyzeUrl(url: string, signal?: AbortSignal): Promise<unknown> {
  const dir = mkdtempSync(join(tmpdir(), "cm-study-"));
  try {
    const audioPath = await fetchAudioFromUrl(url, dir, signal);
    return await analyzeAudioFile(audioPath, dir, 4, 0, signal);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ファイル(base64)→analyze.py→facts。URLが無くローカル/アップロード音源で研究する時（yt-dlp不要・確実）。
async function analyzeB64(b64: string, filename: string, signal?: AbortSignal): Promise<unknown> {
  const dir = mkdtempSync(join(tmpdir(), "cm-study-"));
  try {
    const audioPath = join(dir, (filename || "audio.mp3").replace(/[^\w.\-]/g, "_"));
    writeFileSync(audioPath, Buffer.from(b64, "base64"));
    return await analyzeAudioFile(audioPath, dir, 4, 0, signal);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// prose の後始末：所見を書く Claude は project の CLAUDE.md を継承するので、末尾に
// 「docs/research に格納しますか」等の“ワークフロー meta”を足しがち。水平線(---)以降の
// 末尾ブロックが meta（docs/research・格納・README・索引 を含む）なら切り落とす。所見本文は残す。
export function cleanProse(prose: string): string {
  const parts = prose.split(/\n-{3,}\s*\n/); // 水平線で分割
  if (parts.length < 2) return prose.trim();
  const tail = parts[parts.length - 1] ?? "";
  if (/docs\/research|格納しますか|README|索引|\.md[)）]/.test(tail)) {
    return parts.slice(0, -1).join("\n---\n").trim(); // meta 末尾だけ除去
  }
  return prose.trim();
}

// facts → { root, quality, dur }[] 抽出（chords_timeline / chords どちらでも）。dur＝調判定/ループ検出に要る。
function extractChords(facts: unknown): { root: number; quality: string; dur: number }[] {
  const f = (facts ?? {}) as { chords_timeline?: unknown; chords?: unknown };
  return chordSequenceFromTimeline(f.chords_timeline ?? f.chords);
}

/**
 * Claude に渡す横断統合プロンプト。生配列は渡さない（タイムアウト回避・#S11 設計）。
 * ★主役＝各曲の「曲内で繰り返されるコア・ループ」。共通進行(頻度)は補助（汎用の繋ぎに注意）。
 */
export function studyPrompt(
  topic: string,
  stats: { songs: number; keys: Record<string, number>; modes: Record<string, number> },
  songsLoops: { title: string; loops: { degrees: string[]; count: number }[] }[],
  topCommon: { degrees: string[]; songCount: number; songs: string[] }[],
): string {
  const loopSummary = songsLoops
    .map((s) => {
      const top = s.loops[0];
      return `- ${s.title}: ${top ? `コア・ループ [${top.degrees.join(" → ")}] ×${top.count}回` : "反復ループなし"}`;
    })
    .join("\n");
  const commonSummary = topCommon.slice(0, 5)
    .map((c, i) =>
      `${i + 1}. 度数列 [${c.degrees.join(" → ")}] (${c.songCount}曲中に共通: ${c.songs.slice(0, 3).join(", ")}…)`,
    )
    .join("\n");
  return (
    "作曲研究者として、以下の横断解析結果を日本語の研究所見にまとめて。\n" +
    "【最重要】各曲の『曲内で繰り返されるコア・ループ』が主役＝その曲の顔。まずこれらを見て、作曲者の\n" +
    "手癖(共有される型)と各曲の個性(逸脱)の両方を語る。手癖の単位は歌手でなく作曲者＝対象が単一作曲者か・\n" +
    "核が立つか立たないかも明示する。共通コード進行(下)は補助＝『どの曲にも出る汎用の繋ぎ』を拾いがちな点に注意。\n" +
    "生データの丸写し禁止。最後に「この研究から得られる作曲の教訓」を1〜2行。前置き不要、所見文だけ。\n\n" +
    `# テーマ: ${topic}\n` +
    `# 解析曲数: ${stats.songs}曲 / モード分布: ${JSON.stringify(stats.modes)}\n` +
    `# 各曲のコア・ループ(主役):\n${loopSummary || "（なし）"}\n\n` +
    `# 共通コード進行(補助・度数):\n${commonSummary || "（共通進行なし）"}`
  );
}

/**
 * 1件の study ジョブを実行。
 * @param core   - Core インスタンス
 * @param job    - intent="study" のジョブ。params = {topic, works:[{title,audioUrl?}], lenses?}
 * @param analyze - URL → facts（デフォルト: yt-dlp+analyze.py。テストで fake を差す）
 * @param shot   - Claude 単発呼び出し（デフォルト: claudeShot）
 */
export async function runStudyJob(
  core: Core,
  job: Job,
  analyze: AnalyzeFn = analyzeUrl,
  shot: ShotFn = claudeShot,
): Promise<void> {
  const signal = beginJobProc(job.id); // 停止/削除で abort→実プロセスを殺せるよう登録
  try {
    const p = (job.params ?? {}) as {
      topic?: string;
      works?: { title: string; audioUrl?: string; audio_b64?: string }[];
      lenses?: string[];
    };
    const topic = typeof p.topic === "string" && p.topic ? p.topic : (job.instruction ?? "研究");
    const works = Array.isArray(p.works) ? p.works : [];

    // ①各楽曲を解析してコード列を収集。★主役＝曲内反復ループ(songCoreLoops)。共通進行は補助。
    const songs: { title: string; chords: { root: number; quality: string; dur?: number }[] }[] = [];
    const members: { title: string; url?: string; key: number | null; mode: string | null }[] = [];
    // per-song データ（StudyView 主役＋再解析回避のため生 chords(dur込)を保持）
    const songsData: {
      title: string; url?: string; key: number | null; mode: string | null;
      coreLoops: CoreLoop[]; chords: { root: number; quality: string; dur: number }[];
    }[] = [];

    for (const work of works) {
      if (signal.aborted) throw new Error("停止しました");
      let chords: { root: number; quality: string; dur: number }[] = [];
      if (work.audioUrl || work.audio_b64) {
        try {
          const facts = work.audio_b64
            ? await analyzeB64(work.audio_b64, work.title, signal) // ローカル/アップロード音源（yt-dlp不要）
            : await analyze(work.audioUrl!, signal);               // URL（yt-dlp・注入可）
          chords = extractChords(facts);
        } catch (e) {
          if (signal.aborted) throw e; // 停止=失敗として上位へ
          // 解析失敗は継続（コード列なしで集計）
          console.error(`study: analyze failed for "${work.title}":`, e instanceof Error ? e.message : String(e));
        }
      }
      songs.push({ title: work.title, chords });
      // ★曲内コア・ループ＝主レンズ。調(dur重み)もここで確定＝StudyViewで「Northern lights＝A短調」等。
      const scl = chords.length ? songCoreLoops(chords) : null;
      const key = scl ? scl.tonic : null;
      const mode = scl ? scl.mode : null;
      members.push({ title: work.title, url: work.audioUrl, key, mode });
      songsData.push({ title: work.title, url: work.audioUrl, key, mode, coreLoops: scl ? scl.loops : [], chords });
    }

    // ②共通進行を集計（補助レンズ＝"共有される最小公倍数"を見る用）。songCount>=2 のみ上限200。
    const result = commonProgressions(songs);
    const commonToStore = result.common.filter((e) => e.songCount >= 2).slice(0, 200);

    // ③横断統合（Claude 1回・生配列は渡さない）。主役＝各曲コア・ループ、補助＝共通進行。
    const songsLoops = songsData.map((s) => ({ title: s.title, loops: s.coreLoops }));
    let prose = "";
    try {
      prose = cleanProse((await shot(studyPrompt(topic, result.stats, songsLoops, result.common), 120_000, signal)).trim());
    } catch (e) {
      if (signal.aborted) throw e; // 停止=失敗として上位へ
      prose = "（所見の自動生成に失敗＝再生成できます。集計データは揃っています）";
    }

    core.completeJob(job.id, {
      topic,
      members,
      songs: songsData, // ★主役＝各曲のコア・ループ＋生 chords(dur込・再解析回避)
      common: commonToStore, // 補助
      stats: result.stats,
      prose,
      title: `研究: ${topic}`,
    });
  } catch (e) {
    core.failJob(job.id, e instanceof Error ? e.message : String(e));
  } finally {
    endJobProc(job.id);
  }
}
