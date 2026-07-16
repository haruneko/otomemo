import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

// FormStrip は SectionEditor(song 経路)から呼ばれる＝実結線で検証（射影 place/remove・×N・挿入）。
const { getComposition, listNeta, placeChild, removeChild, createNeta, copyNeta, recommend, getSong, updateSong, updateNeta, music, link } =
  vi.hoisted(() => ({
    getComposition: vi.fn(), listNeta: vi.fn(), placeChild: vi.fn(), removeChild: vi.fn(),
    createNeta: vi.fn(), copyNeta: vi.fn(), recommend: vi.fn(), getSong: vi.fn(),
    updateSong: vi.fn(), updateNeta: vi.fn(), music: vi.fn(), link: vi.fn(),
  }));
vi.mock("../src/api", () => ({
  api: { getComposition, listNeta, placeChild, removeChild, createNeta, copyNeta, recommend, getSong, updateSong, updateNeta, music, link },
}));

import { SectionEditor } from "../src/components/SectionEditor";

const mk = (id: string, kind: string, over: Partial<Neta> = {}): Neta => ({
  id, kind, title: null, text: id, content: null, key: null, mode: null, tempo: null,
  meter: null, bars: null, mood: null, tags: [], created: "", updated: "", ...over,
});
// 8小節(32拍)ぶんのメロを持つ section 子（childDur=32 になる）。
const melodyKid = () => ({ position: 0, ord: 0, node: { neta: mk("m", "melody", { content: { notes: [{ pitch: 60, start: 0, dur: 32 }] } }), children: [] } });
const sectionChild = (id: string, position: number, tags: string[] = []) => ({
  position, ord: 0, node: { neta: mk(id, "section", { title: id, tags }), children: [melodyKid()] },
});

