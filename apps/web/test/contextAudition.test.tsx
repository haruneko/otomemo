import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

// アレンジS1「文脈試聴」（正準＝docs/design.md「### アレンジS1＝写像規則の契約」の「文脈試聴」項）：
//   現状の候補試聴は単体音ワンショット（kind:"notes"・loop 無し）。S1 は候補 content を
//   **いま編集中のコード楽器ネタの差し替え**としてセクション可聴合成（kind:"tree"・audibleChildren）へ流し込み、
//   startPlayback の既存 loop を付けて鳴らす＝「主旋律と一緒にループ試聴」。入口は既存 PatternImportDialog を使い回す。
// 契約（このテストが正典の写し）：
//  (a) セクション文脈あり＝▶で buildPlayback({kind:"tree", children:…差し替え済み…}) ＋ startPlayback に loop。
//  (b) 文脈なし（auditionCtx 未配線 / このネタがセクションに居ない）＝従来のワンショット（kind:"notes"・loop 無し）。
//  (c) ダイアログを閉じたら停止（既存 onClose→ppPlay.stop の流儀のまま）。
//  (d) ベース/ドラムエディタ経由＝S1 スコープ外＝挙動不変（kind:"notes"・loop 無し）。

const api = vi.hoisted(() => ({ listNeta: vi.fn(), music: vi.fn() }));
vi.mock("../src/api", () => ({ api }));
vi.mock("../src/components/MiniRoll", () => ({ MiniRoll: () => <div data-testid="mini-roll" /> }));

// 再生は鳴らさない（部分モック＝startPlayback だけ差し替え）。返るハンドルの stop で「閉じたら停止」を見る。
const stop = vi.hoisted(() => vi.fn());
const startPlayback = vi.hoisted(() => vi.fn(async (_plan: unknown, _opts?: unknown) => ({ stop })));
vi.mock("../src/playback", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, startPlayback };
});
// music は部分モック＝buildPlayback だけ本物を包んで「渡された PlaybackSource」を記録する（実音化は本物）。
vi.mock("../src/music", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, buildPlayback: vi.fn(actual.buildPlayback as (...a: unknown[]) => unknown) };
});

import { ChordPatternEditor } from "../src/components/ChordPatternEditor";
import { BassStepEditor } from "../src/components/BassStepEditor";
import { RhythmEditor } from "../src/components/RhythmEditor";
import { buildPlayback, type ChordPatternContent, type PlaybackSource } from "../src/music";
import { contextAuditionPlan, type ContextAuditionCtx } from "../src/contextAudition";

const bp = buildPlayback as unknown as ReturnType<typeof vi.fn>;
const lastSource = (): PlaybackSource => bp.mock.calls[bp.mock.calls.length - 1]![0] as PlaybackSource;

const mkNeta = (over: Partial<Neta> = {}): Neta => ({
  id: "n1", kind: "chord_pattern", title: "KB-PAD", text: null,
  content: null, key: 0, mode: null, tempo: null, meter: null,
  bars: null, mood: null, scope: "library", tags: [], created: "", updated: "", ...over,
});

// 候補（ライブラリのネタ）＝ダイアログに並ぶ1件。content が「差し替える中身」。
const CAND_CONTENT = { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 }, steps: 16, hits: [{ step: 4, dur: 4 }], patternId: "KB-STAB" };
const candNeta = mkNeta({ id: "cand1", content: CAND_CONTENT });

const pat = (over: Partial<ChordPatternContent> = {}): ChordPatternContent => ({
  mode: "strum",
  voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 },
  steps: 16,
  hits: [{ step: 0, dur: 4 }],
  ...over,
});

// ── セクション文脈（api.getComposition の返りそのままの形）──
const MELODY_CONTENT = { notes: [{ pitch: 72, start: 0, dur: 1 }] };
const CHORDS_CONTENT = { chords: [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 5, quality: "", start: 4, dur: 4 }] };
const EDITING_CONTENT = { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 }, steps: 16, hits: [{ step: 0, dur: 4 }] };

const section = (over: Partial<Neta> = {}): Neta =>
  mkNeta({ id: "sec1", kind: "section", title: "Aメロ", content: {}, key: 0, mode: "major", tempo: 100, meter: "4/4", bars: null, ...over });

