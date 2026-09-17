import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// 2026-09-17 オーナー裁定：小節数ボタンの上限を内容の小節数に合わせ、縮めたらはみ出した打点を内容から切る
// （和音パターン／相対ベース／ドラムの3エディタ共通・/gen の「セクション末で切り詰め」と同じ規則）。
const api = vi.hoisted(() => ({ music: vi.fn(), listNeta: vi.fn() }));
vi.mock("../src/api", () => ({ api }));
vi.mock("../src/playback", () => ({ startPlayback: vi.fn(async () => null) }));

import { trimChordPatternSteps, trimBassPatternSteps, trimRhythmSteps, type ChordPatternContent, type RhythmContent } from "../src/music";
import { ChordPatternEditor } from "../src/components/ChordPatternEditor";
import { BassStepEditor } from "../src/components/BassStepEditor";
import { RhythmEditor } from "../src/components/RhythmEditor";

const cp8 = (): ChordPatternContent => ({
  mode: "strum",
  voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 },
  steps: 128,
  hits: [
    { step: 0, dur: 16 },
    { step: 104, dur: 16 }, // 7小節目頭〜8小節目頭（7小節へ縮めると跨ぐ）
    { step: 120, dur: 2.5, notes: [{ deg: "R", oct: 1 }] }, // 8小節目（外）
  ],
  lh: { mode: "custom", hits: [{ step: 0, dur: 8, deg: "R", oct: -1 }, { step: 108, dur: 16, deg: "5" }, { step: 124, dur: 4, deg: "R" }] },
});

describe("小節数を縮めたら打点を切る（純関数）", () => {
  it("和音パターン：外で始まる打点は落とし、跨ぐ打点は格子の終わりまで詰める（右手・左手）", () => {
    const t = trimChordPatternSteps(cp8(), 112);
    expect(t.steps).toBe(112);
    expect(t.hits).toEqual([{ step: 0, dur: 16 }, { step: 104, dur: 8 }]);
    expect(t.lh!.hits).toEqual([{ step: 0, dur: 8, deg: "R", oct: -1 }, { step: 108, dur: 4, deg: "5" }]);
  });
  it("和音パターン：伸ばすときは打点を触らない", () => {
    const src = cp8();
    expect(trimChordPatternSteps(src, 144)).toEqual({ ...src, steps: 144 });
  });
  it("相対ベース：外の音は落とし、跨ぐ音は詰める", () => {
    expect(trimBassPatternSteps([{ step: 0, degree: "R", dur: 4 }, { step: 14, degree: "5", dur: 4 }, { step: 16, degree: "R", dur: 2 }], 16))
      .toEqual([{ step: 0, degree: "R", dur: 4 }, { step: 14, degree: "5", dur: 2 }]);
  });
  it("ドラム：hits と同順の velCurve・divs・物理フィルも一緒に切る", () => {
    const r: RhythmContent = {
      steps: 32, bars: 2,
      lanes: [{ name: "Snare", midi: 38, hits: [4, 12, 20, 28], velCurve: [90, 91, 92, 93], divs: { "12": 2, "20": 3 } }],
      fillNotes: [{ beat: 7.5, midi: 38, velocity: 80 }], fillBar: 1, fillKind: "x",
    };
    const t = trimRhythmSteps(r, 16);
    expect(t.steps).toBe(16);
    expect(t.bars).toBe(1);
    expect(t.lanes[0]).toEqual({ name: "Snare", midi: 38, hits: [4, 12], velCurve: [90, 91], divs: { "12": 2 } });
    expect(t.fillNotes).toBeUndefined();
    expect(t.fillBar).toBeUndefined();
    expect(t.fillKind).toBeUndefined();
  });
});

describe("エディタの小節数ボタン（上限＝4 と内容の小節数の大きい方）", () => {
  it("和音パターン：8小節の内容は上限8・1つ縮めると外の打点が消える", () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={cp8()} onChange={onChange} />);
    expect(screen.getByLabelText("bars-count").textContent).toBe("8");
    expect((screen.getByLabelText("bars-inc") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("bars-dec"));
    const next = onChange.mock.calls.at(-1)![0] as ChordPatternContent;
    expect(next.steps).toBe(112);
    expect(next.hits.every((h) => h.step + h.dur <= 112)).toBe(true);
    expect(next.lh!.hits!.every((h) => h.step + h.dur <= 112)).toBe(true);
  });
  it("相対ベース：8小節の内容を縮めると外の音を切った pattern と steps を返す", () => {
    const onChange = vi.fn(), onSteps = vi.fn();
    render(<BassStepEditor pattern={[{ step: 0, degree: "R", dur: 4 }, { step: 120, degree: "5", dur: 4 }]} onChange={onChange} steps={128} onStepsChange={onSteps} />);
    expect(screen.getByLabelText("bars-count").textContent).toBe("8");
    fireEvent.click(screen.getByLabelText("bars-dec"));
    expect(onChange).toHaveBeenCalledWith([{ step: 0, degree: "R", dur: 4 }]);
    expect(onSteps).toHaveBeenCalledWith(112);
  });
  it("ドラム：8小節の内容を縮めると外の打点が消える", () => {
    const onChange = vi.fn();
    render(<RhythmEditor rhythm={{ steps: 128, lanes: [{ name: "Kick", midi: 36, hits: [0, 120] }] }} onChange={onChange} />);
    expect(screen.getByLabelText("bars-count").textContent).toBe("8");
    fireEvent.click(screen.getByLabelText("bars-dec"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ steps: 112, lanes: [{ name: "Kick", midi: 36, hits: [0] }] }));
  });
});
