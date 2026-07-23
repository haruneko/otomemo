import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

// Task1g（design「### Task1g＝パターン取得を『ネタ選択ダイアログでライブラリをブラウズ』へ作り直す」）：
// 3エディタの「⤓ ライブラリから読み込む」リンク→pick ダイアログ（PatternImportDialog）。TDD (a)-(e)：
//  (a) リンク→pick ダイアログが開く（place でない＝placeChild/copy_neta を呼ばない）。
//  (b) pick は library+project の当該 kind のみ（scope:"all"・kind 固定＝多kind混入なし・bass relative 番兵）。
//  (c) タップ＝onPick(neta)→applyPattern(neta.content)＝従来 apply と同一（content コピー・copy_neta 呼ばない）。
//  (d) place モード（SectionEditor/FormStrip）は無改修＝別テストで緑（本ファイルは copyNeta/placeChild 不使用を裏取り）。
//  (e) 試聴（auditionPattern）・genre/scene 絞り。
const api = vi.hoisted(() => ({ listNeta: vi.fn(), copyNeta: vi.fn(), placeChild: vi.fn(), music: vi.fn() }));
vi.mock("../src/api", () => ({ api }));
vi.mock("../src/playback", () => ({ startPlayback: vi.fn(async () => null) }));

import { startPlayback } from "../src/playback";
import { ChordPatternEditor } from "../src/components/ChordPatternEditor";
import { RhythmEditor } from "../src/components/RhythmEditor";
import { BassStepEditor } from "../src/components/BassStepEditor";
import { useEditHistory } from "../src/history";
import type { ChordPatternContent, RhythmContent, BassStep } from "../src/music";

if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === "undefined") {
  (globalThis as { PointerEvent?: unknown }).PointerEvent = class extends MouseEvent {} as unknown;
}

// ライブラリネタ（scope 混在の母集団）＝pick はこれを検索/ブラウズ。content をそのまま onPick へ返す。
const neta = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "n1", kind: "chord_pattern", title: "GT-FOLK8 フォーク", text: null, content: {},
  key: 0, mode: null, tempo: null, meter: null, bars: null, mood: null,
  scope: "library" as const, tags: [] as string[], created: "", updated: "", ...over,
});

const chordContent: ChordPatternContent = {
  mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 },
  steps: 16, hits: [{ step: 0, dur: 4 }], patternId: "GT-FOLK8",
};
const chordPat0: ChordPatternContent = {
  mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 },
  steps: 16, hits: [{ step: 0, dur: 4 }], program: 25,
};

describe("Task1g (a) リンク→pick ダイアログが開く（place でない）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("既定＝ダイアログ閉。リンク押下でダイアログが開く（copy_neta/place_child は呼ばれない）", async () => {
    api.listNeta.mockResolvedValue([]);
    render(<ChordPatternEditor pattern={chordPat0} onChange={vi.fn()} meter="4/4" keyPc={0} />);
    expect(screen.queryByLabelText("pattern-import")).toBeNull();
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    expect(screen.getByLabelText("pattern-import")).toBeTruthy(); // pick ダイアログ
    expect(api.copyNeta).not.toHaveBeenCalled();
    expect(api.placeChild).not.toHaveBeenCalled();
  });
});

describe("Task1g (b) 母集団＝library+project の当該 kind のみ（scope:all・kind 固定）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("chord＝listNeta を {kind:'chord_pattern', scope:'all'} で引く", async () => {
    api.listNeta.mockResolvedValue([neta({ content: chordContent })]);
    render(<ChordPatternEditor pattern={chordPat0} onChange={vi.fn()} meter="4/4" keyPc={0} />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await screen.findByLabelText("import-card-0");
    const q = api.listNeta.mock.calls[0]![0] as { kind: string; scope: string };
    expect(q.kind).toBe("chord_pattern");
    expect(q.scope).toBe("all"); // library（工場出荷）＋project（自作）を一括＝ライブラリを見せる
  });

  it("bass＝relative 番兵：絶対 notes ネタは母集団から捨て相対 content だけ出す", async () => {
    api.listNeta.mockResolvedValue([
      neta({ id: "abs", kind: "bass", title: "abs", content: { notes: [{ pitch: 40, start: 0, dur: 1 }] } }),
      neta({ id: "rel", kind: "bass", title: "RK-8ROOT", content: { mode: "relative", steps: 16, pattern: [{ step: 0, degree: "R", dur: 4 }], patternId: "RK-8ROOT" } }),
    ]);
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} keyPc={0} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await screen.findByLabelText("import-card-0");
    expect(screen.getByLabelText("import-card-0").textContent).toContain("RK-8ROOT");
    expect(screen.queryByLabelText("import-card-1")).toBeNull(); // 絶対は捨てられ相対1件のみ
    const q = api.listNeta.mock.calls[0]![0] as { kind: string; scope: string };
    expect(q.kind).toBe("bass");
    expect(q.scope).toBe("all");
  });
});

