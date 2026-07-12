import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// audio は jsdom で鳴らさない（previewNote/playNotes 握りつぶし＝music の再export面も同モックが効く）。
const playHandle = { stop: vi.fn(), pause: vi.fn(), resume: vi.fn(), setLensGain: vi.fn() };
vi.mock("../src/audio", () => ({
  previewNote: vi.fn(),
  playNotes: vi.fn(async () => playHandle),
}));
const { getComposition, updateNeta, music, createNeta, placeChild, removeChild, link, getRelations } = vi.hoisted(() => ({
  getComposition: vi.fn(),
  updateNeta: vi.fn(),
  music: vi.fn(),
  createNeta: vi.fn(),
  placeChild: vi.fn(),
  removeChild: vi.fn(),
  link: vi.fn(),
  getRelations: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: { getComposition, updateNeta, music, createNeta, placeChild, removeChild, link, getRelations } }));

import { SkeletonDesk } from "../src/components/SkeletonDesk";
import { previewNote, playNotes } from "../src/audio";
import { melodyPlacementShift } from "../src/music";

const mkNeta = (id: string, kind: string, over: Record<string, unknown> = {}) => ({
  id, kind, title: null, text: id, content: null, key: null, mode: null, tempo: null, meter: null, bars: null, mood: null, tags: [], created: "", updated: "", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  updateNeta.mockResolvedValue({});
  placeChild.mockResolvedValue({});
  removeChild.mockResolvedValue({});
  link.mockResolvedValue({ ok: true });
  getRelations.mockResolvedValue([]);
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

// --- D4 ④出口トレイ（吹く→試着→置く＋分岐スタック） ---
describe("SkeletonDesk D4（④出口＝吹く→試着→置く・分岐スタック）", () => {
  // 焦点骨格を position=4 に置く＝置く時に skelPosition(=4) へ配置されることを実証。
  const material4 = { bars: 2, tones: [{ start: 0, pitch: 60 }, { start: 4, pitch: 64 }] };
  const tree4 = {
    neta: mkNeta("s1", "section", { title: "Aメロ" }),
    children: [{ position: 4, ord: 0, node: { neta: mkNeta("sk1", "skeleton", { content: material4, key: 2, mode: "major" }), children: [] } }],
  };
  const render4 = () =>
    render(
      <SkeletonDesk sectionId="s1" sectionKey={0} sectionMode="major" meter="4/4" tempo={120} skelNetaId="sk1" skelPosition={4} skelOrd={0} onClose={() => {}} />,
    );

  it("吹く→トレイ→置く：gen_melody(skeletonNetaId)→新メロ neta＋placeChild(skelPosition=4)＋realized_from・骨格 content 不変", async () => {
    music.mockResolvedValue({ items: [{ kind: "melody", content: { notes: [{ pitch: 62, start: 0, dur: 1 }] } }] });
    createNeta.mockResolvedValue(mkNeta("newmel", "melody"));
    getComposition.mockResolvedValue(tree4);
    render4();
    await screen.findByText(/Aメロ/);
    // 吹く▶＝gen_melody に skeletonNetaId=sk1 が乗る（骨格が構造を担うのでコード無しでも生成）。
    fireEvent.click(screen.getByLabelText("desk-blow"));
    await waitFor(() => expect(music).toHaveBeenCalledWith("gen_melody", expect.objectContaining({ skeletonNetaId: "sk1" })));
    // 候補カードが出る→＋置く。
    fireEvent.click(await screen.findByLabelText("place-at-skeleton"));
    // 新メロ neta を作成（骨格でなくメロ＝骨格 content は不変。updateNeta(sk1) は飛ばない）。
    await waitFor(() => expect(createNeta).toHaveBeenCalledTimes(1));
    expect(createNeta.mock.calls[0]![0]).toEqual(expect.objectContaining({ kind: "melody", content: { notes: [{ pitch: 62, start: 0, dur: 1 }] } }));
    // ★置くは skelPosition(=4) へ（位置0固定でない）。
    await waitFor(() => expect(placeChild).toHaveBeenCalledWith("s1", "newmel", 4, 0));
    // realized_from(メロ→骨格) を張る＝骨格に戻れる＝在庫は分岐。
    await waitFor(() => expect(link).toHaveBeenCalledWith("newmel", "sk1", "realized_from"));
    // 骨格ネタへの updateNeta は起きない（骨格 content 不変・旧メロ不滅の根拠）。
    expect(updateNeta.mock.calls.some(([id]) => id === "sk1")).toBe(false);
  });

  it("試着中は在庫不変：試着▶で candPreview のみ・createNeta/placeChild は飛ばない", async () => {
    music.mockResolvedValue({ items: [{ kind: "melody", content: { notes: [{ pitch: 62, start: 0, dur: 1 }] } }] });
    getComposition.mockResolvedValue(tree4);
    render4();
    await screen.findByText(/Aメロ/);
    fireEvent.click(screen.getByLabelText("desk-blow"));
    const audition = await screen.findByLabelText("audition-on-bed");
    fireEvent.click(audition);
    // 試着＝ローカル state のみ（在庫は書かない）。
    expect(audition.getAttribute("aria-pressed")).toBe("true");
    expect(createNeta).not.toHaveBeenCalled();
    expect(placeChild).not.toHaveBeenCalled();
  });

  it("分岐スタック：getRelations の realized_from×melody 件数が「→吹いたメロ N」に出る（bass は数えない）", async () => {
    getComposition.mockResolvedValue(tree4);
    getRelations.mockResolvedValue([
      { type: "realized_from", neta: mkNeta("m1", "melody", { title: "吹メロ1" }) },
      { type: "realized_from", neta: mkNeta("m2", "melody", { title: "吹メロ2" }) },
      { type: "realized_from", neta: mkNeta("b1", "bass") },
    ]);
    render4();
    await screen.findByText(/Aメロ/);
    const badge = await screen.findByLabelText("realized-stack");
    expect(badge.textContent).toContain("2"); // melody×2 のみ（bass 除外）
    // タップで一覧が開く。
    fireEvent.click(badge);
    const list = await screen.findByLabelText("realized-list");
    expect(list.textContent).toContain("吹メロ1");
    expect(list.textContent).toContain("吹メロ2");
  });

  it("voiceLeading バッジ：候補 meta の対位法要約がトレイに出る（S3d を再実装しない）", async () => {
    music.mockResolvedValue({
      items: [{ kind: "melody", content: { notes: [{ pitch: 62, start: 0, dur: 1 }] }, meta: { voiceLeading: { score: 0.5, parallelFifths: 1, parallelOctaves: 0, directFifths: 0, directOctaves: 0, voiceCrossings: 0 } } }],
    });
    getComposition.mockResolvedValue(tree4);
    render4();
    await screen.findByText(/Aメロ/);
    fireEvent.click(screen.getByLabelText("desk-blow"));
    const badge = await screen.findByLabelText("voiceleading-badge");
    expect(badge.textContent).toContain("並5×1"); // voiceLeadingBadge の text と一致
  });
});

// --- D5 ステージレール＝レンズのステージ相対一般化（seams A） ---
describe("SkeletonDesk D5（ステージレール＋レンズのステージ相対）", () => {
  const material = { bars: 2, tones: [{ start: 0, pitch: 60 }, { start: 4, pitch: 64 }] };
  const chordContent = { chords: [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }] };
  const tree = {
    neta: mkNeta("s1", "section", { title: "Aメロ" }),
    children: [
      { position: 0, ord: 0, node: { neta: mkNeta("cp1", "chord_progression", { content: chordContent, key: 0, mode: "major" }), children: [] } },
      { position: 0, ord: 0, node: { neta: mkNeta("sk1", "skeleton", { content: material, key: 2, mode: "major" }), children: [] } },
    ],
  };
  const renderDesk = () =>
    render(<SkeletonDesk sectionId="s1" sectionKey={0} sectionMode="major" meter="4/4" tempo={120} skelNetaId="sk1" skelPosition={0} skelOrd={0} onClose={() => {}} />);

  it("ステージレール4つが出て既定は③骨格・レンズ2択ラベルは［畳み｜実音］", async () => {
    getComposition.mockResolvedValue(tree);
    renderDesk();
    await screen.findByText(/Aメロ/);
    expect(screen.getByLabelText("desk-stages")).toBeTruthy();
    expect(screen.getByLabelText("stage-skeleton").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("stage-beat").getAttribute("aria-pressed")).toBe("false");
    // 既定③＝レンズラベルは畳み/実音。
    expect(screen.getByLabelText("lens-fold").textContent).toBe("畳み");
    expect(screen.getByLabelText("lens-real").textContent).toBe("実音");
  });

  it("②コードへ切替→レンズラベルが［和声だけ｜編成］に読み替わる（aria-label は A/B ゲートで固定）", async () => {
    getComposition.mockResolvedValue(tree);
    renderDesk();
    await screen.findByText(/Aメロ/);
    fireEvent.click(screen.getByLabelText("stage-chord"));
    expect(screen.getByLabelText("stage-chord").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("lens-fold").textContent).toBe("和声だけ"); // A群ラベルが読み替わる
    expect(screen.getByLabelText("lens-real").textContent).toBe("編成"); // B群ラベルが読み替わる
    // ①ビートへ再切替＝また読み替わる。
    fireEvent.click(screen.getByLabelText("stage-beat"));
    expect(screen.getByLabelText("lens-fold").textContent).toBe("パターン単体");
    expect(screen.getByLabelText("lens-real").textContent).toBe("ベッド");
  });

  it("再生中のステージ切替：transport が playing/loop 維持（reloop＝begin を呼ぶが stop 状態にしない）", async () => {
    getComposition.mockResolvedValue(tree);
    renderDesk();
    await screen.findByText(/Aメロ/);
    // 再生開始（初期 loopOn は mount で立つ）。begin→playNotes→state playing。
    fireEvent.click(screen.getByLabelText("desk-play"));
    await waitFor(() => expect(screen.getByLabelText("desk-play").textContent).toBe("⏸"));
    const before = (playNotes as ReturnType<typeof vi.fn>).mock.calls.length;
    // ステージ切替＝reloop（内容が変わる）。
    fireEvent.click(screen.getByLabelText("stage-beat"));
    // reloop は begin を1回呼ぶ（stop→begin）＝再スケジュール。playing/loop は維持（stopped に落ちない）。
    await waitFor(() => expect((playNotes as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before + 1));
    expect(screen.getByLabelText("desk-play").textContent).toBe("⏸"); // playing 維持
  });

  it("①ビート前景：リズムレーン子（ドラムブロック）が表示のみで出る", async () => {
    const withDrum = {
      neta: mkNeta("s1", "section", { title: "Aメロ" }),
      children: [
        { position: 0, ord: 0, node: { neta: mkNeta("dr1", "rhythm", { title: "ビート", content: { rhythm: { steps: 8, beatsPerStep: 0.5, lanes: [{ midi: 36, hits: [0, 4] }] } } }), children: [] } },
        { position: 0, ord: 0, node: { neta: mkNeta("sk1", "skeleton", { content: material, key: 2, mode: "major" }), children: [] } },
      ],
    };
    getComposition.mockResolvedValue(withDrum);
    renderDesk();
    await screen.findByText(/Aメロ/);
    expect(screen.getByLabelText("desk-beat")).toBeTruthy();
    expect(screen.getByLabelText("beat-block-0")).toBeTruthy();
  });
});

// --- D6 B-lite「変化→耳」（seams シナリオ：②の差替が③の詰めた対位を黙って腐らせるのを見せる） ---
describe("SkeletonDesk D6（stale＝要確認・変化した瞬間を聴く・オオカミ少年化しない）", () => {
  // ③：bar2 downbeat（start=4・4/4）に接点＝E(64) が G 上の6度。もう1点は start=0 の C(60)。
  const material = { bars: 2, tones: [{ start: 0, pitch: 60 }, { start: 4, pitch: 64 }] };
  // ②：C@0-4 / G@4-8（key=0 major・shift=0）。
  const chordContent = { chords: [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }] };
  const tree = {
    neta: mkNeta("s1", "section", { title: "Aメロ" }),
    children: [
      { position: 0, ord: 0, node: { neta: mkNeta("cp1", "chord_progression", { content: chordContent, key: 0, mode: "major" }), children: [] } },
      // 骨格も key=0 major＝配置移調 shift=0（このシナリオは対位の変化を見せるのが目的＝移調は別テストで固定済）。
      { position: 0, ord: 0, node: { neta: mkNeta("sk1", "skeleton", { content: material, key: 0, mode: "major" }), children: [] } },
    ],
  };
  const renderDesk = () =>
    render(<SkeletonDesk sectionId="s1" sectionKey={0} sectionMode="major" meter="4/4" tempo={120} skelNetaId="sk1" skelPosition={0} skelOrd={0} onClose={() => {}} />);

  it("②で G→B を採用→bar2 接点1つだけ stale（要確認×1）→タップで差替後の2声（4度）ダイアッドが発火→確認で消える", async () => {
    getComposition.mockResolvedValue(tree);
    // substitute_chord 候補＝B（root 11）＝導出ベースが G→B に変わり E との縦が 6度→4度。
    music.mockResolvedValue([{ root: 11, quality: "", degree: 7, kind: "functional", why: "" }]);
    renderDesk();
    await screen.findByText(/Aメロ/);

    // 初期＝②未編集＝stale 無し（骨格だけでは立たない）。bar2 接点は 6度。
    expect(screen.queryByLabelText("stale-count")).toBeNull();
    expect((await screen.findByLabelText("contact-1")).textContent).toBe("6度");

    // ②：G チップ（chord-chip-1）をタップ→候補 B を試着→採用。
    fireEvent.click(await screen.findByLabelText("chord-chip-1"));
    fireEvent.click(await screen.findByLabelText("chord-cand-0"));
    fireEvent.click(screen.getByLabelText("chord-adopt"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalledTimes(1));

    // 採用後＝bar2 接点だけが stale＝要確認×1（無関係な start=0 接点は騒がない）。接点は 6度→4度。
    const mark = await screen.findByLabelText("stale-count");
    expect(mark.textContent).toContain("1");
    await waitFor(() => expect(screen.getByLabelText("contact-1").textContent).toBe("4度"));
    expect(screen.getByLabelText("contact-1").className).toContain("stale");
    expect(screen.getByLabelText("contact-0").className).not.toContain("stale"); // 区間外＝立たない

    // stale 接点タップ→「②のコード変更で対位が変わった箇所」＋「変化した瞬間を聴く」。
    fireEvent.click(screen.getByLabelText("contact-1"));
    await screen.findByLabelText("contact-stale-note");
    const listen = screen.getByLabelText("contact-listen");
    expect(listen.textContent).toContain("変化した瞬間を聴く");

    // 試聴＝差替後の2声（E=64 メロ／実効ベース B=47+1oct=59）だけ＝D2 の playContactDyad 流用（ベッド非混入）。
    fireEvent.click(listen);
    const calls = (previewNote as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(2);
    const pitches = calls.map(([n]) => (n as { pitch: number }).pitch).sort((a, b) => a - b);
    expect(pitches).toEqual([59, 64]); // ベース B+1oct / メロ E
    for (const [n] of calls) {
      expect(["melody", "bass"]).toContain((n as { part?: string }).part);
      expect((n as { drum?: boolean }).drum).toBeFalsy();
    }

    // 確認（試聴）したら stale が消える＝オオカミ少年化しない（要確認×N が下がって 0 で非表示）。
    await waitFor(() => expect(screen.queryByLabelText("stale-count")).toBeNull());
    expect(screen.getByLabelText("contact-1").className).not.toContain("stale");
  });

  it("骨格だけ触っても stale は立たない（②採用でのみ editedChordRanges が増える）", async () => {
    getComposition.mockResolvedValue(tree);
    renderDesk();
    await screen.findByText(/Aメロ/);
    // 骨格編集（小節＋）＝tones/bars は動くが②は不変＝stale-count は出ない。
    fireEvent.click(screen.getByLabelText("skel-bars-inc"));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByLabelText("stale-count")).toBeNull();
  });
});
