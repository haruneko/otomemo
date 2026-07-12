import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// audio は jsdom で鳴らさない（previewNote/playNotes 握りつぶし＝music の再export面も同モックが効く）。
const playHandle = { stop: vi.fn(), pause: vi.fn(), resume: vi.fn(), setLensGain: vi.fn() };
vi.mock("../src/audio", () => ({
  previewNote: vi.fn(),
  playNotes: vi.fn(async () => playHandle),
}));
const { getComposition, updateNeta, music } = vi.hoisted(() => ({
  getComposition: vi.fn(),
  updateNeta: vi.fn(),
  music: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: { getComposition, updateNeta, music } }));

import { SkeletonDesk } from "../src/components/SkeletonDesk";
import { melodyPlacementShift } from "../src/music";

const mkNeta = (id: string, kind: string, over: Record<string, unknown> = {}) => ({
  id, kind, title: null, text: id, content: null, key: null, mode: null, tempo: null, meter: null, bars: null, mood: null, tags: [], created: "", updated: "", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  updateNeta.mockResolvedValue({});
});

describe("SkeletonDesk（design #20 S6 D1c）", () => {
  // 素材調 content（key=2/major）をセクション実調（key=0/major）で開く＝shift≠0。
  const material = { bars: 2, tones: [{ start: 0, pitch: 60 }, { start: 4, pitch: 64 }] };
  const tree = {
    neta: mkNeta("s1", "section", { title: "Aメロ" }),
    children: [{ position: 0, ord: 0, node: { neta: mkNeta("sk1", "skeleton", { content: material, key: 2, mode: "major" }), children: [] } }],
  };

  it("配置移調が非ゼロ（unshift が恒等でないこと）", () => {
    expect(melodyPlacementShift(0, "major", "major", 2)).not.toBe(0);
  });

  it("(d) 机で編集→debounce flush の updateNeta payload が unshift 済（素材調）", async () => {
    getComposition.mockResolvedValue(tree);
    render(
      <SkeletonDesk
        sectionId="s1" sectionKey={0} sectionMode="major" meter="4/4" tempo={120}
        skelNetaId="sk1" skelPosition={0} skelOrd={0} onClose={() => {}}
      />,
    );
    // 読込完了（ヘッダにセクション名が出る＝state セット済み）を待つ。
    await screen.findByText(/Aメロ/);
    // 編集を1つ起こす（小節＋）＝state 変化→debounce 保存。
    fireEvent.click(screen.getByLabelText("skel-bars-inc"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalledTimes(1), { timeout: 2000 });
    const [id, patch] = updateNeta.mock.calls[0]!;
    expect(id).toBe("sk1");
    // ★payload は素材調（表示は +shift の実調だが、保存は −shift で戻る）＝tones が material と一致。
    expect((patch as { content: { tones: unknown; bars: number } }).content.tones).toEqual(material.tones);
    expect((patch as { content: { bars: number } }).content.bars).toBe(3); // 小節＋で bars 2→3
  });

  it("読込直後は保存を走らせない（編集するまで updateNeta 0回）", async () => {
    getComposition.mockResolvedValue(tree);
    render(
      <SkeletonDesk
        sectionId="s1" sectionKey={0} sectionMode="major" meter="4/4" tempo={120}
        skelNetaId="sk1" skelPosition={0} skelOrd={0} onClose={() => {}}
      />,
    );
    await screen.findByText(/Aメロ/);
    // 少し待っても（debounce 超過）読込だけでは保存されない。
    await new Promise((r) => setTimeout(r, 700));
    expect(updateNeta).not.toHaveBeenCalled();
  });

  it("トランスポート：レンズ2択［畳み｜実音］が出て、既定は畳み", async () => {
    getComposition.mockResolvedValue(tree);
    render(
      <SkeletonDesk
        sectionId="s1" sectionKey={0} sectionMode="major" meter="4/4" tempo={120}
        skelNetaId="sk1" skelPosition={0} skelOrd={0} onClose={() => {}}
      />,
    );
    await screen.findByText(/Aメロ/);
    expect(screen.getByLabelText("lens-fold").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("lens-real").getAttribute("aria-pressed")).toBe("false");
    // レンズ切替は再生していなくても state を更新（次の再生の初期ゲート用）。
    fireEvent.click(screen.getByLabelText("lens-real"));
    expect(screen.getByLabelText("lens-real").getAttribute("aria-pressed")).toBe("true");
  });
});