const child = (neta: Neta, position = 0, ord = 0) => ({ position, ord, node: { neta, children: [] } });

const ctx = (over: Partial<ContextAuditionCtx> = {}): ContextAuditionCtx => ({
  section: section(),
  children: [
    child(mkNeta({ id: "ch", kind: "chord_progression", content: CHORDS_CONTENT })),
    child(mkNeta({ id: "mel", kind: "melody", content: MELODY_CONTENT })),
    child(mkNeta({ id: "n1", kind: "chord_pattern", content: EDITING_CONTENT })),
  ],
  childNetaId: "n1",
  ...over,
});

const openAndPreview = async () => {
  await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
  await userEvent.click(await screen.findByLabelText("import-preview-0"));
};

describe("S1 文脈試聴：contextAuditionPlan（純関数＝合成と loop の契約）", () => {
  beforeEach(() => { vi.clearAllMocks(); api.listNeta.mockResolvedValue([candNeta]); });

  it("(a) 編集中ネタ（childNetaId）の content だけが候補に差し替わり、他の子はそのまま", () => {
    const got = contextAuditionPlan(ctx(), CAND_CONTENT);
    expect(got).not.toBeNull();
    const src = lastSource() as Extract<PlaybackSource, { kind: "tree" }>;
    expect(src.kind).toBe("tree");
    expect(src.children).toHaveLength(3);
    const byId = (id: string) => src.children.find((c) => (c.node.neta as { id?: string }).id === id)!;
    expect(byId("n1").node.neta.content).toBe(CAND_CONTENT); // 差し替え（重ねではない＝伴奏が二重に鳴らない）
    expect(byId("mel").node.neta.content).toBe(MELODY_CONTENT); // 主旋律はそのまま＝一緒に鳴る
    expect(byId("ch").node.neta.content).toBe(CHORDS_CONTENT);
    expect(src.key).toBe(0);
    expect(src.mode).toBe("major");
    expect(src.tempo).toBe(100);
    expect(src.meter).toBe("4/4");
  });

  it("(a) loop＝0拍〜セクション総拍（既定8小節×4拍＝32拍）", () => {
    expect(contextAuditionPlan(ctx(), CAND_CONTENT)!.loop).toEqual({ startBeat: 0, endBeat: 32 });
  });

  it("(a) セクション尺は neta.bars と中身の長い方（bars=2 でも中身が8小節なら32拍のまま／bars=12 なら48拍）", () => {
    expect(contextAuditionPlan(ctx({ section: section({ bars: 12 }) }), CAND_CONTENT)!.loop.endBeat).toBe(48);
    expect(contextAuditionPlan(ctx({ section: section({ bars: 2 }) }), CAND_CONTENT)!.loop.endBeat).toBe(32);
  });

  it("(a) レーンミュートは尊重（melody ミュート＝合成から外れる）／ただし編集中ネタ自身は必ず鳴る", () => {
    const muted = ctx({ section: section({ content: { lanes_muted: ["melody", "chord_pattern"] } }) });
    expect(contextAuditionPlan(muted, CAND_CONTENT)).not.toBeNull();
    const src = lastSource() as Extract<PlaybackSource, { kind: "tree" }>;
    const ids = src.children.map((c) => (c.node.neta as { id?: string }).id);
    expect(ids).not.toContain("mel"); // ミュートしたレーンは鳴らさない（getPlan と同じ audibleChildren）
    expect(ids).toContain("n1"); // ▶を押した候補だけは必ず鳴る
    expect(src.children.find((c) => (c.node.neta as { id?: string }).id === "n1")!.node.neta.content).toBe(CAND_CONTENT);
  });

  it("(b) このネタがセクションに居ない／子が空＝null（＝呼び側はワンショットへフォールバック）", () => {
    expect(contextAuditionPlan(ctx({ childNetaId: "zzz" }), CAND_CONTENT)).toBeNull();
    expect(contextAuditionPlan(ctx({ children: [] }), CAND_CONTENT)).toBeNull();
  });
});

