import { describe, it, expect } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { runAudioAnalyzeJob, synthesisPrompt } from "../src/audio-analyze";

describe("① アナリーゼ（audio_analyze）", () => {
  it("synthesisPrompt は『調はコードから』の指示と facts/曲名を含む", () => {
    const p = synthesisPrompt({ bpm: 86, key: { key: "A", mode: "minor" }, chord_freq_top: [["A:min", 49]] }, "LostMemory");
    expect(p).toContain("コード進行"); // 調はコードから読む指示
    expect(p).toContain("LostMemory");
    expect(p).toContain("A:min");
  });

  it("job → analyze/shot 注入 → done → reap で『アナリーゼ』知見ネタが出る", async () => {
    const core = new Core(openDb(":memory:"));
    const job = core.enqueueJob({ intent: "audio_analyze", params: { filename: "song.mp3", audio_b64: Buffer.from("x").toString("base64") } });
    const claimed = core.claimQueued(["audio_analyze"])!;
    const fakeAnalyze = async () => ({ bpm: 86, key: { key: "A", mode: "minor" }, chord_freq_top: [["A:min", 49]] });
    const fakeShot = async () => "Am・86BPM の下降ループ。7thで陰影。";
    await runAudioAnalyzeJob(core, claimed, fakeShot, fakeAnalyze);
    const done = core.getJob(job.id)!;
    expect(done.status).toBe("done");
    expect((done.result as { prose?: string }).prose).toContain("下降ループ");
    expect(core.reapResults()).toBeGreaterThanOrEqual(1);
    const kn = core.listNeta({ kind: "analysis", scope: "all", limit: 10 });
    expect(kn.length).toBe(1);
    expect(kn[0]!.title).toContain("アナリーゼ");
    expect(kn[0]!.tags).toContain("アナリーゼ");
    expect((kn[0]!.content as { prose: string }).prose).toContain("下降ループ"); // prose も analysis に入る
  });

  it("学習の出口：facts に chords_timeline があれば『コード（候補）』chord_progression ネタも出る", async () => {
    const core = new Core(openDb(":memory:"));
    const job = core.enqueueJob({ intent: "audio_analyze", params: { filename: "song.mp3", audio_b64: "x" } });
    const claimed = core.claimQueued(["audio_analyze"])!;
    const fakeAnalyze = async () => ({
      bpm: 120, meter: 4, key: { key: "D", mode: "major" }, beat_times: [0, 1, 2, 3, 4, 5, 6, 7],
      melody_notes: [[0, 1, 69]], melody_f0: [[0, 440]],
      chords_timeline: [[0, 1, "N"], [1, 3, "A:min"], [3, 5, "C"], [5, 7, "D:7"]],
    });
    await runAudioAnalyzeJob(core, claimed, async () => "文章", fakeAnalyze);
    expect(core.reapResults()).toBeGreaterThanOrEqual(2); // analysis＋コード候補
    // ワークベンチ用 analysis ネタ
    const an = core.listNeta({ kind: "analysis", scope: "all", limit: 10 });
    expect(an.length).toBe(1);
    const c = an[0]!.content as { meta: { meter: number }; raw: { beat_times: number[]; melody_notes: unknown[] }; overlay: { anchors: unknown[] } };
    expect(c.meta.meter).toBe(4);
    expect(c.raw.beat_times.length).toBe(8);
    expect(c.raw.melody_notes.length).toBe(1);
    expect(c.overlay.anchors.length).toBe(1); // 自動アンカー1本
    const cp = core.listNeta({ kind: "chord_progression", scope: "all", limit: 10 });
    expect(cp.length).toBe(1);
    expect(cp[0]!.title).toContain("コード");
    expect(cp[0]!.tags).toEqual(expect.arrayContaining(["アナリーゼ", "候補"]));
    expect(cp[0]!.tempo).toBe(120);
    expect(cp[0]!.key).toBe(2); // D
    const chords = (cp[0]!.content as { chords: { root: number; quality: string }[] }).chords;
    expect(chords.map((c) => `${c.root}:${c.quality}`)).toEqual(["9:m", "0:", "2:7"]); // Am C D7＝弾ける
  });

  it("解析が失敗したら failed＋error（無言で消さない・音源は削除）", async () => {
    const core = new Core(openDb(":memory:"));
    core.enqueueJob({ intent: "audio_analyze", params: { filename: "x.mp3", audio_b64: "" } });
    const claimed = core.claimQueued(["audio_analyze"])!;
    await runAudioAnalyzeJob(core, claimed, async () => "", async () => {
      throw new Error("analyze boom");
    });
    expect(core.getJob(claimed.id)!.status).toBe("failed");
    expect(core.getJob(claimed.id)!.error).toContain("boom");
  });
});
