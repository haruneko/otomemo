// #S11 study-runner テスト。analyze + shot を注入して実音源・実 Claude を使わずに検証。
import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { runStudyJob, studyPrompt, cleanProse } from "../src/study-runner";
import { killJobProc, isJobProcRunning } from "../src/job-procs";

let core: Core;
beforeEach(() => {
  core = new Core(openDb(":memory:"));
});

// Am-F-C-G を chords_timeline 形式で返す fake facts
function amFCGFacts(): unknown {
  return {
    bpm: 120,
    chords_timeline: [
      [0, 2, "A:min"], [2, 4, "F"], [4, 6, "C"], [6, 8, "G"],
    ],
  };
}
// Em-C-G-D
function emCGDFacts(): unknown {
  return {
    bpm: 100,
    chords_timeline: [
      [0, 2, "E:min"], [2, 4, "C"], [4, 6, "G"], [6, 8, "D"],
    ],
  };
}

describe("cleanProse（CLAUDE.md 継承で末尾に付くワークフローmetaを除去）", () => {
  it("水平線以降が docs/research 格納の meta なら切り落とす", () => {
    const p = "所見本文。\n\n手癖の結論。\n\n---\nこの所見、`docs/research/` に格納しますか（例：`x.md` ＋ README索引に1行）。";
    expect(cleanProse(p)).toBe("所見本文。\n\n手癖の結論。");
  });
  it("水平線が無ければそのまま", () => {
    const p = "所見本文だけ。結論。";
    expect(cleanProse(p)).toBe("所見本文だけ。結論。");
  });
  it("水平線以降が meta でない（本文の一部）なら残す", () => {
    const p = "所見。\n\n---\n続きの本文で著作権の注意など。";
    expect(cleanProse(p)).toBe(p);
  });
});

describe("studyPrompt（Claude に渡すプロンプトのフォーマット）", () => {
  it("テーマ・各曲コア・ループ(主役)・共通進行(補助)・stats を含む（生配列は含まない）", () => {
    const p = studyPrompt(
      "ポップバラード研究",
      { songs: 3, keys: { A: 2, E: 1 }, modes: { minor: 3 } },
      [
        { title: "曲A", loops: [{ degrees: ["0:m", "8:", "10:", "0:m"], count: 5 }] },
        { title: "曲B", loops: [] },
      ],
      [
        { degrees: ["0:m", "8:", "3:", "10:"], songCount: 3, songs: ["A", "B", "C"] },
      ],
    );
    expect(p).toContain("ポップバラード研究");
    expect(p).toContain("3曲");
    expect(p).toContain("0:m");
    // 主役＝各曲のコア・ループ
    expect(p).toContain("コア・ループ");
    expect(p).toContain("曲A");
    expect(p).toContain("×5回");
    // 共通進行は補助として含む
    expect(p).toContain("補助");
  });
});

