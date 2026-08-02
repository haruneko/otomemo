import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

// Task1L（design「### Task1L＝空グリッドのゴーストCTA…」＝2026-08-02 オーナー裁定「A2 おすすめ」の案C部分）：
// **グリッドが空のときだけ**グリッド直下に薄い誘導（「ライブラリから読み込む／またはタップして自分で置く」）を出す。
//  (a) PatternImportControl の variant="ghost" が別 aria（pattern-ghost / pattern-ghost-cta）で出る＝
//      設定行の入口が握る pattern-picker / pattern-picker-toggle の一意性を壊さない（同時に居られる）。
//  (b) 押すと**同じ取込ダイアログ**が開き、onPick→onApply(content) 素通し＝取得/適用ロジックは不変（bit一致）。
//  (c) 既定 variant（"icon"）は現行のまま＝ゴーストは出ない（退避経路）。
//  (d) 3エディタ＝空でだけ出る・1つでも置けば消える・入口の非表示条件（管弦 showPicker=false／ベース6/8）を継承。
const api = vi.hoisted(() => ({ music: vi.fn(), listNeta: vi.fn() }));
vi.mock("../src/api", () => ({ api }));
vi.mock("../src/playback", () => ({ startPlayback: vi.fn(async () => null) }));
vi.mock("../src/components/MiniRoll", () => ({ MiniRoll: () => <div data-testid="mini-roll" /> }));

import { PatternImportControl } from "../src/components/PatternImportControl";
import { ChordPatternEditor } from "../src/components/ChordPatternEditor";
import { BassStepEditor } from "../src/components/BassStepEditor";
import { RhythmEditor } from "../src/components/RhythmEditor";
import type { ChordPatternContent } from "../src/music";

const neta = (over: Partial<Neta> = {}): Neta => ({
  id: "n1", kind: "chord_pattern", title: "GT-FOLK8", text: null,
  content: { patternId: "GT-FOLK8", hits: [{ step: 0, dur: 4 }] }, key: 0, mode: null, tempo: null, meter: null,
  bars: null, mood: null, scope: "library", tags: [], created: "", updated: "", ...over,
});

const pat = (over: Partial<ChordPatternContent> = {}): ChordPatternContent => ({
  mode: "strum",
  voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 },
  steps: 16,
  hits: [{ step: 0, dur: 4 }],
  ...over,
});

describe("Task1L PatternImportControl variant=ghost（案C の器）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("(a) ゴーストは文言つきCTA＋副文で出る／設定行の aria（pattern-picker*）は名乗らない", () => {
    render(<PatternImportControl variant="ghost" kind="chord_pattern" fallbackName="コード楽器" onApply={vi.fn()} onAudition={vi.fn()} />);
    const cta = screen.getByLabelText("pattern-ghost-cta");
    expect(cta.tagName).toBe("BUTTON");
    expect(cta.textContent).toContain("ライブラリから読み込む"); // 空のときだけの誘い文句＝ここは文言を出す
    expect(cta.querySelector("svg")).toBeTruthy(); // 取込アイコン（設定行の入口と同じ記号）
    expect(screen.getByLabelText("pattern-ghost").textContent).toContain("またはタップして自分で置く");
    // 設定行の入口と同時に居られるよう aria は別名（既存テストが握る一意性を壊さない）
    expect(screen.queryByLabelText("pattern-picker")).toBeNull();
    expect(screen.queryByLabelText("pattern-picker-toggle")).toBeNull();
  });

  it("(c) 既定 variant＝現行のアイコン入口のまま（ゴーストは出ない＝退避経路）", () => {
    render(<PatternImportControl kind="rhythm" fallbackName="おまかせ" onApply={vi.fn()} onAudition={vi.fn()} />);
    expect(screen.getByLabelText("pattern-picker-toggle")).toBeTruthy();
    expect(screen.queryByLabelText("pattern-ghost")).toBeNull();
  });

  it("(b) ゴースト押下＝同じ取込ダイアログ（listNeta {kind,scope:'all'}）→onPick で onApply(content) 素通し", async () => {
    api.listNeta.mockResolvedValue([neta()]);
    const onApply = vi.fn();
    render(<PatternImportControl variant="ghost" kind="chord_pattern" fallbackName="コード楽器" onApply={onApply} onAudition={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("pattern-ghost-cta"));
    expect(screen.getByLabelText("pattern-import")).toBeTruthy();
    const q = api.listNeta.mock.calls[0]![0] as { kind: string; scope: string };
    expect(q).toMatchObject({ kind: "chord_pattern", scope: "all" });
    await userEvent.click(await screen.findByLabelText("import-pick-0"));
    expect(onApply.mock.calls[0]![0]).toEqual({ patternId: "GT-FOLK8", hits: [{ step: 0, dur: 4 }] });
    expect(screen.queryByLabelText("pattern-import")).toBeNull(); // 採用で閉じる
  });
});

