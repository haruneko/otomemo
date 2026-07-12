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
import { previewNote } from "../src/audio";
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

  it("D1.5 範囲ブレース：ルーラー＋両端つまみが出て、既定はブロック全体 [0, bars*BPB]", async () => {
    getComposition.mockResolvedValue(tree);
    render(
      <SkeletonDesk
        sectionId="s1" sectionKey={0} sectionMode="major" meter="4/4" tempo={120}
        skelNetaId="sk1" skelPosition={0} skelOrd={0} onClose={() => {}}
      />,
    );
    await screen.findByText(/Aメロ/);
    expect(screen.getByLabelText("desk-ruler")).toBeTruthy();
    const start = screen.getByLabelText("desk-brace-start");
    const end = screen.getByLabelText("desk-brace-end");
    // 既定＝ブロック全体（bars=2・4/4 → blockSpan=8 拍）。
    expect(start.getAttribute("aria-valuenow")).toBe("0");
    expect(end.getAttribute("aria-valuenow")).toBe("8");
    // ブロック小節数ぶんの目盛り（bars+1=3 本）。
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("D2 接点ストリップ：メロ点ぶんのバッジが出て、タップ→説明ポップ＋『この瞬間だけ聴く』でダイアッドが鳴る", async () => {
    getComposition.mockResolvedValue(tree);
    render(
      <SkeletonDesk
        sectionId="s1" sectionKey={0} sectionMode="major" meter="4/4" tempo={120}
        skelNetaId="sk1" skelPosition={0} skelOrd={0} onClose={() => {}}
      />,
    );
    await screen.findByText(/Aメロ/);
    // メロ点2つ（start 0/4）＝接点バッジ2つ。
    expect(screen.getByLabelText("desk-contact")).toBeTruthy();
    const b0 = await screen.findByLabelText("contact-0");
    expect(screen.getByLabelText("contact-1")).toBeTruthy();
    // タップ→説明ポップ（指摘のみ）。
    fireEvent.click(b0);
    const pop = await screen.findByLabelText("contact-pop");
    expect(pop.textContent).toBeTruthy();
    // 「この瞬間だけ聴く」＝previewNote が接点の2音（メロ／ベース）だけで呼ばれる＝ベッド音が混ざらない。
    fireEvent.click(screen.getByLabelText("contact-listen"));
    expect((previewNote as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    for (const [note] of (previewNote as ReturnType<typeof vi.fn>).mock.calls) {
      expect(["melody", "bass"]).toContain((note as { part?: string }).part); // 骨格2声のみ
      expect((note as { drum?: boolean }).drum).toBeFalsy(); // ドラム（ベッド）非混入
    }
  });

  // --- D3 ②コード前景（試着→採用・在庫不変） ---
  const chordContent = { chords: [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }] };
  const treeC = {
    neta: mkNeta("s1", "section", { title: "Aメロ" }),
    children: [
      { position: 0, ord: 0, node: { neta: mkNeta("cp1", "chord_progression", { content: chordContent, key: 0, mode: "major" }), children: [] } },
      { position: 0, ord: 0, node: { neta: mkNeta("sk1", "skeleton", { content: material, key: 2, mode: "major" }), children: [] } },
    ],
  };
  const renderC = () =>
    render(
      <SkeletonDesk sectionId="s1" sectionKey={0} sectionMode="major" meter="4/4" tempo={120} skelNetaId="sk1" skelPosition={0} skelOrd={0} onClose={() => {}} />,
    );

  it("D3 ②コードチップが進行ぶん出る（C/G）", async () => {
    getComposition.mockResolvedValue(treeC);
    renderC();
    await screen.findByText(/Aメロ/);
    expect(screen.getByLabelText("desk-chords")).toBeTruthy();
    expect((await screen.findByLabelText("chord-chip-0")).textContent).toBe("C");
    expect(screen.getByLabelText("chord-chip-1").textContent).toBe("G");
  });

  it("D3 試着→採用：試着中は updateNeta 0回・採用で1回・payload は該当 chord を差替（在庫不変）", async () => {
    getComposition.mockResolvedValue(treeC);
    // substitute_chord 候補（F=root5, Am=root9m）。web は root/quality を消費。
    music.mockResolvedValue([
      { root: 5, quality: "", degree: 5, kind: "functional", why: "" },
      { root: 9, quality: "m", degree: 9, kind: "relative", why: "" },
    ]);
    renderC();
    await screen.findByText(/Aメロ/);
    // G（2つ目）チップをタップ→ substitute_chord が飛ぶ。
    fireEvent.click(await screen.findByLabelText("chord-chip-1"));
    await screen.findByLabelText("chord-pop");
    expect(music).toHaveBeenCalledWith("substitute_chord", expect.objectContaining({ chord: { root: 7, quality: "" }, key: 0, mode: "major" }));
    // 候補が出る（F/Am）。ここまで updateNeta は 0回（取得は在庫を触らない）。
    const cand0 = await screen.findByLabelText("chord-cand-0");
    expect(cand0.textContent).toBe("F");
    expect(updateNeta).not.toHaveBeenCalled();
    // 試着＝候補タップ。②チップ名が差替後（F）に追従＝③が試着に追従。ここでも updateNeta 0回（在庫不変）。
    fireEvent.click(cand0);
    expect(screen.getByLabelText("chord-chip-1").textContent).toBe("F");
    expect(updateNeta).not.toHaveBeenCalled();
    // 採用＝書込。updateNeta が cp1 へ1回・payload は chords[1] が F(root5) に差替（他は温存）。
    fireEvent.click(screen.getByLabelText("chord-adopt"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalledTimes(1));
    const [id, patch] = updateNeta.mock.calls[0]!;
    expect(id).toBe("cp1");
    expect((patch as { content: { chords: { root: number }[] } }).content.chords).toEqual([
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 5, quality: "", start: 4, dur: 4 },
    ]);
  });
});