describe("Task1g (c) タップ＝onPick→applyPattern(content)（copy_neta 呼ばない・従来 apply と同一）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("chord＝content 置換で patternId 刻む・program 保持／Undo で戻る／copy_neta 不使用", async () => {
    api.listNeta.mockResolvedValue([neta({ content: chordContent })]);
    const user = userEvent.setup();
    function Harness() {
      const [pat, setPat] = useState<ChordPatternContent>(chordPat0);
      const hist = useEditHistory(pat, setPat, { resetKey: "x" });
      return (
        <>
          <ChordPatternEditor pattern={pat} onChange={setPat} meter="4/4" keyPc={0} program={25} />
          <button aria-label="undo" onClick={hist.undo}>undo</button>
          <span aria-label="pid">{pat.patternId ?? "none"}</span>
          <span aria-label="prog">{pat.program ?? "none"}</span>
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByLabelText("pattern-picker-toggle"));
    await user.click(await screen.findByLabelText("import-pick-0"));
    expect(screen.getByLabelText("pid").textContent).toBe("GT-FOLK8"); // content の patternId
    expect(screen.getByLabelText("prog").textContent).toBe("25"); // 現ネタ program 継承（apply 不変）
    expect(api.copyNeta).not.toHaveBeenCalled(); // pick は content コピー＝copy_neta を呼ばない
    expect(screen.queryByLabelText("pattern-import")).toBeNull(); // 採用でダイアログを閉じる
    await user.click(screen.getByLabelText("undo"));
    expect(screen.getByLabelText("pid").textContent).toBe("none");
  });

  it("rhythm＝rhythm 置換で patternId 刻む・kit 保持", async () => {
    const drum = { rhythm: { steps: 16, bars: 1, lanes: [{ name: "Kick", midi: 36, hits: [0, 4, 8, 12], vel: 115 }], patternId: "four.rock" } as RhythmContent };
    api.listNeta.mockResolvedValue([neta({ id: "r1", kind: "rhythm", title: "four.rock", content: drum })]);
    const user = userEvent.setup();
    function Harness() {
      const [r, setR] = useState<RhythmContent>({ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }], kit: 8 });
      return (
        <>
          <RhythmEditor rhythm={r} onChange={setR} meter="4/4" tempo={120} />
          <span aria-label="pid">{r.patternId ?? "none"}</span>
          <span aria-label="kit">{r.kit ?? "none"}</span>
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByLabelText("pattern-picker-toggle"));
    await user.click(await screen.findByLabelText("import-pick-0"));
    expect(screen.getByLabelText("pid").textContent).toBe("four.rock");
    expect(screen.getByLabelText("kit").textContent).toBe("8"); // kit（音色）保持
    expect(api.copyNeta).not.toHaveBeenCalled();
  });

  it("bass＝onApplyPattern に pattern/steps/patternId を渡す（copy_neta 不使用）", async () => {
    const pat: BassStep[] = [{ step: 0, degree: "R", dur: 4 }, { step: 8, degree: "5", dur: 4 }];
    api.listNeta.mockResolvedValue([neta({ id: "rel", kind: "bass", title: "RK-8ROOT", content: { mode: "relative", steps: 16, pattern: pat, patternId: "RK-8ROOT" } })]);
    const onApplyPattern = vi.fn();
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} keyPc={0} meter="4/4" onApplyPattern={onApplyPattern} />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await userEvent.click(await screen.findByLabelText("import-pick-0"));
    expect(onApplyPattern).toHaveBeenCalledWith({ pattern: pat, steps: 16, patternId: "RK-8ROOT" });
    expect(api.copyNeta).not.toHaveBeenCalled();
  });
});

describe("Task1g (e) 試聴＋genre/scene 絞り", () => {
  beforeEach(() => vi.clearAllMocks());

  it("▶＝auditionPattern→startPlayback（rhythm）", async () => {
    const drum = { rhythm: { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0, 4, 8, 12] }], patternId: "four.rock" } as RhythmContent };
    api.listNeta.mockResolvedValue([neta({ id: "r1", kind: "rhythm", title: "four.rock", content: drum })]);
    render(<RhythmEditor rhythm={{ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }] }} onChange={vi.fn()} meter="4/4" tempo={120} />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await userEvent.click(await screen.findByLabelText("import-preview-0"));
    expect(vi.mocked(startPlayback)).toHaveBeenCalled();
  });

  it("genre 絞り＝select で genre タグ一致だけ残す", async () => {
    api.listNeta.mockResolvedValue([
      neta({ id: "a", title: "A rock", content: chordContent, tags: ["genre:rock"] }),
      neta({ id: "b", title: "B rock", content: chordContent, tags: ["genre:rock"] }),
      neta({ id: "c", title: "C ballad", content: chordContent, tags: ["genre:ballad"] }),
    ]);
    render(<ChordPatternEditor pattern={chordPat0} onChange={vi.fn()} meter="4/4" keyPc={0} />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await screen.findByLabelText("import-card-2"); // 3件
    await userEvent.selectOptions(screen.getByLabelText("import-genre"), "rock");
    expect(screen.getByLabelText("import-card-1")).toBeTruthy();
    expect(screen.queryByLabelText("import-card-2")).toBeNull(); // ballad が消え2件
  });

  it("scene 絞り＝コード楽器のみ scene select が出て scene タグ一致だけ残す", async () => {
    api.listNeta.mockResolvedValue([
      neta({ id: "a", title: "verse one", content: chordContent, tags: ["scene:verse"] }),
      neta({ id: "b", title: "chorus one", content: chordContent, tags: ["scene:chorus"] }),
    ]);
    render(<ChordPatternEditor pattern={chordPat0} onChange={vi.fn()} meter="4/4" keyPc={0} />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await screen.findByLabelText("import-card-1");
    await userEvent.selectOptions(screen.getByLabelText("import-scene"), "verse");
    expect(screen.getByLabelText("import-card-0").textContent).toContain("verse one");
    expect(screen.queryByLabelText("import-card-1")).toBeNull();
  });

  it("rhythm/bass は scene select を出さない（コード楽器のみ）", async () => {
    api.listNeta.mockResolvedValue([neta({ id: "r1", kind: "rhythm", title: "four.rock", content: { rhythm: { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }], patternId: "four.rock" } }, tags: ["scene:verse"] })]);
    render(<RhythmEditor rhythm={{ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }] }} onChange={vi.fn()} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await screen.findByLabelText("import-card-0");
    expect(screen.queryByLabelText("import-scene")).toBeNull();
  });
});
