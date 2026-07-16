import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

// FormStrip は SectionEditor(song 経路)から呼ばれる＝実結線で検証（射影 place/remove・×N・挿入）。
const { getComposition, listNeta, placeChild, removeChild, createNeta, copyNeta, recommend, getSong, updateSong, updateNeta, music, link, getPlacements, getRelations, vary, suggestForm, suggestKeyPlan, suggestEnergyPlan, playNotes } =
  vi.hoisted(() => ({
    getComposition: vi.fn(), listNeta: vi.fn(), placeChild: vi.fn(), removeChild: vi.fn(),
    createNeta: vi.fn(), copyNeta: vi.fn(), recommend: vi.fn(), getSong: vi.fn(),
    updateSong: vi.fn(), updateNeta: vi.fn(), music: vi.fn(), link: vi.fn(),
    getPlacements: vi.fn(), getRelations: vi.fn(), vary: vi.fn(), // S2 分家/共有バッジ
    suggestForm: vi.fn(), suggestKeyPlan: vi.fn(), suggestEnergyPlan: vi.fn(), // S3-a 提案▾
    playNotes: vi.fn(), // 遷移試聴（Tone を起動しない）
  }));
vi.mock("../src/api", () => ({
  api: { getComposition, listNeta, placeChild, removeChild, createNeta, copyNeta, recommend, getSong, updateSong, updateNeta, music, link, getPlacements, getRelations, vary, suggestForm, suggestKeyPlan, suggestEnergyPlan },
}));
// music は実物を使いつつ playNotes だけ差し替え（compositeNotes/射影 等は実計算＝遷移窓の実結線を通す）。
vi.mock("../src/music", async (orig) => ({ ...(await orig<typeof import("../src/music")>()), playNotes }));

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
    updateNeta.mockReset();
    updateNeta.mockResolvedValue({});
    placeChild.mockReset();
    placeChild.mockResolvedValue({ ok: true });
    removeChild.mockReset();
    removeChild.mockResolvedValue({ ok: true });
    copyNeta.mockReset();
    createNeta.mockReset();
    listNeta.mockResolvedValue([]);
    getPlacements.mockResolvedValue({ parents: [], placementCount: 0 }); // 既定＝未共有（バッジ無し）
    getRelations.mockResolvedValue([]); // 既定＝分家でない
    vary.mockReset();
    suggestForm.mockReset();
    suggestKeyPlan.mockReset();
    suggestEnergyPlan.mockReset();
    playNotes.mockReset();
    playNotes.mockResolvedValue({ stop: vi.fn(), pause: vi.fn(), resume: vi.fn() });
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

  // ── S2 分家/共有/調バッジ ──
  it("調バッジ＝セクションkeyが曲keyと違う時だけ半音差／共有バッジ＝placementCount>=2／A′＝variant_of", async () => {
    getComposition.mockResolvedValue({
      neta: mk("g1", "song"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("A", "section", { title: "A", key: 0 }), children: [melodyKid()] } }, // 曲と同調＝バッジ無し
        { position: 32, ord: 0, node: { neta: mk("L", "section", { title: "ラスサビ", key: 2 }), children: [melodyKid()] } }, // +2 転調
      ],
    });
    // L は共有(2箇所)かつ variant_of を持つ／A は未共有・非分家。
    getPlacements.mockImplementation(async (id: string) => (id === "L" ? { parents: [], placementCount: 2 } : { parents: [], placementCount: 1 }));
    getRelations.mockImplementation(async (id: string) => (id === "L" ? [{ type: "variant_of", neta: mk("A", "section") }] : []));
    render(<SectionEditor neta={mk("g1", "song", { key: 0 })} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-card-L");
    expect(screen.getByLabelText("keychg-L")).toHaveTextContent("+2"); // 曲(C)とラスサビ(D)＝+2半音
    expect(screen.queryByLabelText("keychg-A")).toBeNull(); // 同調＝バッジ無し
    await waitFor(() => expect(screen.getByLabelText("shared-L")).toBeInTheDocument()); // 🔗（非同期解決）
    expect(screen.getByLabelText("variant-L")).toHaveTextContent("′"); // A′
    expect(screen.queryByLabelText("shared-A")).toBeNull();
    expect(screen.queryByLabelText("variant-A")).toBeNull();
  });

  it("分家にする＝vary した新セクションでその配置だけ差し替え（position/ord 維持）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("g1", "song"),
      children: [
        sectionChild("A", 0),
        { position: 32, ord: 0, node: { neta: mk("S", "section", { title: "サビ", key: 0 }), children: [melodyKid()] } },
      ],
    });
    vary.mockResolvedValue(mk("S2", "section", { title: "サビ′", key: 0 }));
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-card-S");
    await userEvent.click(screen.getByLabelText("fs-branch-S"));
    await waitFor(() => expect(vary).toHaveBeenCalledWith("S")); // サビを分家
    expect(removeChild).toHaveBeenCalledWith("g1", "S", 32); // 元の配置を外し
    expect(placeChild).toHaveBeenCalledWith("g1", "S2", 32, 0); // 分家を同 position/ord で置く
  });

  // 監査FAIL#7：song の「いじる▾」＝TinkerSheet を開いても落ちない（melodyLaneNotes が song-safe）。
  // 旧: lanesForKind("song") に melody レーンが無く `lanes.find(...)!` が undefined → `.kinds` 参照で
  // React root ごと白画面クラッシュ＝part別MIDI書き出しの唯一の導線が到達不能だった。
  it("song の いじる▾＝クラッシュせず開き、MIDI/MIDI(分割) ボタンが出る", async () => {
    getComposition.mockResolvedValue({ neta: mk("g1", "song"), children: [sectionChild("A", 0)] });
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-card-A");
    await userEvent.click(screen.getByLabelText("tools")); // ← 旧実装はここで throw（白画面）
    expect(await screen.findByLabelText("tools-menu")).toBeInTheDocument();
    expect(screen.getByLabelText("export-midi")).toBeInTheDocument(); // 書き出し導線が到達可能
    expect(screen.getByLabelText("export-midi-split")).toBeInTheDocument(); // part別（設計S1の是正の実体）
  });

  // ── S3-a：提案▾（つなぎ＝計画 verb の結線） ──
  it("提案▾＝フォーム/転調/エナジーの3項目メニュー", async () => {
    getComposition.mockResolvedValue({ neta: mk("g1", "song"), children: [] });
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-strip");
    await userEvent.click(screen.getByLabelText("suggest-menu"));
    expect(screen.getByLabelText("suggest-form")).toBeInTheDocument();
    expect(screen.getByLabelText("suggest-key")).toBeInTheDocument();
    expect(screen.getByLabelText("suggest-energy")).toBeInTheDocument();
  });

  it("suggest_form＝空ストリップ：候補タップで空 section（role タグ+bars・key 無し）を前置和で並べる", async () => {
    getComposition.mockResolvedValue({ neta: mk("g1", "song"), children: [] });
    suggestForm.mockResolvedValue({
      candidates: [{ id: "F01", name: "J-pop黄金", sections: [{ role: "intro", bars: 4 }, { role: "chorus", bars: 8 }], totalBars: 12, seconds: 24, withinTarget: true, notes: [] }],
    });
    createNeta.mockImplementation(async (input: { tags?: string[] }) => mk(`new-${input.tags?.[0]}`, "section", input as never));
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-strip");
    await userEvent.click(screen.getByLabelText("suggest-menu"));
    await userEvent.click(screen.getByLabelText("suggest-form"));
    await userEvent.click(await screen.findByLabelText("form-cand-F01")); // 空＝確認なしで即適用
    await waitFor(() => expect(createNeta).toHaveBeenCalledTimes(2));
    // 足場＝role タグ＋bars＋役割ラベル title・key は設定しない（曲 key で再帰合成）
    expect(createNeta).toHaveBeenCalledWith(expect.objectContaining({ kind: "section", title: "Intro", bars: 4, tags: ["role:intro"] }));
    expect(createNeta).toHaveBeenCalledWith(expect.objectContaining({ kind: "section", title: "サビ", bars: 8, tags: ["role:chorus"] }));
    expect(createNeta.mock.calls.every((c) => (c[0] as { key?: number }).key === undefined)).toBe(true);
    // 前置和射影：intro@0・chorus@16（4小節×4拍）
    await waitFor(() => expect(placeChild).toHaveBeenCalledWith("g1", "new-role:intro", 0, 0));
    expect(placeChild).toHaveBeenCalledWith("g1", "new-role:chorus", 16, 0);
    expect(removeChild).not.toHaveBeenCalled(); // 空＝除去なし
  });

  it("suggest_form＝非空ストリップ：置き換え確認・「やめる」＝無変更／OK＝辺のみ除去して足場化", async () => {
    getComposition.mockResolvedValue({ neta: mk("g1", "song"), children: [sectionChild("A", 0)] });
    suggestForm.mockResolvedValue({
      candidates: [{ id: "F02", name: "標準", sections: [{ role: "verse", bars: 8 }], totalBars: 8, seconds: 16, withinTarget: true, notes: [] }],
    });
    createNeta.mockImplementation(async (input: { tags?: string[] }) => mk("scaf", "section", input as never));
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-card-A");
    await userEvent.click(screen.getByLabelText("suggest-menu"));
    await userEvent.click(screen.getByLabelText("suggest-form"));
    await userEvent.click(await screen.findByLabelText("form-cand-F02"));
    // 置き換え確認 →「やめる」＝何も起きない
    await userEvent.click(await screen.findByLabelText("form-replace-cancel"));
    expect(removeChild).not.toHaveBeenCalled();
    expect(createNeta).not.toHaveBeenCalled();
    // もう一度 → OK＝既存の辺を除去（ネタは無傷＝deleteNeta ではない）→足場を配置
    await userEvent.click(screen.getByLabelText("suggest-menu"));
    await userEvent.click(screen.getByLabelText("suggest-form"));
    await userEvent.click(await screen.findByLabelText("form-cand-F02"));
    await userEvent.click(await screen.findByLabelText("form-replace-ok"));
    await waitFor(() => expect(removeChild).toHaveBeenCalledWith("g1", "A", 0));
    await waitFor(() => expect(placeChild).toHaveBeenCalledWith("g1", "scaf", 0, 0));
  });

  it("suggest_key_plan＝サマリ確認（割れる配置は分家の明示）→適用＝direct更新+自動分家", async () => {
    // A（verse・共有なし）＋サビS×2（2箇所目だけ +1 のプラン）
    getComposition.mockResolvedValue({
      neta: mk("g1", "song"),
      children: [sectionChild("A", 0, ["role:verse"]), sectionChild("S", 32, ["role:chorus"]), sectionChild("S", 64, ["role:chorus"])],
    });
    suggestKeyPlan.mockResolvedValue({
      plans: [{
        id: "P1", label: "ラスサビ+1", score: 1,
        sections: [
          { role: "verse", key: 0, mode: "major" },
          { role: "chorus", key: 0, mode: "major" },
          { role: "chorus", key: 1, mode: "major" }, // 3枚目だけ +1＝ターゲットが割れる
        ],
        transitions: [{ from: 1, to: 2, name: "全音上げ", semitones: 1 }],
      }],
    });
    vary.mockResolvedValue(mk("Sb", "section", { title: "S′" }));
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-card-A");
    await userEvent.click(screen.getByLabelText("suggest-menu"));
    await userEvent.click(screen.getByLabelText("suggest-key"));
    // roles＝position 順で渡る
    await waitFor(() => expect(suggestKeyPlan).toHaveBeenCalledWith(["verse", "chorus", "chorus"], 0, "major"));
    await userEvent.click(await screen.findByLabelText("key-plan-P1"));
    // サマリ＝分家される配置が明示される
    const summary = await screen.findByLabelText("key-apply-summary");
    expect(summary.textContent).toContain("分家");
    await userEvent.click(screen.getByLabelText("key-apply"));
    // S の先頭ターゲット(±0=現状)＝実体は触らない・3枚目(@64)だけ vary→辺差し替え→分家へ key
    await waitFor(() => expect(vary).toHaveBeenCalledWith("S"));
    expect(removeChild).toHaveBeenCalledWith("g1", "S", 64);
    expect(placeChild).toHaveBeenCalledWith("g1", "Sb", 64, 0);
    await waitFor(() => expect(updateNeta).toHaveBeenCalledWith("Sb", { key: 1, mode: "major" }));
    expect(updateNeta).not.toHaveBeenCalledWith("S", expect.anything()); // 実体は無変更（±0）
    expect(updateNeta).not.toHaveBeenCalledWith("A", expect.anything());
  });

  it("suggest_energy_plan＝Δチップが揮発表示される（永続 API は呼ばない）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("g1", "song"),
      children: [sectionChild("A", 0, ["role:verse"]), sectionChild("S", 32, ["role:chorus"])],
    });
    suggestEnergyPlan.mockResolvedValue({
      template: "jpop_standard",
      sections: [{ role: "verse", absLevel: "mid", level: 2 }, { role: "chorus", absLevel: "high", level: 4 }],
    });
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-card-A");
    await userEvent.click(screen.getByLabelText("suggest-menu"));
    await userEvent.click(screen.getByLabelText("suggest-energy"));
    await userEvent.click(await screen.findByLabelText("energy-jpop_standard"));
    await waitFor(() => expect(suggestEnergyPlan).toHaveBeenCalledWith(["verse", "chorus"], "jpop_standard"));
    expect((await screen.findByLabelText("energy-A")).textContent).toBe("→"); // 先頭＝基準
    expect(screen.getByLabelText("energy-S").textContent).toBe("↑↑"); // 2→4＝+2
    expect(updateNeta).not.toHaveBeenCalled(); // 揮発＝保存しない
  });

  it("遷移試聴＝内側の境界にだけ♪ボタン・タップで境界±2小節の窓を再生・再タップで停止", async () => {
    getComposition.mockResolvedValue({
      neta: mk("g1", "song"),
      children: [sectionChild("A", 0), sectionChild("B", 32)],
    });
    const stop = vi.fn();
    playNotes.mockResolvedValue({ stop, pause: vi.fn(), resume: vi.fn() });
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("form-card-A");
    expect(screen.queryByLabelText("fs-trans-0")).toBeNull(); // 先頭カードの前には出ない
    const btn = screen.getByLabelText("fs-trans-1"); // A|B 境界
    await userEvent.click(btn);
    await waitFor(() => expect(playNotes).toHaveBeenCalledTimes(1));
    // 窓＝[24,40)＝A末2小節（メロ 0..32 のクリップ [24,32)→start0 dur8）。0起点シフト済み。
    const notes = playNotes.mock.calls[0]![0] as { start: number; dur: number }[];
    expect(Math.min(...notes.map((n) => n.start))).toBe(0);
    expect(notes.every((n) => n.start + n.dur <= 16 + 1e-6)).toBe(true); // 窓幅=4小節ぶん以内
    expect(btn).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(btn); // トグル停止
    expect(stop).toHaveBeenCalled();
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });
});
