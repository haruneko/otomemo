import { describe, it, expect } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { runAudioAnalyzeJob, synthesisPrompt, userFacingFailure } from "../src/audio-analyze";

describe("① アナリーゼ（audio_analyze）", () => {
  it("synthesisPrompt は digest＋3層(事実→解釈→転用)の指示と曲名を含む（#S10続 v2.1）", () => {
    const p = synthesisPrompt(
      { bpm: 86, key: { key: "A", mode: "minor" }, chords_timeline: [[0, 4, "A:min"], [4, 6, "F:maj"], [6, 8, "G:maj"], [8, 12, "A:min"]] },
      "LostMemory",
    );
    expect(p).toContain("事実→解釈→転用"); // 3層テンプレの指示
    expect(p).toContain("転用");
    expect(p).toContain("LostMemory");
    expect(p).toContain("digest"); // facts でなく digest を渡す
    expect(p).toContain("コード進行"); // 調はコードの度数から読む指示は残す
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

  it("#S10続 v2.1：reap で analysis ネタの content.digest に digest（overview/spots）が保存される", async () => {
    const core = new Core(openDb(":memory:"));
    const job = core.enqueueJob({ intent: "audio_analyze", params: { filename: "song.mp3", audio_b64: "x" } });
    const claimed = core.claimQueued(["audio_analyze"])!;
    // C major に ♭VII(Bb) 借用を含む＝H1 spot が立つ facts
    const fakeAnalyze = async () => ({
      bpm: 120, meter: 4, key: { key: "C", mode: "major" }, duration_sec: 12,
      chords_timeline: [[0, 4, "C:maj"], [4, 6, "F:maj"], [6, 8, "Bb:maj"], [8, 12, "C:maj"]],
    });
    await runAudioAnalyzeJob(core, claimed, async () => "所見", fakeAnalyze);
    expect(core.reapResults()).toBeGreaterThanOrEqual(1);
    const kn = core.listNeta({ kind: "analysis", scope: "all", limit: 10 });
    const digest = (kn[0]!.content as { digest?: { overview?: string; spots?: { id: string }[] } }).digest;
    expect(digest).toBeTruthy();
    expect(digest!.overview).toContain("C major");
    expect(digest!.spots!.some((s) => s.id === "H1")).toBe(true); // 借用 spot が保存されている
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

  it("#S12 drum_onsets があれば拍子を自動検出し rhythm 候補ネタを出す（meter未指定=auto）", async () => {
    const core = new Core(openDb(":memory:"));
    core.enqueueJob({ intent: "audio_analyze", params: { filename: "song.mp3", audio_b64: "x" } });
    const claimed = core.claimQueued(["audio_analyze"])!;
    // 120bpm・16ビート(=4小節4/4)。kick=偶数拍・snare=奇数拍・hihat=毎拍。meter は渡さない=auto。
    const bt = Array.from({ length: 16 }, (_, i) => i * 0.5);
    const drum: [number, string, number][] = [];
    for (let b = 0; b < 16; b++) {
      drum.push([bt[b]!, b % 2 === 0 ? "kick" : "snare", 1]);
      drum.push([bt[b]!, "hihat", 1]);
    }
    const fakeAnalyze = async () => ({
      bpm: 120, key: { key: "C", mode: "major" }, beat_times: bt, drum_onsets: drum,
      chords_timeline: [[0, 4, "C"], [4, 8, "G"]],
    });
    await runAudioAnalyzeJob(core, claimed, async () => "四つ打ち", fakeAnalyze);
    // analysis＋コード候補＋rhythm候補 の3枚
    expect(core.reapResults()).toBeGreaterThanOrEqual(3);
    // analysis の拍子はドラムから自動検出＝4
    const an = core.listNeta({ kind: "analysis", scope: "all", limit: 5 })[0]!;
    const meta = (an.content as { meta: { meter: number; meter_detected: { meter: number; source: string; confidence: number } } }).meta;
    expect(meta.meter).toBe(4);
    expect(meta.meter_detected.source).toBe("drums");
    expect(meta.meter_detected.confidence).toBeGreaterThan(0.5);
    // rhythm 候補ネタ＝正しい形（steps=16・kick[0,8]/snare[4,12]/hihat[0,4,8,12]）
    const rh = core.listNeta({ kind: "rhythm", scope: "all", limit: 5 });
    expect(rh.length).toBe(1);
    expect(rh[0]!.title).toContain("ドラム");
    expect(rh[0]!.meter).toBe("4/4");
    expect(rh[0]!.tags).toEqual(expect.arrayContaining(["アナリーゼ", "候補"]));
    const rc = (rh[0]!.content as { rhythm: { steps: number; lanes: { name: string; hits: number[] }[] } }).rhythm;
    expect(rc.steps).toBe(16);
    const lane = (nm: string) => rc.lanes.find((l) => l.name === nm)!.hits;
    expect(lane("Kick")).toEqual([0, 8]);
    expect(lane("Snare")).toEqual([4, 12]);
    expect(lane("HiHat")).toEqual([0, 4, 8, 12]);
  });

  it("#S12改3 crashで区間が割れる曲＝区間ごとに別ドラムネタ＋overlay.sectionsに境界", async () => {
    const core = new Core(openDb(":memory:"));
    core.enqueueJob({ intent: "audio_analyze", params: { filename: "song.mp3", audio_b64: "x" } });
    const claimed = core.claimQueued(["audio_analyze"])!;
    // 前半16小節=8ビート / 後半16小節=四つ打ち。各区間頭(bar0/bar16)にcrash＝crashで2区間に割れる。
    const bpm = 120, bp = 60 / bpm, meter = 4;
    const drum: [number, string, number][] = [];
    for (let bar = 0; bar < 32; bar++) {
      const kicks = bar < 16 ? [0, 2] : [0, 1, 2, 3];
      for (const b of kicks) drum.push([(bar * meter + b) * bp, "kick", 1]);
      for (const b of [1, 3]) drum.push([(bar * meter + b) * bp, "snare", 1]);
      for (const b of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]) drum.push([(bar * meter + b) * bp, "hihat", 1]);
    }
    drum.push([0, "crash", 5], [16 * meter * bp, "crash", 5]);
    drum.sort((a, b) => a[0] - b[0]);
    const bt = Array.from({ length: 32 * meter + 4 }, (_, i) => i * bp);
    const fakeAnalyze = async () => ({ bpm, key: { key: "C", mode: "major" }, beat_times: bt, drum_onsets: drum, chords_timeline: [[0, 4, "C"]] });
    await runAudioAnalyzeJob(core, claimed, async () => "2区間", fakeAnalyze);
    core.reapResults();
    // 区間ごとに rhythm ネタ＝2枚（8ビート区間 / 四つ打ち区間）
    const rh = core.listNeta({ kind: "rhythm", scope: "all", limit: 10 });
    expect(rh.length).toBe(2);
    // 複数区間なので title に時刻レンジ（0:00–…）
    expect(rh.every((r) => /\d+:\d\d–\d+:\d\d/.test(r.title))).toBe(true);
    const kicks = rh.map((r) => (r.content as { rhythm: { lanes: { name: string; hits: number[] }[] } }).rhythm.lanes.find((l) => l.name === "Kick")!.hits);
    expect(kicks).toContainEqual([0, 8]);        // 8ビート区間
    expect(kicks).toContainEqual([0, 4, 8, 12]); // 四つ打ち区間
    // overlay.sections に crash 由来の区間境界（人間が Aメロ/サビ に付け替える種）
    const an = core.listNeta({ kind: "analysis", scope: "all", limit: 5 })[0]!;
    const secs = (an.content as { overlay: { sections: { from_t: number; to_t: number; label: string }[] } }).overlay.sections;
    expect(secs.length).toBe(2);
    expect(secs[0]!.to_t).toBeCloseTo(secs[1]!.from_t, 1); // 連続して曲を覆う
  });

  it("#S12改3 bass_notes があれば区間ごとに絶対音ベースネタ（秒→拍・区間頭=beat0）", async () => {
    const core = new Core(openDb(":memory:"));
    core.enqueueJob({ intent: "audio_analyze", params: { filename: "song.mp3", audio_b64: "x" } });
    const claimed = core.claimQueued(["audio_analyze"])!;
    const bpm = 120, bp = 60 / bpm, meter = 4; // 1拍=0.5s。1小節=2s。
    const drum: [number, string, number][] = [];
    for (let bar = 0; bar < 32; bar++) {
      const kicks = bar < 16 ? [0, 2] : [0, 1, 2, 3];
      for (const b of kicks) drum.push([(bar * meter + b) * bp, "kick", 1]);
      for (const b of [1, 3]) drum.push([(bar * meter + b) * bp, "snare", 1]);
      for (const b of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]) drum.push([(bar * meter + b) * bp, "hihat", 1]);
    }
    drum.push([0, "crash", 5], [16 * meter * bp, "crash", 5]);
    drum.sort((a, b) => a[0] - b[0]);
    const bt = Array.from({ length: 32 * meter + 4 }, (_, i) => i * bp);
    // ベース＝各小節頭に1音(2s=4拍長)・区間0(0-32s)は C2(36)・区間1(32-64s)は G2(43)
    const bass: [number, number, number][] = [];
    for (let bar = 0; bar < 32; bar++) { const t = bar * meter * bp; bass.push([t, t + 2, bar < 16 ? 36 : 43]); }
    const fakeAnalyze = async () => ({ bpm, key: { key: "C", mode: "major" }, beat_times: bt, drum_onsets: drum, bass_notes: bass, chords_timeline: [[0, 4, "C"]] });
    await runAudioAnalyzeJob(core, claimed, async () => "bass", fakeAnalyze);
    core.reapResults();
    const bn = core.listNeta({ kind: "bass", scope: "all", limit: 10 });
    expect(bn.length).toBe(2); // 2区間ぶん
    for (const b of bn) {
      const notes = (b.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;
      expect(notes.length).toBeGreaterThan(0);
      expect(notes[0]!.start).toBeCloseTo(0, 1); // 区間頭=beat0
      expect(notes[0]!.dur).toBeCloseTo(4, 1);   // 2s=4拍
      expect(notes.every((x) => x.pitch >= 28 && x.pitch <= 55)).toBe(true); // 低域
    }
    // 区間ごとにピッチが違う（C2 vs G2）＝区間で正しく切れてる
    const pitchOf = (b: (typeof bn)[number]) => (b.content as { notes: { pitch: number }[] }).notes[0]!.pitch;
    expect(new Set(bn.map(pitchOf)).size).toBe(2);
  });

  it("W1 bass_notes が facts にあれば analysis.raw.bass_notes に生データ保存（read_neta/ワークベンチで読み返せる）", async () => {
    const core = new Core(openDb(":memory:"));
    core.enqueueJob({ intent: "audio_analyze", params: { filename: "song.mp3", audio_b64: "x" } });
    const claimed = core.claimQueued(["audio_analyze"])!;
    const bpm = 120, bp = 60 / bpm, meter = 4;
    const bt = Array.from({ length: 8 }, (_, i) => i * bp);
    // bass = [[start_sec, end_sec, midi], ...]
    const bass: [number, number, number][] = [[0, 2, 36], [2, 4, 43]];
    const fakeAnalyze = async () => ({ bpm, key: { key: "C", mode: "major" }, beat_times: bt, meter, bass_notes: bass, chords_timeline: [[0, 4, "C"]] });
    await runAudioAnalyzeJob(core, claimed, async () => "bassraw", fakeAnalyze);
    core.reapResults();
    const an = core.listNeta({ kind: "analysis", scope: "all", limit: 5 })[0]!;
    const raw = (an.content as { raw: { bass_notes?: [number, number, number][] } }).raw;
    expect(raw.bass_notes).toEqual(bass); // facts の bass 採譜を無加工で保存
  });

  it("W1 後方互換：bass_notes が facts に無いときは raw.bass_notes は欠落（undefined）", async () => {
    const core = new Core(openDb(":memory:"));
    core.enqueueJob({ intent: "audio_analyze", params: { filename: "song.mp3", audio_b64: "x" } });
    const claimed = core.claimQueued(["audio_analyze"])!;
    const fakeAnalyze = async () => ({ bpm: 120, meter: 4, key: { key: "C", mode: "major" }, beat_times: [0, 1, 2, 3], chords_timeline: [[0, 4, "C"]] });
    await runAudioAnalyzeJob(core, claimed, async () => "nobass", fakeAnalyze);
    core.reapResults();
    const an = core.listNeta({ kind: "analysis", scope: "all", limit: 5 })[0]!;
    const raw = (an.content as { raw: { bass_notes?: unknown } }).raw;
    expect(raw.bass_notes).toBeUndefined();
  });

  it("#S12改3 melody_notes も同じ機構で区間ごとに melody ネタ（vocal 展開＝bassと共通）", async () => {
    const core = new Core(openDb(":memory:"));
    core.enqueueJob({ intent: "audio_analyze", params: { filename: "song.mp3", audio_b64: "x" } });
    const claimed = core.claimQueued(["audio_analyze"])!;
    const bpm = 120, bp = 60 / bpm, meter = 4;
    const drum: [number, string, number][] = [];
    for (let bar = 0; bar < 32; bar++) {
      const kicks = bar < 16 ? [0, 2] : [0, 1, 2, 3];
      for (const b of kicks) drum.push([(bar * meter + b) * bp, "kick", 1]);
      for (const b of [1, 3]) drum.push([(bar * meter + b) * bp, "snare", 1]);
      for (const b of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]) drum.push([(bar * meter + b) * bp, "hihat", 1]);
    }
    drum.push([0, "crash", 5], [16 * meter * bp, "crash", 5]);
    drum.sort((a, b) => a[0] - b[0]);
    const bt = Array.from({ length: 32 * meter + 4 }, (_, i) => i * bp);
    // メロ＝各小節頭に1音（vocal域 midi72=C5）
    const mel: [number, number, number][] = [];
    for (let bar = 0; bar < 32; bar++) { const t = bar * meter * bp; mel.push([t, t + 1, 72]); }
    const fakeAnalyze = async () => ({ bpm, key: { key: "C", mode: "major" }, beat_times: bt, drum_onsets: drum, melody_notes: mel, chords_timeline: [[0, 4, "C"]] });
    await runAudioAnalyzeJob(core, claimed, async () => "mel", fakeAnalyze);
    core.reapResults();
    const mn = core.listNeta({ kind: "melody", scope: "all", limit: 10 });
    expect(mn.length).toBe(2); // 2区間ぶん
    const notes0 = (mn[0]!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;
    expect(notes0.length).toBeGreaterThan(0);
    expect(notes0[0]!.start).toBeCloseTo(0, 1);         // 区間頭=beat0
    expect(notes0.every((x) => x.pitch === 72)).toBe(true); // vocal域を保持
    expect(mn[0]!.title).toContain("メロ");
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

  // 失敗文言の生パス丸め（2026-07-15）：yt-dlp/analyze.py の生失敗は絶対パスを含む＝ユーザーに晒さない。
  it("失敗 message に絶対パスが混じらない（詳細はサーバログのみ）", async () => {
    const core = new Core(openDb(":memory:"));
    core.enqueueJob({ intent: "audio_analyze", params: { filename: "x.mp3", audio_b64: "" } });
    const claimed = core.claimQueued(["audio_analyze"])!;
    // 実際の run() reject 形状＝`<絶対パス>/python failed (1): <stderr にパス>`。
    await runAudioAnalyzeJob(core, claimed, async () => "", async () => {
      throw new Error("/home/shuraba_p/projects/creative_manager/_audio_poc/.venv/bin/python failed (1): No such file: /tmp/cm-audio-xxx/dl.mp3");
    });
    const err = core.getJob(claimed.id)!.error!;
    expect(err).not.toContain("/home/shuraba_p"); // 内部絶対パスが出ない
    expect(err).not.toContain("/tmp/cm-audio"); // stderr のパスも出ない
    expect(err).toContain("解析に失敗しました"); // ユーザー向け1行
  });

  it("userFacingFailure：停止/短文は保持・パス/ダンプ/timeout は1行へ丸める", () => {
    expect(userFacingFailure("停止しました")).toBe("停止しました"); // ユーザー操作は区別を保つ
    expect(userFacingFailure("analyze boom")).toBe("analyze boom"); // パスもダンプも無い短文は保持
    expect(userFacingFailure("/usr/bin/yt-dlp failed (1): ERROR")).toContain("解析に失敗しました");
    expect(userFacingFailure("/usr/bin/yt-dlp failed (1): ERROR")).not.toMatch(/\//);
    expect(userFacingFailure("python timeout")).toContain("解析に失敗しました");
  });
});