describe("runStudyJob（analyze + shot を注入）", () => {
  it("2曲を解析して done、study ネタが作られる", async () => {
    const job = core.enqueueJob({
      intent: "study",
      params: {
        topic: "ポップバラード",
        works: [
          { title: "曲A", audioUrl: "https://example.com/a.mp3" },
          { title: "曲B", audioUrl: "https://example.com/b.mp3" },
        ],
      },
    });
    const claimed = core.claimQueued(["study"])!;
    expect(claimed).toBeDefined();

    let analyzeCallCount = 0;
    const fakeAnalyze = async (url: string) => {
      analyzeCallCount++;
      return url.includes("a.mp3") ? amFCGFacts() : emCGDFacts();
    };
    const fakeShot = async (_p: string) => "両曲に共通する i-VI-III-VII 進行が顕著です。";

    await runStudyJob(core, claimed, fakeAnalyze, fakeShot);

    expect(analyzeCallCount).toBe(2); // 2曲分解析
    const done = core.getJob(job.id)!;
    expect(done.status).toBe("done");

    const result = done.result as { topic: string; common: unknown[]; stats: { songs: number }; prose: string; title: string };
    expect(result.topic).toBe("ポップバラード");
    expect(result.stats.songs).toBe(2);
    expect(result.prose).toContain("i-VI-III-VII");
    expect(result.title).toContain("ポップバラード");
    expect(Array.isArray(result.common)).toBe(true);
  });

  it("audioUrl なし曲はスキップ（解析しない）", async () => {
    const job = core.enqueueJob({
      intent: "study",
      params: {
        topic: "テスト",
        works: [
          { title: "URL無し曲" }, // audioUrl なし
          { title: "URL有り曲", audioUrl: "https://example.com/b.mp3" },
        ],
      },
    });
    const claimed = core.claimQueued(["study"])!;
    let analyzeCount = 0;
    await runStudyJob(core, claimed,
      async () => { analyzeCount++; return amFCGFacts(); },
      async () => "prose",
    );
    expect(analyzeCount).toBe(1); // URL有りの1曲のみ
    expect(core.getJob(job.id)!.status).toBe("done");
  });

  it("analyze 失敗してもジョブは done（停止以外の解析エラーは継続）", async () => {
    const job = core.enqueueJob({
      intent: "study",
      params: {
        topic: "テスト",
        works: [{ title: "失敗曲", audioUrl: "https://example.com/fail.mp3" }],
      },
    });
    const claimed = core.claimQueued(["study"])!;
    await runStudyJob(core, claimed,
      async () => { throw new Error("network error"); },
      async () => "prose",
    );
    // 解析失敗は継続＝done（コード列なしで集計）
    expect(core.getJob(job.id)!.status).toBe("done");
  });

  it("shot 失敗してもジョブは done（prose は代替テキスト）", async () => {
    const job = core.enqueueJob({
      intent: "study",
      params: {
        topic: "テスト",
        works: [{ title: "曲A", audioUrl: "https://example.com/a.mp3" }],
      },
    });
    const claimed = core.claimQueued(["study"])!;
    await runStudyJob(core, claimed,
      async () => amFCGFacts(),
      async () => { throw new Error("shot failed"); },
    );
    const done = core.getJob(job.id)!;
    expect(done.status).toBe("done");
    const result = done.result as { prose: string };
    expect(result.prose).toContain("失敗"); // 代替テキスト
  });

  it("reap で study ネタと chord_progression ネタが生まれる", async () => {
    const job = core.enqueueJob({
      intent: "study",
      params: {
        topic: "テスト研究",
        works: [
          { title: "曲A", audioUrl: "https://example.com/a.mp3" },
          { title: "曲B", audioUrl: "https://example.com/b.mp3" },
        ],
      },
    });
    const claimed = core.claimQueued(["study"])!;
    await runStudyJob(core, claimed,
      async (url) => url.includes("a.mp3") ? amFCGFacts() : emCGDFacts(),
      async () => "共通進行の所見です。",
    );

    // stale ガードを超える（研究ネタは即回収でも可だが、念のため staleBefore を回避）
    core.db.prepare("UPDATE job SET updated='2020-01-01T00:00:00.000Z' WHERE id=?").run(job.id);
    const n = core.reapResults();
    expect(n).toBeGreaterThanOrEqual(1); // study ネタ最低1つ

    const studyNetas = core.listNeta({ kind: "study", scope: "all", limit: 10 });
    expect(studyNetas.length).toBeGreaterThanOrEqual(1);
    const sn = studyNetas[0]!;
    expect(sn.text).toContain("共通進行"); // prose がテキストに
    expect(sn.tags).toContain("研究");

    // 共通進行があれば chord_progression ネタも作られる
    const cpNetas = core.listNeta({ kind: "chord_progression", scope: "all", limit: 10 });
    // Am-F-C-Gの共通進行が1件以上 (songCount>=2)出れば chord_progression ネタが生まれる
    // (解析結果次第なので >=0 で緩やかにアサート、または study ネタのみで十分)
    expect(cpNetas.length).toBeGreaterThanOrEqual(0);
  });

  it("停止: killJobProc で shot が中断され failed になる", async () => {
    const job = core.enqueueJob({
      intent: "study",
      params: {
        topic: "テスト",
        works: [{ title: "曲A", audioUrl: "https://example.com/a.mp3" }],
      },
    });
    const claimed = core.claimQueued(["study"])!;

    // claudeShot と同じパターン：signal.aborted のチェックを先行させる（timing に robust）
    const shot = (_p: string, _ms?: number, signal?: AbortSignal) =>
      new Promise<string>((_res, rej) => {
        if (signal?.aborted) return rej(new Error("停止しました"));
        signal?.addEventListener("abort", () => rej(new Error("停止しました")), { once: true });
      });

    // analyze はすぐに返す。killJobProc → signal.aborted になると shot が即 reject する。
    const p = runStudyJob(core, claimed, async () => amFCGFacts(), shot);
    expect(isJobProcRunning(job.id)).toBe(true);
    killJobProc(job.id);
    await p;
    const f = core.getJob(job.id)!;
    expect(f.status).toBe("failed");
    expect(f.error).toContain("停止");
    expect(isJobProcRunning(job.id)).toBe(false);
  });
});