describe("S1 文脈試聴：ChordPatternEditor の▶（コード楽器エディタだけ格上げ）", () => {
  beforeEach(() => { vi.clearAllMocks(); api.listNeta.mockResolvedValue([candNeta]); });

  it("(a) 文脈あり＝kind:'tree'（差し替え済み）＋ startPlayback に loop が渡る", async () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} meter="4/4" tempo={100} keyPc={0} auditionCtx={ctx()} />);
    await openAndPreview();
    const src = lastSource() as Extract<PlaybackSource, { kind: "tree" }>;
    expect(src.kind).toBe("tree");
    expect(src.children.find((c) => (c.node.neta as { id?: string }).id === "n1")!.node.neta.content).toBe(CAND_CONTENT);
    expect(startPlayback).toHaveBeenCalledTimes(1);
    expect(startPlayback.mock.calls[0]![1]).toEqual({ vocalMode: "peek", loop: { startBeat: 0, endBeat: 32 } });
  });

  it("(b) 文脈なし（auditionCtx 未配線）＝従来のワンショット（kind:'notes'・loop 無し）", async () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} meter="4/4" tempo={100} keyPc={0} />);
    await openAndPreview();
    const src = lastSource();
    expect(src.kind).toBe("notes");
    expect(startPlayback.mock.calls[0]![1]).toEqual({ vocalMode: "peek" }); // loop キーを生やさない＝bit一致
  });

  it("(b) 文脈はあるがこのネタがセクションに居ない＝ワンショットへフォールバック", async () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} meter="4/4" tempo={100} keyPc={0} auditionCtx={ctx({ childNetaId: "zzz" })} />);
    await openAndPreview();
    expect(lastSource().kind).toBe("notes");
    expect(startPlayback.mock.calls[0]![1]).toEqual({ vocalMode: "peek" });
  });

  it("(a) 別候補の▶＝前の試聴を止めてから鳴らす（既存の試聴ハンドル停止の流儀）", async () => {
    api.listNeta.mockResolvedValue([candNeta, mkNeta({ id: "cand2", title: "KB-PUNCH", content: { ...CAND_CONTENT, patternId: "KB-PUNCH" } })]);
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} meter="4/4" tempo={100} keyPc={0} auditionCtx={ctx()} />);
    await openAndPreview();
    expect(stop).not.toHaveBeenCalled();
    await userEvent.click(screen.getByLabelText("import-preview-1"));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(startPlayback).toHaveBeenCalledTimes(2);
  });

  it("(c) ダイアログを閉じたら停止する", async () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} meter="4/4" tempo={100} keyPc={0} auditionCtx={ctx()} />);
    await openAndPreview();
    await userEvent.click(screen.getByLabelText("close"));
    expect(stop).toHaveBeenCalled();
    expect(screen.queryByLabelText("pattern-import")).toBeNull();
  });
});

describe("(d) ベース/ドラムエディタ経由＝S1 スコープ外＝挙動不変", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("ベースの▶＝kind:'notes'・loop 無し", async () => {
    api.listNeta.mockResolvedValue([mkNeta({ id: "b1", kind: "bass", content: { mode: "relative", steps: 16, pattern: [{ step: 0, degree: "R", dur: 4 }] } })]);
    render(<BassStepEditor pattern={[{ step: 0, degree: "R", dur: 4 }]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} meter="4/4" keyPc={0} tempo={100} />);
    await openAndPreview();
    expect(lastSource().kind).toBe("notes");
    expect(startPlayback.mock.calls[0]![1]).toEqual({ vocalMode: "peek" });
  });

  it("ドラムの▶＝kind:'notes'・loop 無し", async () => {
    const rhythm = { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "kick", midi: 36, hits: [0, 8] }] };
    api.listNeta.mockResolvedValue([mkNeta({ id: "r1", kind: "rhythm", content: { rhythm } })]);
    render(<RhythmEditor rhythm={rhythm} onChange={vi.fn()} meter="4/4" tempo={100} />);
    await openAndPreview();
    expect(lastSource().kind).toBe("notes");
    expect(startPlayback.mock.calls[0]![1]).toEqual({ vocalMode: "peek" });
  });
});