describe("Task1L 3エディタ＝空グリッドのときだけゴーストが出る", () => {
  beforeEach(() => vi.clearAllMocks());

  // --- コード楽器（両手＝右手 hit ＋ 左手 lh） ---
  it("(d) コード楽器：右手も左手も空＝ゴーストあり／設定行の入口も残る（後から差し替えが効く）", () => {
    render(<ChordPatternEditor pattern={pat({ hits: [] })} onChange={vi.fn()} />);
    expect(screen.getByLabelText("pattern-ghost")).toBeTruthy();
    expect(screen.getByLabelText("pattern-picker-toggle")).toBeTruthy(); // 常設の入口は消さない（案A＋案C併用）
  });

  it("(d) コード楽器：右手に1つでも置けばゴーストは消える（作業中は占有しない）", () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("pattern-ghost")).toBeNull();
  });

  it("(d) コード楽器：右手が空でも左手 preset（root 等）は鳴る＝空ではない＝ゴーストなし", () => {
    render(<ChordPatternEditor pattern={pat({ hits: [], lh: { mode: "root" } })} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("pattern-ghost")).toBeNull();
  });

  it("(d) コード楽器：左手 custom で hit 0 なら空扱い＝ゴーストあり", () => {
    render(<ChordPatternEditor pattern={pat({ hits: [], lh: { mode: "custom", hits: [] } })} onChange={vi.fn()} />);
    expect(screen.getByLabelText("pattern-ghost")).toBeTruthy();
  });

  it("(d) コード楽器：showPicker=false（管弦）は空でもゴーストを出さない＝入口の非表示条件を継承", () => {
    render(<ChordPatternEditor pattern={pat({ hits: [] })} onChange={vi.fn()} showPicker={false} />);
    expect(screen.queryByLabelText("pattern-ghost")).toBeNull();
  });

  // --- ベース（相対・段グリッド） ---
  it("(d) ベース：段が空＝ゴーストあり／1つ置けば消える", () => {
    const { unmount } = render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} />);
    expect(screen.getByLabelText("pattern-ghost")).toBeTruthy();
    unmount();
    render(<BassStepEditor pattern={[{ step: 0, degree: "R", dur: 2 }]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} />);
    expect(screen.queryByLabelText("pattern-ghost")).toBeNull();
  });

  it("(d) ベース：compound meter（6/8）は空でもゴーストを出さない＝入口の非表示条件を継承", () => {
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={12} onStepsChange={vi.fn()} meter="6/8" />);
    expect(screen.queryByLabelText("pattern-picker")).toBeNull(); // 既存＝入口も出ない
    expect(screen.queryByLabelText("pattern-ghost")).toBeNull();
  });

  // --- ドラム（レーン×hits） ---
  it("(d) ドラム：全レーン打点ゼロ＝ゴーストあり／1打あれば消える", () => {
    const { unmount } = render(
      <RhythmEditor rhythm={{ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [] }, { name: "Snare", midi: 38, hits: [] }] }} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("pattern-ghost")).toBeTruthy();
    unmount();
    render(
      <RhythmEditor rhythm={{ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }, { name: "Snare", midi: 38, hits: [] }] }} onChange={vi.fn()} />,
    );
    expect(screen.queryByLabelText("pattern-ghost")).toBeNull();
  });

  it("(b) 空グリッドのゴーストから読み込む＝従来の apply と同じ content 置換（ドラム）", async () => {
    api.listNeta.mockResolvedValue([
      neta({ id: "r1", kind: "rhythm", title: "DR-POP8", content: { rhythm: { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0, 8] }] }, patternId: "DR-POP8" } }),
    ]);
    const onChange = vi.fn();
    render(<RhythmEditor rhythm={{ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [] }] }} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("pattern-ghost-cta"));
    await userEvent.click(await screen.findByLabelText("import-pick-0"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toMatchObject({ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0, 8] }] });
  });
});
