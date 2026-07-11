import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkeletonEditor } from "../src/components/SkeletonEditor";
import type { SkeletonBreakpoint } from "../src/music";

// audio は jsdom で鳴らさない（previewNote は握りつぶし）。
vi.mock("../src/audio", () => ({ previewNote: vi.fn() }));

function setup(over: Partial<React.ComponentProps<typeof SkeletonEditor>> = {}) {
  const tones: SkeletonBreakpoint[] = [{ start: 0, pitch: 64 }, { start: 4, pitch: 67 }, { start: 8, pitch: null }];
  const bass: SkeletonBreakpoint[] = [{ start: 0, pitch: 48 }];
  const phrases = [{ endBeat: 8, cadence: "half" }, { endBeat: 16, cadence: "full" }];
  const setTones = vi.fn(), setBass = vi.fn(), setPhrases = vi.fn(), setCounterpoint = vi.fn();
  render(
    <SkeletonEditor
      tones={tones} setTones={setTones}
      bass={bass} setBass={setBass}
      phrases={phrases} setPhrases={setPhrases}
      bars={4} meter="4/4" keyPc={0} keyMode="major"
      chords={[{ root: 0, quality: "", start: 0, dur: 16 }]}
      rollMode="draw" counterpoint setCounterpoint={setCounterpoint}
      {...over}
    />,
  );
  return { tones, bass, phrases, setTones, setBass, setPhrases, setCounterpoint };
}

describe("SkeletonEditor（design #20 S2）", () => {
  it("ツールバー＝スナップ/入力先/ベース表示/再生/機械に叩き台", () => {
    setup();
    expect(screen.getByLabelText("snap")).toBeTruthy();
    expect(screen.getByLabelText("input-voice")).toBeTruthy();
    expect(screen.getByLabelText("fold-oct")).toBeTruthy();
    expect(screen.getByLabelText("play-mode")).toBeTruthy();
    expect(screen.getByLabelText("gen-skeleton-stub")).toBeTruthy();
  });

  it("メロ点＋ベース点を描画（null点は帯を描かない）", () => {
    const { container } = { container: document.body };
    setup();
    // メロ実音2点＋ベース1点＝skel-pt 3個（null点は点を出さない）
    expect(container.querySelectorAll(".skel-pt").length).toBe(3);
    expect(container.querySelectorAll(".skel-pt.mel").length).toBe(2);
    expect(container.querySelectorAll(".skel-pt.bass").length).toBe(1);
  });

  it("句チップのタップで終止 full↔half を反転", async () => {
    const { setPhrases } = setup();
    await userEvent.click(screen.getByLabelText("phrase-0"));
    expect(setPhrases).toHaveBeenCalled();
    const next = setPhrases.mock.calls[0]![0] as { endBeat: number; cadence?: string }[];
    expect(next.find((p) => p.endBeat === 8)?.cadence).toBe("full"); // half→full
  });

  it("ベース表示ノブ＝+2oct/+3oct を切替", async () => {
    setup();
    const grp = screen.getByLabelText("fold-oct");
    const buttons = grp.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    await userEvent.click(buttons[1]!); // +3oct
    expect(buttons[1]!.classList.contains("on")).toBe(true);
  });

  it("再生モード切替で親 setCounterpoint を呼ぶ（対位法↔実音）", async () => {
    const { setCounterpoint } = setup();
    const grp = screen.getByLabelText("play-mode");
    await userEvent.click(grp.querySelectorAll("button")[1]!); // 実音
    expect(setCounterpoint).toHaveBeenCalledWith(false);
  });

  it("休ストリップ・凡例を描画", () => {
    setup();
    expect(screen.getByLabelText("rest-strip")).toBeTruthy();
    expect(screen.getByLabelText("skeleton-legend")).toBeTruthy();
  });
});
