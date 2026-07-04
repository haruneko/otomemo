import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { getComposition, listNeta, placeChild, removeChild, createNeta } = vi.hoisted(() => ({
  getComposition: vi.fn(),
  listNeta: vi.fn(),
  placeChild: vi.fn(),
  removeChild: vi.fn(),
  createNeta: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: { getComposition, listNeta, placeChild, removeChild, createNeta } }));

import { SectionEditor, beatsPerBar, loopPositions } from "../src/components/SectionEditor";

describe("loopPositions（③ ループ伸ばしのタイル反復位置）", () => {
  it("元ブロックの後ろに unit 刻みで、収まるループだけ並べる（fromPos は据え置き＝含めない）", () => {
    expect(loopPositions(0, 4, 8, 32)).toEqual([4]); // 8拍まで→4拍に1ループ
    expect(loopPositions(0, 4, 16, 32)).toEqual([4, 8, 12]); // 16拍まで→3ループ
  });
  it("最後のループが端に収まらなければ置かない（半端は切る）／total で頭打ち", () => {
    expect(loopPositions(0, 4, 7, 32)).toEqual([]); // 4+4=8 > 7＝収まらない
    expect(loopPositions(0, 4, 100, 12)).toEqual([4, 8]); // total=12 で頭打ち（12+4=16>12 で停止）
  });
  it("2小節(8拍)ユニットは8拍刻み", () => {
    expect(loopPositions(0, 8, 24, 32)).toEqual([8, 16]);
  });
});

const mk = (id: string, kind: string, over: Partial<Neta> = {}): Neta => ({
  id,
  kind,
  title: null,
  text: id,
  content: null,
  key: null,
  mode: null,
  tempo: null,
  meter: null,
  bars: null,
  mood: null,
  tags: [],
  created: "",
  updated: "",
  ...over,
});

