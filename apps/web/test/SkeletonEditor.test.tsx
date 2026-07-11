import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkeletonEditor } from "../src/components/SkeletonEditor";
import { api } from "../src/api";
import type { SkeletonBreakpoint } from "../src/music";

// audio は jsdom で鳴らさない（previewNote/playNotes は握りつぶし・music が再exportする面も同モックが効く）。
const playHandle = { stop: vi.fn(), pause: vi.fn(), resume: vi.fn() };
vi.mock("../src/audio", () => ({
  previewNote: vi.fn(),
  playNotes: vi.fn(async () => playHandle),
}));
vi.mock("../src/api", () => ({ api: { music: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

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

// jsdom は PointerEvent 未実装＝fireEvent.pointerDown だと clientX が乗らない。
// MouseEvent に type "pointerdown" を載せて dispatch（React はイベント type で拾う）。
const pdown = (el: Element, x: number, y: number) =>
  fireEvent(el, new MouseEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
const pcancel = (el: Element) => fireEvent(el, new Event("pointercancel", { bubbles: true }));

describe("スクロール誤タップ対策（オーナーFB 2026-07-11）", () => {
  it("静止タップ（down と click が同位置）＝打点する", () => {
    const { setTones } = setup();
    const zone = screen.getByLabelText("skeleton-zone");
    pdown(zone, 10, 10);
    fireEvent.click(zone, { clientX: 10, clientY: 10 });
    expect(setTones).toHaveBeenCalled(); // 入力先=メロ既定
  });
  it("パン（down から閾値超の移動後に click）＝絶対に打点しない", () => {
    const { setTones, setBass } = setup();
    const zone = screen.getByLabelText("skeleton-zone");
    pdown(zone, 10, 10);
    fireEvent.click(zone, { clientX: 80, clientY: 10 }); // 横パン
    pdown(zone, 10, 10);
    fireEvent.click(zone, { clientX: 10, clientY: 120 }); // 縦パン
    expect(setTones).not.toHaveBeenCalled();
    expect(setBass).not.toHaveBeenCalled();
  });
  it("pointercancel（ブラウザがスクロールを奪った）後の click＝打点しない", () => {
    const { setTones } = setup();
    const zone = screen.getByLabelText("skeleton-zone");
    pdown(zone, 10, 10);
    pcancel(zone);
    fireEvent.click(zone, { clientX: 10, clientY: 10 });
    expect(setTones).not.toHaveBeenCalled();
  });
  it("pointerdown 単独（click なし＝タッチスクロール）＝打点しない", () => {
    const { setTones } = setup();
    const zone = screen.getByLabelText("skeleton-zone");
    pdown(zone, 10, 10);
    expect(setTones).not.toHaveBeenCalled(); // 打点は click 時のみ
  });
  it("休ストリップも同様＝パン後の click では休符を作らない", () => {
    const { setTones } = setup();
    const strip = screen.getByLabelText("rest-strip");
    pdown(strip, 10, 5);
    fireEvent.click(strip, { clientX: 90, clientY: 5 });
    expect(setTones).not.toHaveBeenCalled();
    pdown(strip, 10, 5);
    fireEvent.click(strip, { clientX: 10, clientY: 5 });
    expect(setTones).toHaveBeenCalled(); // 静止タップは効く
  });
});

describe("機械に叩き台（複数候補トレイ・オーナーFB 2026-07-11）", () => {
  const stubItems = {
    items: [
      { label: "骨格案1", content: { bars: 4, tones: [{ start: 0, pitch: 60 }, { start: 4, pitch: 64 }], phrases: [{ endBeat: 16, cadence: "full" }] } },
      { label: "骨格案2", content: { bars: 4, tones: [{ start: 0, pitch: 67 }] } },
    ],
  };
  it("ボタン押下→候補カードが並ぶ（各案に試聴▶と採用）", async () => {
    vi.mocked(api.music).mockResolvedValue(stubItems);
    setup();
    await userEvent.click(screen.getByLabelText("gen-skeleton-stub"));
    expect(await screen.findByLabelText("skeleton-cand-tray")).toBeTruthy();
    expect(screen.getAllByLabelText("skeleton-cand-card").length).toBe(2);
    expect(screen.getByLabelText("stub-audition-0")).toBeTruthy();
    expect(screen.getByLabelText("stub-adopt-1")).toBeTruthy();
  });
  it("試聴▶で playNotes が呼ばれる", async () => {
    vi.mocked(api.music).mockResolvedValue(stubItems);
    const { playNotes } = await import("../src/audio");
    setup();
    await userEvent.click(screen.getByLabelText("gen-skeleton-stub"));
    await userEvent.click(await screen.findByLabelText("stub-audition-0"));
    expect(playNotes).toHaveBeenCalled();
  });
  it("採用で現在の骨格を候補で置換（state 経由＝Undo 可能な経路）", async () => {
    vi.mocked(api.music).mockResolvedValue(stubItems);
    const { setTones } = setup();
    await userEvent.click(screen.getByLabelText("gen-skeleton-stub"));
    await userEvent.click(await screen.findByLabelText("stub-adopt-0"));
    expect(setTones).toHaveBeenCalledWith([{ start: 0, pitch: 60 }, { start: 4, pitch: 64 }]);
  });
  it("生成失敗はメッセージで可視化（黙って消えない）", async () => {
    vi.mocked(api.music).mockRejectedValue(new Error("down"));
    setup();
    await userEvent.click(screen.getByLabelText("gen-skeleton-stub"));
    expect(await screen.findByLabelText("stub-message")).toBeTruthy();
  });
});