describe("FormStrip（曲フォーム・song のカード列）", () => {
  beforeEach(() => {
    recommend.mockResolvedValue([]);
    getSong.mockResolvedValue(null);
    updateSong.mockResolvedValue({});
    updateNeta.mockResolvedValue({});
    placeChild.mockResolvedValue({ ok: true });
    removeChild.mockResolvedValue({ ok: true });
    copyNeta.mockReset();
    createNeta.mockReset();
    listNeta.mockResolvedValue([]);
  });

  it("セクションごとにカード＋役割バッジ／連続同一は×Nに畳む", async () => {
    getComposition.mockResolvedValue({
      neta: mk("g1", "song"),
      children: [
        sectionChild("A", 0, ["role:verse"]),
        sectionChild("S", 32, ["role:chorus"]),
        sectionChild("S", 64, ["role:chorus"]), // 連続同一＝×2 に畳む
      ],
    });
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-strip");
    expect(await screen.findByLabelText("form-card-A")).toBeInTheDocument();
    // 役割バッジ（verse=Aメロ / chorus=サビ）
    expect(screen.getByLabelText("role-verse")).toHaveTextContent("Aメロ");
    // S は連続2回＝1カードに畳み ×2 バッジ（カードは1枚）
    expect(screen.getAllByLabelText("form-card-S")).toHaveLength(1);
    expect(screen.getByLabelText("expand-S")).toHaveTextContent("×2");
  });

  it("曲ヘッダの合計尺は末尾×N反復を取りこぼさない（過少カウント是正）", async () => {
    // 2個目の Aメロ配置は node.children を畳まれ空（getComposition の反復配置挙動）＝childDur が小さく出るケース。
    const emptyRepeat = { position: 32, ord: 0, node: { neta: mk("A", "section", { title: "A" }), children: [] as never[] } };
    getComposition.mockResolvedValue({
      neta: mk("g1", "song"),
      children: [sectionChild("A", 0), emptyRepeat], // Aメロ 8小節 ×2 ＝ 実尺16小節
    });
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-strip");
    const meta = await screen.findByLabelText("song-meta");
    expect(meta).toHaveTextContent("16小節"); // ×2 反復ぶんを含む（旧: 9小節に過少カウントしていた）
  });

  it("×Nカードを展開すると個別カードになる", async () => {
    getComposition.mockResolvedValue({
      neta: mk("g1", "song"),
      children: [sectionChild("S", 0), sectionChild("S", 32)],
    });
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-strip");
    await userEvent.click(await screen.findByLabelText("expand-S"));
    expect(screen.getAllByLabelText("form-card-S")).toHaveLength(2); // 展開＝2枚
  });

  it("削除＝辺 reconcile で position を詰め直す（消えた辺＋後続の旧位置を remove・詰めた先を place）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("g1", "song"),
      children: [sectionChild("A", 0), sectionChild("B", 32), sectionChild("C", 64)],
    });
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-card-B");
    await userEvent.click(screen.getByLabelText("fs-del-B")); // B を外す→C が前へ詰まる
    await waitFor(() => expect(removeChild).toHaveBeenCalledWith("g1", "B", 32));
    expect(removeChild).toHaveBeenCalledWith("g1", "C", 64); // C の旧位置も外す
    expect(placeChild).toHaveBeenCalledWith("g1", "C", 32, 0); // A@0 は据え置き・C を32へ詰める
  });

  it("×2を含む song を編集しても反復以降が詰まらない（compose_edge position 破損の根治）", async () => {
    // 動的 composition：place/remove を in-memory に反映し、射影の実結線を通す。
    // 反復2個目の node.children は空（getComposition 挙動）＝childDur が BPB(4拍)に落ちるケース。
    let kids: { position: number; ord: number; node: { neta: Neta; children: unknown[] } }[] = [
      sectionChild("X", 0), // 先頭 8小節(32拍)
      sectionChild("A", 32), // Aメロ 8小節
      { position: 64, ord: 0, node: { neta: mk("A", "section", { title: "A" }), children: [] } }, // ×2 の2個目＝children空
      sectionChild("B", 96), // Bメロ 8小節
    ];
    getComposition.mockImplementation(async () => ({ neta: mk("g1", "song"), children: kids }));
    placeChild.mockImplementation(async (_p: string, cid: string, pos: number) => {
      kids = [...kids, { position: pos, ord: 0, node: { neta: mk(cid, "section", { title: cid }), children: [melodyKid()] } }];
      return { ok: true };
    });
    removeChild.mockImplementation(async (_p: string, cid: string, pos: number) => {
      const i = kids.findIndex((k) => k.node.neta.id === cid && Math.abs(k.position - pos) < 1e-6);
      if (i >= 0) kids.splice(i, 1);
      return { ok: true };
    });
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-card-X");
    await userEvent.click(screen.getByLabelText("fs-del-X")); // 先頭Xを外す→A×2＋B が前へ詰め直される
    // B は A×2 の実尺(32×2)を跨いで 64 へ（旧: 反復2個目 childDur=4拍で B が 36 に潜り込み＝重なり破損）
    await waitFor(() => expect(placeChild).toHaveBeenCalledWith("g1", "B", 64, 0));
    const positions = [...kids].map((k) => k.position).sort((a, b) => a - b);
    expect(positions).toEqual([0, 32, 64]); // A@0, A@32, B@64＝8拍刻みで重ならない
    // 隣接配置が重ならない（実尺32拍で隙間なく連続）＝破損していない。
    for (let i = 1; i < positions.length; i++) expect(positions[i]! - positions[i - 1]!).toBe(32);
  });

  it("挿入＝＋ボタンでピッカーを開き、選んだ section を配置（射影 normalize）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("g1", "song"),
      children: [sectionChild("A", 0)],
    });
    listNeta.mockResolvedValue([mk("newSec", "section", { title: "サビ候補", meter: "4/4" })]);
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-card-A");
    await userEvent.click(screen.getByLabelText("fs-insert-0")); // 先頭に挿入
    await userEvent.click(await screen.findByLabelText("place-newSec"));
    await waitFor(() => expect(placeChild).toHaveBeenCalledWith("g1", "newSec", expect.any(Number), 0));
  });
});