describe("SectionEditor (3-lane timeline)", () => {
  it("ブロックをタップ＝子ネタを編集画面で開く（潜る・外さない）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 0, ord: 0, node: { neta: mk("c1", "melody", { title: "メロ案" }), children: [] } }],
    });
    const onOpenNeta = vi.fn();
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} onOpenNeta={onOpenNeta} />);
    await userEvent.click(await screen.findByLabelText("block-c1@0"));
    expect(onOpenNeta).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
    expect(removeChild).not.toHaveBeenCalled(); // タップは外さない
  });

  it("ブロック長押し＝配置を外す（#54・ネタ自体は残す）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 0, ord: 0, node: { neta: mk("c1", "melody", { title: "メロ案" }), children: [] } }],
    });
    removeChild.mockResolvedValue({ ok: true });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    const block = await screen.findByLabelText("block-c1@0");
    fireEvent.pointerDown(block, { clientX: 5, clientY: 5 }); // 長押し開始（動かさない）
    await waitFor(() => expect(removeChild).toHaveBeenCalledWith("s1", "c1", 0), { timeout: 1200 });
  });

  it("ピッカーの新規作成＝空ネタを作って配置し、そのまま編集を開く", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    listNeta.mockResolvedValue([]);
    createNeta.mockResolvedValue(mk("newm", "melody"));
    placeChild.mockResolvedValue({ ok: true });
    const onOpenNeta = vi.fn();
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} onOpenNeta={onOpenNeta} />);
    await userEvent.click(screen.getByLabelText("place-melody-0")); // 1小節目のメロ空セル
    await userEvent.click(await screen.findByLabelText("picker-create"));
    await waitFor(() => expect(createNeta).toHaveBeenCalledWith(expect.objectContaining({ kind: "melody" })));
    expect(placeChild).toHaveBeenCalledWith("s1", "newm", 0, 0);
    expect(onOpenNeta).toHaveBeenCalledWith(expect.objectContaining({ id: "newm" })); // 作ったら開く
  });

  it("taps a melody-lane cell to place a neta at that bar (position = bar*4)", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    listNeta.mockResolvedValue([mk("c2", "melody", { title: "メロ素材" })]);
    placeChild.mockResolvedValue({ ok: true });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await userEvent.click(screen.getByLabelText("place-melody-1")); // 2小節目 = position 4
    await waitFor(() => expect(screen.getByText("メロ素材")).toBeInTheDocument());
    await userEvent.click(screen.getByText("メロ素材"));
    expect(placeChild).toHaveBeenCalledWith("s1", "c2", 4, 0);
  });

  it("② コード楽器は2レーン＝ord で行を分ける（ord0→楽器1 / ord1→楽器2）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("cp1", "chord_pattern", { title: "ピアノ" }), children: [] } },
        { position: 0, ord: 1, node: { neta: mk("cp2", "chord_pattern", { title: "パッド" }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    // 両方のコード楽器が別ブロックとして描かれる（同位置でも重ならず2レーンに分かれる）
    await screen.findByLabelText("block-cp1@0");
    expect(screen.getByLabelText("block-cp2@0")).toBeInTheDocument();
    expect(screen.getByText("コード楽器1")).toBeInTheDocument();
    expect(screen.getByText("コード楽器2")).toBeInTheDocument();
  });

  it("② コード楽器2レーンの空セルに置くと ord=1 で配置される", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    listNeta.mockResolvedValue([mk("cp9", "chord_pattern", { title: "パッド素材" })]);
    placeChild.mockResolvedValue({ ok: true });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await userEvent.click(screen.getByLabelText("place-chord_pattern2-0")); // 楽器2レーンの1小節目
    await waitFor(() => expect(screen.getByText("パッド素材")).toBeInTheDocument());
    await userEvent.click(screen.getByText("パッド素材"));
    expect(placeChild).toHaveBeenCalledWith("s1", "cp9", 0, 1); // ord=1＝2レーン目
  });

  it("評価修正A: 既定は8小節（place-melody-7 まで／8は無い）", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("place-melody-7");
    expect(screen.queryByLabelText("place-melody-8")).toBeNull();
    expect(screen.getByLabelText("bars-count").textContent).toBe("8");
  });
  it("評価修正A: neta.bars で尺が伸びる（16小節＝place-melody-15 が出る）", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section", { bars: 16 }), children: [] });
    render(<SectionEditor neta={mk("s1", "section", { bars: 16 })} keyPc={0} tempo={120} />);
    await screen.findByLabelText("place-melody-15");
    expect(screen.getByLabelText("bars-count").textContent).toBe("16");
  });
  it("評価修正A: 配置済みcontentが8小節超なら尺が自動で伸びる（子の実長で切れない）", async () => {
    // 24拍(=6/8で8小節)のメロを step0 に置くと 8小節、48拍なら16小節に自動伸長。
    getComposition.mockResolvedValue({
      neta: mk("s1", "section", { meter: "6/8" }),
      children: [{ position: 0, ord: 0, node: { neta: mk("m", "melody", { content: { notes: [{ pitch: 60, start: 0, dur: 48 }] } }), children: [] } }],
    });
    render(<SectionEditor neta={mk("s1", "section", { meter: "6/8" })} keyPc={0} tempo={120} meter="6/8" />);
    await screen.findByLabelText("place-melody-15"); // 48拍÷3拍=16小節ぶんのセルがある
    expect(Number(screen.getByLabelText("bars-count").textContent)).toBeGreaterThanOrEqual(16);
  });
  it("sizes bars by meter — 6/8 bar1 = position 3 (#51)", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section", { meter: "6/8" }), children: [] });
    listNeta.mockResolvedValue([mk("c2", "melody", { title: "M" })]);
    placeChild.mockResolvedValue({ ok: true });
    render(<SectionEditor neta={mk("s1", "section", { meter: "6/8" })} keyPc={0} tempo={120} />);
    await userEvent.click(screen.getByLabelText("place-melody-1")); // 2小節目 = position 3 (6/8)
    await waitFor(() => expect(screen.getByText("M")).toBeInTheDocument());
    await userEvent.click(screen.getByText("M"));
    expect(placeChild).toHaveBeenCalledWith("s1", "c2", 3, 0);
  });
});

describe("beatsPerBar (#51)", () => {
  it("derives quarter-beats per bar from meter", () => {
    expect(beatsPerBar("4/4")).toBe(4);
    expect(beatsPerBar("6/8")).toBe(3);
    expect(beatsPerBar("3/4")).toBe(3);
    expect(beatsPerBar("2/2")).toBe(4);
    expect(beatsPerBar(null)).toBe(4);
    expect(beatsPerBar("garbage")).toBe(4);
  });
});
