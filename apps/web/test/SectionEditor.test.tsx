import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { getComposition, listNeta, placeChild, removeChild, createNeta, copyNeta, recommend, getSong, updateSong, updateNeta, music, link, getPlacements, getRelations, vary } =
  vi.hoisted(() => ({
    getComposition: vi.fn(),
    listNeta: vi.fn(),
    placeChild: vi.fn(),
    removeChild: vi.fn(),
    createNeta: vi.fn(),
    copyNeta: vi.fn(),
    recommend: vi.fn(),
    getSong: vi.fn(),
    updateSong: vi.fn(),
    updateNeta: vi.fn(),
    music: vi.fn(),
    link: vi.fn(),
    getPlacements: vi.fn(), // S2 共有バッジ
    getRelations: vi.fn(),
    vary: vi.fn(),
  }));
vi.mock("../src/api", () => ({
  api: { getComposition, listNeta, placeChild, removeChild, createNeta, copyNeta, recommend, getSong, updateSong, updateNeta, music, link, getPlacements, getRelations, vary },
}));

import { SectionEditor, loopPositions, spanOverlaps } from "../src/components/SectionEditor";
import { useCowGuard } from "../src/useCowGuard";
import { CowPrompt } from "../src/components/CowPrompt";
import { beatsPerBar } from "../src/music";
import { voiceLeadingBadge } from "../src/useMelodyGen";

describe("voiceLeadingBadge（対位法バッジ・design #20 S3d・指摘のみ）", () => {
  const rep = (over: Partial<{ parallelFifths: number; parallelOctaves: number; directFifths: number; directOctaves: number; voiceCrossings: number }> = {}) =>
    ({ voiceLeading: { score: 0.9, parallelFifths: 0, parallelOctaves: 0, directFifths: 0, directOctaves: 0, voiceCrossings: 0, ...over } });
  it("meta 無し＝null（非表示）", () => { expect(voiceLeadingBadge(undefined)).toBeNull(); });
  it("違反なし＝「対位OK」warn=false", () => { expect(voiceLeadingBadge(rep())).toEqual({ text: "対位OK", warn: false }); });
  it("違反あり＝⚠＋種別×件数 warn=true", () => {
    expect(voiceLeadingBadge(rep({ parallelFifths: 1, voiceCrossings: 2 }))).toEqual({ text: "⚠並5×1 交差×2", warn: true });
  });
});

describe("spanOverlaps（尺の重なり判定＝配置/ループのはみ出し重複ガード）", () => {
  it("重なる／端が接するだけ／離れる を正しく判定", () => {
    expect(spanOverlaps(0, 3, 2, 3)).toBe(true); // 0-3 と 2-5 は重なる
    expect(spanOverlaps(0, 3, 3, 3)).toBe(false); // 0-3 と 3-6 は端が接するだけ＝重ならない（小節隣接OK）
    expect(spanOverlaps(0, 3, 6, 3)).toBe(false); // 離れてる
    expect(spanOverlaps(6, 2.75, 9, 2.75)).toBe(false); // 1小節rhythmの隣接（0.25ギャップ）は重ならない
    expect(spanOverlaps(6, 6, 9, 3)).toBe(true); // 2小節ネタ@6(6-12)は @9(9-12) と重なる＝はみ出し重複を検出
  });
});

describe("loopPositions（③ ループ伸ばしのタイル反復位置）", () => {
  it("元ブロックの後ろに unit 刻みで、中点を過ぎたループを並べる（fromPos は据え置き＝含めない）", () => {
    expect(loopPositions(0, 4, 8, 32)).toEqual([4]); // 4-8 の中点6<8 → 入る
    expect(loopPositions(0, 4, 16, 32)).toEqual([4, 8, 12]); // 中点6/10/14 <16 → 3ループ
  });
  it("コピーは中点まで引いて確定＝少し引いただけで全長が飛び出さない／グリッド total で頭打ち", () => {
    // p+unit/2 < endBeat（中点超え）で確定。半分引かないと入らない＝後ろに飛び出し過ぎない（オーナー指摘）。
    expect(loopPositions(0, 4, 7, 32)).toEqual([4]); // 4-8 の中点6<7 → 入る
    expect(loopPositions(0, 4, 5, 32)).toEqual([]); // 中点6>=5 → まだ入らない
    // section を song でループ：4小節(unit16)を8小節グリッド(total32)。中点24を過ぎたら1個。
    expect(loopPositions(0, 16, 20, 32)).toEqual([]); // 中点24>=20 → まだ
    expect(loopPositions(0, 16, 26, 32)).toEqual([16]); // 中点24<26 → 入る
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
  beforeEach(() => {
    recommend.mockResolvedValue([]); // #20 既定＝おすすめ無し（各テストで上書き可）
    getSong.mockResolvedValue(null); // song の SongStatus overlay（未設定）
    updateSong.mockResolvedValue({});
    updateNeta.mockReset();
    updateNeta.mockResolvedValue({}); // レーン表示/ミュートの content 保存（fire-and-forget）
    copyNeta.mockReset();
    getPlacements.mockResolvedValue({ parents: [], placementCount: 0 }); // S2 既定＝未共有（バッジ無し）
    getRelations.mockResolvedValue([]);
    vary.mockReset();
  });

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

  it("#20 S6：骨格ブロックタップ→onOpenSkeletonDesk（机）へ（潜らない）。target が正しい", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 4, ord: 0, node: { neta: mk("sk1", "skeleton", { content: { bars: 2, tones: [{ start: 0, pitch: 60 }] }, key: 2, mode: "major" }), children: [] } }],
    });
    const onOpenNeta = vi.fn();
    const onOpenSkeletonDesk = vi.fn();
    render(<SectionEditor neta={mk("s1", "section", { mode: "major" })} keyPc={0} tempo={120} meter="4/4" onOpenNeta={onOpenNeta} onOpenSkeletonDesk={onOpenSkeletonDesk} />);
    await userEvent.click(await screen.findByLabelText("block-sk1@4"));
    expect(onOpenSkeletonDesk).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: "s1", sectionKey: 0, sectionMode: "major", meter: "4/4", tempo: 120, skelNetaId: "sk1", skelPosition: 4, skelOrd: 0 }),
    );
    expect(onOpenNeta).not.toHaveBeenCalled(); // 骨格は机へ＝潜らない
  });

  it("#20 S6：onOpenSkeletonDesk 未指定なら骨格も従来どおり onOpenNeta（後方互換）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 0, ord: 0, node: { neta: mk("sk1", "skeleton", { content: { bars: 2, tones: [] } }), children: [] } }],
    });
    const onOpenNeta = vi.fn();
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} onOpenNeta={onOpenNeta} />);
    await userEvent.click(await screen.findByLabelText("block-sk1@0"));
    expect(onOpenNeta).toHaveBeenCalledWith(expect.objectContaining({ id: "sk1" }));
  });

  it("消しゴムモード＝ブロックtap一発で外す（通常はtap=編集・長押しは撤去）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 0, ord: 0, node: { neta: mk("c1", "melody", { title: "メロ案" }), children: [] } }],
    });
    removeChild.mockResolvedValue({ ok: true });
    const onOpenNeta = vi.fn();
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} onOpenNeta={onOpenNeta} />);
    await screen.findByLabelText("block-c1@0");
    await userEvent.click(screen.getByLabelText("mode-erase")); // 消しゴムモードへ
    await userEvent.click(screen.getByLabelText("block-c1@0")); // tap一発
    await waitFor(() => expect(removeChild).toHaveBeenCalledWith("s1", "c1", 0));
    expect(onOpenNeta).not.toHaveBeenCalled(); // 消しゴム中は編集を開かない
  });

  it("P1 候補の視覚プレビュー：生成候補が MiniRoll＋長さ/音数で見える（UX再設計・2026-07-10）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 64, start: 1, dur: 1 }, { pitch: 67, start: 2, dur: 2 }] } }] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    // 生成前は候補パネル無し
    expect(screen.queryByLabelText("part-candidate")).toBeNull();
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    // 候補パネルに MiniRoll(mini-preview) と 長さ/音数メタが出る＝音を聴く前に目で選べる
    await screen.findByLabelText("part-candidate");
    const preview = screen.getByLabelText("candidate-preview");
    expect(within(preview).getByLabelText("mini-preview")).toBeInTheDocument(); // 候補内に MiniRoll(svg)
    expect(within(preview).getByText(/音$/)).toBeInTheDocument(); // 「◯小節・◯音」メタ
  });
  it("S3d 対位法バッジ：候補 meta の voiceLeading を候補カードに表示（違反ありは⚠・design #20）", async () => {
    music.mockReset();
    music.mockResolvedValue({
      items: [{
        kind: "melody",
        content: { notes: [{ pitch: 67, start: 0, dur: 1 }, { pitch: 69, start: 1, dur: 1 }] },
        meta: { voiceLeading: { score: 0.85, parallelFifths: 1, parallelOctaves: 0, directFifths: 0, directOctaves: 0, voiceCrossings: 0 }, voiceLeadingSummary: "並行5度1・score0.85" },
      }],
    });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await screen.findByLabelText("candidate-tray");
    const badge = await screen.findByLabelText("voiceleading-badge");
    expect(badge).toHaveTextContent("⚠並5×1"); // 違反ありは注意バッジ・禁止はしない（置くボタンは残る）
    expect(badge).toHaveAttribute("title", "並行5度1・score0.85"); // 詳細はツールチップ
    expect(screen.getByLabelText("place-candidate")).toBeInTheDocument(); // score低でも置ける
  });
  it("句フレージング：つなぎ(flow)スライダーを上げると gen_melody に flow が乗る（2026-07-11）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-melody")); // メロ引き出しへ
    await userEvent.click(screen.getByLabelText("group-phrase")); // フレーズの組み立て群を開く（つなぎはここに沈む）
    fireEvent.change(screen.getByLabelText("flow"), { target: { value: "0.7" } }); // つなぎ=0.7
    await userEvent.click(screen.getByLabelText("gen-gen_melody")); // 引き出し下端の生成
    await waitFor(() => expect(music).toHaveBeenCalledWith("gen_melody", expect.objectContaining({ flow: 0.7 })));
  });
  // ---- #23 いじる🎲の体感結線（UI監査 2026-07-15）＝振ってから即・再生成／必ず動く／もっとの沈黙修正 ----
  const withChords = () => ({
    neta: mk("s1", "section"),
    children: [{ position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } }],
  });
  const inp = (aria: string) => (screen.getByLabelText(aria) as HTMLInputElement).value;
  it("#23 🎲＝振ってから即・再生成：ロック外ノブが変わり、その振った後の値で gen_melody が1回走る（staleなし）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }] });
    getComposition.mockResolvedValue(withChords());
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.9); // delta=+0.24 → 0.1刻みで確定的に上振れ（density 0.5→0.7）
    try {
      render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
      await screen.findByLabelText("block-ch1@0");
      await userEvent.click(screen.getByLabelText("tools"));
      await userEvent.click(screen.getByLabelText("drawer-melody"));
      expect(inp("density")).toBe("0.5"); // 既定
      await userEvent.click(screen.getByLabelText("dice-roll"));
      // (a) ロック外ノブが押下前と変わる
      expect(inp("density")).toBe("0.7");
      // (c) gen_melody が1回・「振った後の値(0.7)」で走る＝state(0.5)ではなく rolled が body に乗る＝stale無し
      await waitFor(() => expect(music).toHaveBeenCalledWith("gen_melody", expect.objectContaining({ density: 0.7 })));
      expect(music.mock.calls.filter((c) => c[0] === "gen_melody")).toHaveLength(1);
    } finally { rnd.mockRestore(); }
  });
  it("#23 🔒ロックしたノブは乱択から守られる（値不変・body も現在値／他ノブは振れる）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }] });
    getComposition.mockResolvedValue(withChords());
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.9);
    try {
      render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
      await screen.findByLabelText("block-ch1@0");
      await userEvent.click(screen.getByLabelText("tools"));
      await userEvent.click(screen.getByLabelText("drawer-melody"));
      await userEvent.click(screen.getByLabelText("lock-density")); // density を固定
      await userEvent.click(screen.getByLabelText("dice-roll"));
      // (b) ロック中 density は不変(0.5)、ロック外 swing は振れる(0→0.2)
      expect(inp("density")).toBe("0.5");
      expect(inp("swing")).toBe("0.2");
      await waitFor(() => expect(music).toHaveBeenCalledWith("gen_melody", expect.objectContaining({ density: 0.5, swing: 0.2 })));
    } finally { rnd.mockRestore(); }
  });
  it("#23 乱択が現在値と同一なら最小刻み0.1だけ必ず動く（中間は±0.1・clamp端は内側へ）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }] });
    getComposition.mockResolvedValue(withChords());
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.5); // delta=0 → 全ノブ「同値」→強制移動が発火
    try {
      render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
      await screen.findByLabelText("block-ch1@0");
      await userEvent.click(screen.getByLabelText("tools"));
      await userEvent.click(screen.getByLabelText("drawer-melody"));
      await userEvent.click(screen.getByLabelText("dice-roll"));
      // density 0.5(中間)→+0.1→0.6、swing 0(端≤0)→内側へ0.1＝「押したのに何も変わらない」の根絶
      expect(inp("density")).toBe("0.6");
      expect(inp("swing")).toBe("0.1");
    } finally { rnd.mockRestore(); }
  });
  it("#23 コード無しセクションでは 🎲 と メロ生成が disabled（理由を title に・gen-gen_melody と同条件）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 0, ord: 0, node: { neta: mk("c1", "melody", { content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }), children: [] } }],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-c1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-melody")); // メロ在→タイル→引き出し（コードは無い）
    const dice = screen.getByLabelText("dice-roll");
    expect(dice).toBeDisabled();
    expect(dice).toHaveAttribute("title", "コードが要る（先に進行を置く）");
    expect(screen.getByLabelText("gen-gen_melody")).toBeDisabled(); // 引き出し下端の生成も同条件で disabled
  });
  it("#23「もっと」は直前の生成が無い間 disabled（ハモリ＝lastPart null の候補トレイ）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 0, ord: 0, node: { neta: mk("c1", "melody", { content: { notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 64, start: 1, dur: 1 }] } }), children: [] } }],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-c1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-melody"));
    await userEvent.click(screen.getByLabelText("harmony-up")); // 決定的ハモリ＝lastPart null で候補トレイが出る
    const more = await screen.findByLabelText("more-candidates");
    expect(more).toBeDisabled();
    expect(more).toHaveAttribute("title", "直前の生成がまだない");
  });
  it("#23「もっと」は生成後 enabled（lastPart 有り＝同条件でもう一発）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }] });
    getComposition.mockResolvedValue(withChords());
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_melody")); // ハブのメロタイル＝生成→lastPart 有り
    await screen.findByLabelText("candidate-tray");
    expect(screen.getByLabelText("more-candidates")).toBeEnabled();
  });
  it("WP-X3 派生パーツ露出：リフ/管弦を『この進行に生成』から生成＝正しい op＋進行を渡す", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [{ kind: "riff", content: { notes: [{ pitch: 60, start: 0, dur: 1 }], program: 30 } }] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    // 進行があるので派生パーツのタイルが出る（needsChords）。
    expect(screen.getByLabelText("gen-gen_riff")).toBeInTheDocument();
    expect(screen.getByLabelText("gen-gen_section_inst")).toBeInTheDocument();
    // counter(対旋律)は主メロ必須のため『この進行に生成』には出さない。
    expect(screen.queryByLabelText("gen-gen_counter")).toBeNull();
    // リフ生成＝op=gen_riff＋chords(進行)を渡す。
    await userEvent.click(screen.getByLabelText("gen-gen_riff"));
    await waitFor(() => expect(music).toHaveBeenCalledWith("gen_riff", expect.objectContaining({ chords: [expect.objectContaining({ root: 0 })] })));
    // 管弦生成＝op=gen_section_inst。
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_section_inst"));
    await waitFor(() => expect(music).toHaveBeenCalledWith("gen_section_inst", expect.objectContaining({ chords: expect.any(Array) })));
  });
  it("WP-X3 派生パーツ：進行が無いセクションではリフ/管弦タイルを出さない（needsChords）", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("timeline");
    await userEvent.click(screen.getByLabelText("tools"));
    expect(screen.queryByLabelText("gen-gen_riff")).toBeNull();
    expect(screen.queryByLabelText("gen-gen_section_inst")).toBeNull();
    expect(screen.getByLabelText("gen-gen_drums")).toBeInTheDocument(); // ドラムは進行不要＝出る
  });
  it("P2 候補トレイ：もっとで候補が積み上がり比較できる／keepでマーク／捨てるで減る", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 64, start: 1, dur: 1 }] } }] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await screen.findByLabelText("candidate-tray");
    expect(screen.getAllByLabelText("candidate-card")).toHaveLength(1);
    // 「もっと」で2件目が積まれる（上書きでなく比較できる）
    await userEvent.click(screen.getByLabelText("more-candidates"));
    await waitFor(() => expect(screen.getAllByLabelText("candidate-card")).toHaveLength(2));
    // keep でマーク（♡→♥）
    const keeps = screen.getAllByLabelText("keep-candidate");
    await userEvent.click(keeps[0]!);
    expect(keeps[0]!).toHaveAttribute("aria-pressed", "true");
    // 捨てるで1件減る
    await userEvent.click(screen.getAllByLabelText("drop-candidate")[1]!);
    await waitFor(() => expect(screen.getAllByLabelText("candidate-card")).toHaveLength(1));
  });
  it("E2E[高] 候補があっても生成UI(プリセット/生成ボタン)は消えない＝別プリセットで作り直せる", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await screen.findByLabelText("candidate-tray"); // 候補が出た
    await userEvent.click(screen.getByLabelText("tools")); // シートを開き直す＝ハブ
    // 旧: 候補ありで生成UI丸ごと非表示だった。今: ハブのメロタイル(生成)＋引き出しのプリセットが残り、別プリセットで作り直せる。
    expect(screen.getByLabelText("gen-gen_melody")).toBeInTheDocument(); // ハブのメロタイル
    await userEvent.click(screen.getByLabelText("drawer-melody"));
    expect(screen.getByLabelText("melody-presets")).toBeInTheDocument();
  });
  it("P3 いじるシート：ヘッダの閉じるボタンで閉じる（ボトムシート化）", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("timeline");
    await userEvent.click(screen.getByLabelText("tools"));
    expect(screen.getByLabelText("tools-menu")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("close-tools"));
    expect(screen.queryByLabelText("tools-menu")).toBeNull(); // シートが閉じる
  });
  it("いじる▾に生成・書き出しを集約＝閉じてる間は隠れ、開くと現れる（⑤ メロ編集画面と整合）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        {
          position: 0,
          ord: 0,
          node: { neta: mk("c1", "melody", { title: "メロ案", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }), children: [] },
        },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-c1@0");
    // 閉じてる間は生成/書き出しボタンは出さない（バラ撒かない＝薄い）
    expect(screen.queryByLabelText("gen-gen_drums")).toBeNull();
    expect(screen.queryByLabelText("export-midi")).toBeNull();
    // いじる▾ を開くと現れる＝ハブにドラムタイル・書き出し、メロ引き出しにハモリ
    await userEvent.click(screen.getByLabelText("tools"));
    expect(screen.getByLabelText("gen-gen_drums")).toBeInTheDocument(); // ハブのドラムタイル
    expect(screen.getByLabelText("export-midi")).toBeInTheDocument(); // ハブ書き出し
    await userEvent.click(screen.getByLabelText("drawer-melody")); // メロ引き出しへ（メロ在→タイルが出る）
    expect(screen.getByLabelText("harmony-up")).toBeInTheDocument(); // メロがある→メロを直す
  });

  it("#20 ピッカーおすすめ＝コーパスを数件出し、tapでコピーして配置（生libraryは直接選ばせない）", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    listNeta.mockResolvedValue([]); // 自作は無し
    recommend.mockResolvedValue([mk("libM", "melody", { title: "コーパスメロ", scope: "library" } as Partial<Neta>)]);
    copyNeta.mockResolvedValue(mk("copyM", "melody"));
    placeChild.mockResolvedValue({ ok: true });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("place-melody-0")); // メロ空セル→ピッカー
    // おすすめにコーパス項目が出る（拍子/調で数件）
    await waitFor(() => expect(recommend).toHaveBeenCalledWith("melody", expect.objectContaining({ meter: "4/4", key: 0 })));
    const rec = await screen.findByLabelText("picker-rec-libM");
    await userEvent.click(rec);
    // library はコピーしてから配置（元コーパスを汚さない）
    await waitFor(() => expect(copyNeta).toHaveBeenCalledWith("libM"));
    expect(placeChild).toHaveBeenCalledWith("s1", "copyM", 0, 0);
  });

  it("#曲フォーム song＝フォームストリップ（カード列・小節グリッドは出さない）", async () => {
    getComposition.mockResolvedValue({ neta: mk("g1", "song"), children: [] });
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("form-strip"); // ストリップに置換（小節グリッド timeline は出ない）
    expect(screen.queryByLabelText("timeline")).toBeNull();
    expect(screen.getByLabelText("fs-insert-0")).toBeInTheDocument(); // 空でも挿入ボタン
    expect(screen.queryByLabelText("place-melody-0")).toBeNull(); // パートレーンは無い
    expect(screen.queryByLabelText("place-section-0")).toBeNull(); // 小節グリッドの空セルも無い
  });

  it("#5 section＝パート専用（section-in-section 廃止＝section レーンは無い）", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("timeline");
    expect(screen.getByLabelText("place-melody-0")).toBeInTheDocument(); // パートレーンあり
    expect(screen.queryByLabelText("place-section-0")).toBeNull(); // 入れ子は廃止
  });

  it("#5 song の いじる▾ は書き出しのみ（生成/ハモリはパートの道具＝section 専用）", async () => {
    getComposition.mockResolvedValue({ neta: mk("g1", "song"), children: [] });
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("form-strip");
    await userEvent.click(screen.getByLabelText("tools"));
    expect(screen.getByLabelText("export-midi")).toBeInTheDocument();
    expect(screen.queryByLabelText("gen-gen_drums")).toBeNull(); // 生成は出さない
    expect(screen.queryByLabelText("harmony-up")).toBeNull();
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

  it("リズムを置く＝その小節に1つだけ（自動末尾充填はしない＝小節別に別パターンを置ける）", async () => {
    placeChild.mockClear(); // テスト間で mock.calls が累積するため（このテストの配置だけ数える）
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    listNeta.mockResolvedValue([mk("r", "rhythm", { title: "ドラム素材", content: { rhythm: { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }] } } })]);
    placeChild.mockResolvedValue({ ok: true });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await userEvent.click(screen.getByLabelText("place-rhythm-1")); // 2小節目(position 4)に置く
    await userEvent.click(await screen.findByText("ドラム素材"));
    await waitFor(() => expect(placeChild).toHaveBeenCalled());
    expect(placeChild.mock.calls.length).toBe(1); // 1回だけ（末尾まで敷かない）
    expect(placeChild.mock.calls[0]).toEqual(["s1", "r", 4, 0]);
  });
  it("評価バグ②: in-context作成は section のライブ拍子(6/8)を部品に刻む（stale neta.meter でなく）", async () => {
    createNeta.mockClear();
    // neta(=App active)は meter=null(stale)。だがライブ meter prop=6/8。作る部品は 6/8 で作る。
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    listNeta.mockResolvedValue([]);
    createNeta.mockResolvedValue(mk("newc", "chord_progression"));
    placeChild.mockResolvedValue({ ok: true });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} meter="6/8" />);
    await userEvent.click(screen.getByLabelText("place-chord-0"));
    await userEvent.click(await screen.findByLabelText("picker-create"));
    await waitFor(() => expect(createNeta).toHaveBeenCalledWith(expect.objectContaining({ kind: "chord_progression", meter: "6/8" })));
  });
  it("ピッカー(B): 拍子一致のみ既定＋トグルで拍子違いも／コーパス(library)は出さない", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    listNeta.mockResolvedValue([
      mk("m44", "melody", { title: "よん", meter: "4/4" }),
      mk("m68", "melody", { title: "ろくはち", meter: "6/8" }),
      mk("corp", "melody", { title: "pop pattern", scope: "library", meter: "4/4" }),
    ]);
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("place-melody-0"));
    await screen.findByText("よん");
    expect(screen.queryByText("ろくはち")).toBeNull(); // 拍子違いは既定で隠れる
    expect(screen.queryByText("pop pattern")).toBeNull(); // コーパスは直接出さない
    await userEvent.click(screen.getByLabelText("picker-other-meter"));
    expect(await screen.findByText("ろくはち")).toBeInTheDocument(); // トグルで拍子違いも
    expect(screen.queryByText("pop pattern")).toBeNull(); // それでもコーパスは出ない
  });
  it("ピッカー(A): 母集団を器で絞る＝section の器が既定／「自作すべて」で全部", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section", { tags: ["prj:曲A"] }), children: [] });
    listNeta.mockResolvedValue([
      mk("ma", "melody", { title: "曲Aメロ", tags: ["prj:曲A"], meter: "4/4" }),
      mk("mb", "melody", { title: "曲Bメロ", tags: ["prj:曲B"], meter: "4/4" }),
    ]);
    render(<SectionEditor neta={mk("s1", "section", { tags: ["prj:曲A"] })} keyPc={0} tempo={120} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("place-melody-0"));
    await screen.findByText("曲Aメロ"); // section の器=曲A が既定ソース
    expect(screen.queryByText("曲Bメロ")).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("picker-source"), ""); // 自作すべて
    expect(await screen.findByText("曲Bメロ")).toBeInTheDocument();
  });
  it("② コード楽器2レーンの空セルに置くと ord=1 で配置される", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    listNeta.mockResolvedValue([mk("cp9", "chord_pattern", { title: "パッド素材" })]);
    placeChild.mockResolvedValue({ ok: true });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("timeline");
    // コード楽器2は定番外＝空だと既定で畳まれる（レーン契約）。＋レーンで出してから空セルに置く。
    await userEvent.click(screen.getByLabelText("add-lane"));
    await userEvent.click(screen.getByLabelText("add-lane-chord_pattern2"));
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
  it("gen_melody＝対位はUI選択（2026-07-10・menu整理）：既定OFFはbass在っても bass/counter を渡さない（bit一致）", async () => {
    // 旧：bass 在れば固定0.3を自動送信＝既定挙動を無言で変えていた。新：既定OFF（未送信）＝bit一致の鉄則へ是正。
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
        { position: 0, ord: 0, node: { neta: mk("b1", "bass", { content: { notes: [{ pitch: 36, start: 0, dur: 1 }, { pitch: 43, start: 2, dur: 1 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-b1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    const [op, body] = music.mock.calls[0] as [string, Record<string, unknown>];
    expect(op).toBe("gen_melody");
    expect(body.bass).toBeUndefined(); // 対位OFF（既定）＝相手を渡さない
    expect(body.counter).toBeUndefined();
  });
  it("gen_melody＝対位ONを選ぶと bass＋counter(中=0.4)を渡す（詳細段でユーザーが選択）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
        { position: 0, ord: 0, node: { neta: mk("b1", "bass", { content: { notes: [{ pitch: 36, start: 0, dur: 1 }, { pitch: 43, start: 2, dur: 1 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-b1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-melody")); // メロ引き出しへ
    await userEvent.click(screen.getByLabelText("group-karami")); // 他パートとの絡み群を開く（ベース在時のみ）
    await userEvent.click(screen.getByLabelText("counter-mid")); // 対位=中（セグメント）
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    const [, body] = music.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.bass).toEqual([{ pitch: 36, start: 0, dur: 1 }, { pitch: 43, start: 2, dur: 1 }]);
    expect(body.counter).toBeCloseTo(0.4); // 中=0.4（弱0.2/中0.4/強0.7）
  });
  it("旋法パレット（WP-C1）：おまかせ既定は未送信・選ぶと frame.palette を全生成へ流す", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    // 既定（おまかせ）＝未送信＝bit一致
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    const [, body0] = music.mock.calls[0] as [string, { frame: Record<string, unknown> }];
    expect(body0.frame.palette).toBeUndefined();
    // 旋法＝浮遊(dorian)を選ぶ→コード生成にも frame.palette が乗る（生成でメニューが閉じるので開き直す）
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-common")); // #29 P1：進行の色は「共通」引き出しへ移設
    await userEvent.click(screen.getByLabelText("palette-dorian")); // 進行の色＝浮遊(dorian)
    await userEvent.click(screen.getByLabelText("drawer-back")); // 棚（ハブ）へ戻る＝palette 選択は gen 状態に残る
    await userEvent.click(screen.getByLabelText("gen-gen_chords"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    const [opC, bodyC] = music.mock.calls[0] as [string, { frame: Record<string, unknown> }];
    expect(opC).toBe("gen_chords");
    expect(bodyC.frame.palette).toBe("dorian");
  });
  it("メロノブ＝プリセットは常時・ノブは詳細に畳む／対位群はベース在時のみ（P4）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-melody")); // メロ引き出しへ
    expect(screen.getByLabelText("melody-presets")).toBeInTheDocument(); // プリセットは常時（主動線）
    expect(screen.getByLabelText("density")).toBeInTheDocument(); // 前面4ノブは常時露出（param-clarity §4.1 の回収）
    expect(screen.getByLabelText("runs-off")).toBeInTheDocument(); // 駆け上がり(セグメント)も前面
    expect(screen.queryByLabelText("phrasing")).toBeNull(); // 沈んだノブ(句割り)は群を開くまで出ない
    await userEvent.click(screen.getByLabelText("group-phrase"));
    expect(screen.getByLabelText("phrasing")).toBeInTheDocument(); // 群を開くと現れる
    expect(screen.queryByLabelText("group-karami")).toBeNull(); // ベース無し＝絡み群は出さない(文脈依存・グレーアウトすらしない)
  });
  it("gen_melody＝反復音(hook)ONで motifMode:preserve＋hook を送る／articulation も（詳細段・Phase2案B）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    // 既定（詳細を開かない＝hook 0）は preserve/hook を送らない＝bit一致
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    let body = music.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.hook).toBeUndefined();
    expect(body.motifMode).toBeUndefined();
    // 反復音セグメントを上げると motifMode:preserve＋hook を送る
    music.mockClear();
    await userEvent.click(screen.getByLabelText("tools")); // 生成で閉じたシートを開き直す＝ハブ
    await userEvent.click(screen.getByLabelText("drawer-melody")); // メロ引き出しへ
    await userEvent.click(screen.getByLabelText("group-utai")); // 歌い回し群を開く（口ずさみ/歯切れはここ）
    await userEvent.click(screen.getByLabelText("hook-strong")); // 口ずさみ=強（セグメント→0.9）
    fireEvent.change(screen.getByLabelText("articulation"), { target: { value: "0.5" } }); // 歯切れ=スライダー
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    body = music.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.motifMode).toBe("preserve");
    expect(body.hook).toBeCloseTo(0.9);
    expect(body.articulation).toBeCloseTo(0.5);
  });
  it("P4/P5 プリセット「走る」で駆け上がり=強・生成bodyにその値が乗る／🎲でロック外が変わる", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-melody")); // メロ引き出しへ
    await userEvent.click(screen.getByLabelText("preset-run")); // 「走る」＝runs0.7/density0.8…
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    const body = music.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.runs).toBeCloseTo(0.7); // プリセット値がそのまま送られる
    expect(body.density).toBeCloseTo(0.8);
    // 駆け上がり(runs=0.7)は前面segなので、引き出しを開いた時点で「中」バケット(0.45〜0.75)に光る
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-melody"));
    expect(screen.getByLabelText("runs-mid")).toHaveAttribute("aria-pressed", "true");
    // 「おまかせ」＝density 0.5(未タッチ既定)へ戻る＝従来生成（監査F1）
    music.mockClear();
    await userEvent.click(screen.getByLabelText("preset-plain"));
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    expect((music.mock.calls[0]![1] as Record<string, unknown>).density).toBeCloseTo(0.5);
  });
  it("T3 マイ設定＝［＋保存］でノブ群をlocalStorageに畳み、chip再選択で同値を再適用＝生成bodyが一致", async () => {
    localStorage.clear(); // 他テストのマイ設定を持ち込まない
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    // メロ引き出しで前面の細かさ/跳ねを動かして＋保存
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-melody"));
    fireEvent.change(screen.getByLabelText("density"), { target: { value: "0.7" } });
    fireEvent.change(screen.getByLabelText("swing"), { target: { value: "0.4" } });
    await userEvent.click(screen.getByLabelText("preset-save")); // マイ1 として保存＝選択中に
    // localStorage に畳まれる
    expect(JSON.parse(localStorage.getItem("cm_melody_my_presets") || "[]")).toHaveLength(1);
    // 別プリセットへ逃がしてからマイ1を再選択＝同値へ戻す
    await userEvent.click(screen.getByLabelText("preset-plain")); // density0.5 へ
    const myChip = screen.getByText("★マイ1");
    await userEvent.click(myChip);
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    const body = music.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.density).toBeCloseTo(0.7); // 保存した値がそのまま再適用され送られる
    expect(body.swing).toBeCloseTo(0.4);
    localStorage.clear();
  });
  it("gen_melody＝最小音符を選ぶと finest を送る／おまかせ(既定)は未送信（高BPM対策・オーナーFB）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_melody")); // おまかせ既定
    await waitFor(() => expect(music).toHaveBeenCalled());
    expect((music.mock.calls[0]![1] as Record<string, unknown>).finest).toBeUndefined();
    music.mockClear();
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-melody")); // メロ引き出しへ
    await userEvent.click(screen.getByLabelText("group-nori")); // リズムのノリ群を開く（最小音符はここに沈む）
    await userEvent.selectOptions(screen.getByLabelText("finest"), "eighth");
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    expect((music.mock.calls[0]![1] as Record<string, unknown>).finest).toBe("eighth");
  });
  it("gen_melody＝対位群はベースレーンが無いと出ない（文脈依存・グレーアウトすら見せない）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-melody")); // メロ引き出しへ
    expect(screen.queryByLabelText("group-karami")).toBeNull(); // ベース無し＝絡み群を出さない
    expect(screen.queryByLabelText("counter-off")).toBeNull();
  });
  it("gen_melody＝ベースレーンが空なら bass/counter を渡さない（従来どおり＝bit一致の鉄則）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    const [, body] = music.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.bass).toBeUndefined();
    expect(body.counter).toBeUndefined();
  });
  it("gen_melody＝リズムレーンの step 列をドラム入力として body に渡す（drums＋backbeat=0.3・design「gen_melody×ドラム結線」）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    const rhythm = { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [
      { name: "Kick", midi: 36, hits: [0, 7, 8], vel: 115 },
      { name: "Snare", midi: 38, hits: [4, 12], vel: 105 },
    ] };
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
        { position: 0, ord: 0, node: { neta: mk("r1", "rhythm", { content: { rhythm } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-r1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    const [op, body] = music.mock.calls[0] as [string, Record<string, unknown>];
    expect(op).toBe("gen_melody");
    // 位置0＝オフセット無し＝そのままの step 列（DrumsInput 形＝{rhythm:{steps,bars,beatsPerStep,lanes}}）
    expect(body.drums).toEqual({ rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [
      { name: "Kick", midi: 36, hits: [0, 7, 8], vel: 115 },
      { name: "Snare", midi: 38, hits: [4, 12], vel: 105 },
    ] } });
    expect(body.backbeat).toBeCloseTo(0.3); // 推奨既定＝Bのみ弱く（research 2026-07-10-melody-groove-drum-interaction）
    expect(body.drumLock).toBeUndefined(); // A/C は耳較正待ち＝渡さない（0＝従来）
    expect(body.converse).toBeUndefined();
  });
  it("gen_melody＝リズムレーンの複数配置は位置(拍)オフセットで1本のグリッドへマージされる", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    const rhythm = { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "Kick", midi: 36, hits: [0, 8] }] };
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
        { position: 0, ord: 0, node: { neta: mk("r1", "rhythm", { content: { rhythm } }), children: [] } },
        { position: 4, ord: 0, node: { neta: mk("r1", "rhythm", { content: { rhythm } }), children: [] } }, // ループ配置＝2小節目（拍4）
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-r1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    const [, body] = music.mock.calls[0] as [string, Record<string, unknown>];
    // 拍4＝step16 オフセット→ steps=32（2小節）・Kick hits=[0,8,16,24]
    expect(body.drums).toEqual({ rhythm: { steps: 32, bars: 2, beatsPerStep: 0.25, lanes: [{ name: "Kick", midi: 36, hits: [0, 8, 16, 24], vel: undefined }] } });
  });
  it("gen_melody＝リズムレーンが空なら drums/backbeat を渡さない（従来どおり＝bit一致の鉄則）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    const [, body] = music.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.drums).toBeUndefined();
    expect(body.backbeat).toBeUndefined();
  });

  it("T4 ドラム型chip化＝ジャンルchip/フィルsegが既存 style/fill を送る（値はbit一致・selectのUI化のみ）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-drums")); // ドラム引き出し
    await userEvent.click(screen.getByLabelText("drum-genre-rock")); // ジャンル＝ロック（chip前面）
    await userEvent.click(screen.getByLabelText("drum-fill-0.6")); // フィル＝中（seg前面）
    await userEvent.click(screen.getByLabelText("gen-gen_drums")); // 下端の生成
    await waitFor(() => expect(music).toHaveBeenCalled());
    const [op, body] = music.mock.calls[0] as [string, Record<string, unknown>];
    expect(op).toBe("gen_drums");
    expect(body.style).toBe("rock"); // ジャンルコードがそのまま
    expect(body.fill).toBeCloseTo(0.6);
  });
  it("T4 ドラム：おまかせ既定（fill 無し）はライブラリ検索へ（Task2/L3・生成器は叩かない）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    listNeta.mockReset();
    listNeta.mockResolvedValue([]); // seed 未投入＝候補0＝空トレイ
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_drums")); // ハブのドラムタイル＝おまかせ即生成
    await waitFor(() => expect(listNeta).toHaveBeenCalled());
    expect(music).not.toHaveBeenCalled(); // 生成器は叩かない（既定＝ライブラリ）
    const q = listNeta.mock.calls[0]![0] as { kind: string; scope: string; tags?: string[] };
    expect(q.kind).toBe("rhythm");
    expect(q.scope).toBe("library");
    expect(q.tags).toBeUndefined(); // おまかせ＝genre タグ無し
  });
  it("T4 ベース型chip化＝ジャンルchip/フィルsegが既存 style/fill を送る（bit一致）", async () => {
    music.mockReset();
    music.mockResolvedValue({ items: [] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-bass")); // ベース引き出し
    await userEvent.click(screen.getByLabelText("bass-genre-citypop")); // ジャンル＝シティポップ
    await userEvent.click(screen.getByLabelText("bass-fill-0.2")); // フィル＝下降
    await userEvent.click(screen.getByLabelText("gen-gen_bass"));
    await waitFor(() => expect(music).toHaveBeenCalled());
    const [op, body] = music.mock.calls[0] as [string, Record<string, unknown>];
    expect(op).toBe("gen_bass");
    expect(body.style).toBe("citypop");
    expect(body.fill).toBeCloseTo(0.2);
  });
  it("T5 おまかせで一式＝コード有ならドラム→ベース→メロを順に生成し候補をkind別グループで積む", async () => {
    music.mockReset();
    listNeta.mockReset();
    // Task2/L3：ドラム/ベース（ノブ無し）はライブラリ検索（listNeta）・メロは生成器（music）。
    listNeta.mockImplementation((q: { kind: string }) =>
      Promise.resolve([mk("lib", q.kind, { title: q.kind, scope: "library", content: q.kind === "bass" ? { mode: "relative", steps: 16, pattern: [{ step: 0, degree: "R", dur: 4 }] } : { rhythm: { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }] } } })]));
    music.mockResolvedValue({ items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }] });
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [
        { position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } },
      ],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-set")); // ☆おまかせで一式
    // ドラム→ベースはライブラリ（rhythm→bass）・メロは生成器（gen_melody）＝依存順は維持。
    await waitFor(() => expect(listNeta.mock.calls.map((c) => (c[0] as { kind: string }).kind)).toEqual(["rhythm", "bass"]));
    expect(music.mock.calls.map((c) => c[0])).toEqual(["gen_melody"]);
    // 候補トレイに 3 グループ（別kindでも置換せず積む＝一式のkind別保持）
    await screen.findByLabelText("part-candidate");
    expect(await screen.findByLabelText("cand-group-rhythm")).toBeInTheDocument();
    expect(screen.getByLabelText("cand-group-bass")).toBeInTheDocument();
    expect(screen.getByLabelText("cand-group-melody")).toBeInTheDocument();
    expect(screen.getAllByLabelText("candidate-card")).toHaveLength(3); // グループ跨ぎで3枚
  });
  it("T5 一式＝コード無しなら先頭にコード＋ドラム（コード相手が要る2本は次回に回す）", async () => {
    music.mockReset();
    listNeta.mockReset();
    // コードは生成器（gen_chords）・ドラムはライブラリ検索（Task2/L3）。
    music.mockResolvedValue({ items: [{ kind: "chord_progression", content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }] });
    listNeta.mockResolvedValue([mk("lib", "rhythm", { scope: "library", content: { rhythm: { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }] } } })]);
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("timeline");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-set"));
    await waitFor(() => expect(music.mock.calls.map((c) => c[0])).toEqual(["gen_chords"]));
    expect(listNeta.mock.calls.map((c) => (c[0] as { kind: string }).kind)).toEqual(["rhythm"]);
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

describe("骨格「鳴らす」トグル（耳確認・オーナーFB 2026-07-11）", () => {
  beforeEach(() => {
    recommend.mockResolvedValue([]);
    getSong.mockResolvedValue(null);
  });
  const skelChild = {
    position: 0,
    ord: 0,
    node: { neta: mk("sk1", "skeleton", { content: { bars: 2, tones: [{ start: 0, pitch: 64 }] } }), children: [] },
  };
  it("骨格レーンに子がある時だけトグルが出る・既定OFF→タップでON", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [skelChild] });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    const btn = await screen.findByLabelText("skeleton-audible");
    expect(btn.getAttribute("aria-pressed")).toBe("false"); // 既定OFF＝従来どおり無音
    await userEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true"); // ONの間だけ再生に骨格2声が混ざる（書き出しは不変）
  });
  it("骨格レーンが空ならトグルは出ない", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 0, ord: 0, node: { neta: mk("c1", "melody", { title: "メロ" }), children: [] } }],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-c1@0");
    expect(screen.queryByLabelText("skeleton-audible")).toBeNull();
  });
});

describe("骨格から吹く→realized_from（design #20・候補が骨格idを持つ＝可変ref撤去の回帰ガード）", () => {
  beforeEach(() => {
    recommend.mockResolvedValue([]);
    getSong.mockResolvedValue(null);
    music.mockReset();
    createNeta.mockReset();
    placeChild.mockReset();
    link.mockReset();
    link.mockResolvedValue({ ok: true });
    placeChild.mockResolvedValue({});
  });
  const skelChild = {
    position: 0,
    ord: 0,
    node: { neta: mk("sk1", "skeleton", { content: { bars: 2, tones: [{ start: 0, pitch: 64 }] } }), children: [] },
  };

  it("骨格ブロック[吹く▶]→gen_melody に skeletonNetaId が乗る／置くと realized_from(メロ→骨格)を張る", async () => {
    music.mockResolvedValue({ items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }] });
    createNeta.mockResolvedValue(mk("newmel", "melody"));
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [skelChild] });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await userEvent.click(await screen.findByLabelText("blow-sk1"));
    // コード無しでも骨格が構造を担うので生成される＋ skeletonNetaId が注入される
    await waitFor(() => expect(music).toHaveBeenCalledWith("gen_melody", expect.objectContaining({ skeletonNetaId: "sk1" })));
    await userEvent.click(await screen.findByLabelText("place-candidate"));
    // 置いた新メロ→骨格へ realized_from を張る（骨格に戻って直せる）
    await waitFor(() => expect(link).toHaveBeenCalledWith("newmel", "sk1", "realized_from"));
  });

  it("骨格ブロック[ベ▶]→gen_bass に skeletonNetaId が乗る／置くと realized_from(ベース→骨格)を張る（S3c）", async () => {
    music.mockResolvedValue({ items: [{ kind: "bass", content: { notes: [{ pitch: 36, start: 0, dur: 1 }] } }] });
    createNeta.mockResolvedValue(mk("newbass", "bass"));
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [skelChild] });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await userEvent.click(await screen.findByLabelText("blow-bass-sk1"));
    await waitFor(() => expect(music).toHaveBeenCalledWith("gen_bass", expect.objectContaining({ skeletonNetaId: "sk1" })));
    await userEvent.click(await screen.findByLabelText("place-candidate"));
    await waitFor(() => expect(link).toHaveBeenCalledWith("newbass", "sk1", "realized_from"));
  });

  it("通常のメロ生成（骨格由来でない候補）は realized_from を張らない＝ref撒き漏れの誤リンク無し", async () => {
    music.mockResolvedValue({ items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }] });
    createNeta.mockResolvedValue(mk("newmel2", "melody"));
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } }],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_melody"));
    await userEvent.click(await screen.findByLabelText("place-candidate"));
    await waitFor(() => expect(placeChild).toHaveBeenCalled());
    expect(link).not.toHaveBeenCalled(); // 骨格idを持たない候補＝リンクしない
  });
});

describe("レーンの表示/演奏の有効化（オーナー要望・Fable裁定）", () => {
  beforeEach(() => {
    recommend.mockResolvedValue([]);
    getSong.mockResolvedValue(null);
    updateNeta.mockReset();
    updateNeta.mockResolvedValue({});
  });

  it("既定＝定番4だけ表示。定番外（骨格/対旋律…）は畳み、＋レーンに候補が出る", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("timeline");
    // 定番4は見出しの畳むボタンが出る＝表示中
    for (const k of ["chord", "melody", "bass", "rhythm"]) expect(screen.getByLabelText(`collapse-${k}`)).toBeInTheDocument();
    // 定番外は畳まれている＝空セルも畳むボタンも無い
    expect(screen.queryByLabelText("place-skeleton-0")).toBeNull();
    expect(screen.queryByLabelText("collapse-counter")).toBeNull();
    // ＋レーンで畳んだレーンを選べる
    await userEvent.click(screen.getByLabelText("add-lane"));
    expect(screen.getByLabelText("add-lane-skeleton")).toBeInTheDocument();
    expect(screen.getByLabelText("add-lane-counter")).toBeInTheDocument();
    expect(screen.queryByLabelText("add-lane-melody")).toBeNull(); // 既に見えてるものは候補に出ない
  });

  it("中身のある定番外レーンは既定で表示（骨格に子）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 0, ord: 0, node: { neta: mk("sk1", "skeleton", { content: { bars: 2, tones: [{ start: 0, pitch: 60 }] } }), children: [] } }],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-sk1@0");
    expect(screen.getByLabelText("collapse-skeleton")).toBeInTheDocument(); // 中身あり＝出す
  });

  it("＋レーンで出す→content に lanes_shown を保存／畳む→lanes_hidden を保存", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("timeline");
    // 対旋律を出す
    await userEvent.click(screen.getByLabelText("add-lane"));
    await userEvent.click(screen.getByLabelText("add-lane-counter"));
    expect(screen.getByLabelText("place-counter-0")).toBeInTheDocument(); // 出た＝空セルが描かれる
    await waitFor(() => expect(updateNeta).toHaveBeenCalledWith("s1", expect.objectContaining({ content: expect.objectContaining({ lanes_shown: ["counter"] }) })));
    // 定番のメロを畳む＝lanes_hidden に入る（配置データは無傷＝再生/書き出しには残る）
    await userEvent.click(screen.getByLabelText("collapse-melody"));
    expect(screen.queryByLabelText("place-melody-0")).toBeNull(); // 畳まれた
    await waitFor(() => expect(updateNeta).toHaveBeenLastCalledWith("s1", expect.objectContaining({ content: expect.objectContaining({ lanes_hidden: ["melody"] }) })));
  });

  it("content の lanes_hidden/lanes_shown を復元して初期表示に反映（bit-safe＝既存は新既定）", async () => {
    getComposition.mockResolvedValue({ neta: mk("s1", "section"), children: [] });
    // メロを畳み、骨格を出した状態を content に持つセクション
    const neta = mk("s1", "section", { content: { lanes_hidden: ["melody"], lanes_shown: ["skeleton"] } });
    render(<SectionEditor neta={neta} keyPc={0} tempo={120} />);
    await screen.findByLabelText("timeline");
    expect(screen.queryByLabelText("place-melody-0")).toBeNull(); // hidden 復元
    expect(screen.getByLabelText("place-skeleton-0")).toBeInTheDocument(); // shown 復元
  });

  it("レーンミュート＝見出しのスピーカーで toggle・content に lanes_muted を保存（再生のみ・書き出しは全部入り）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 0, ord: 0, node: { neta: mk("b1", "bass", { content: { notes: [{ pitch: 36, start: 0, dur: 1 }] } }), children: [] } }],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-b1@0");
    const mute = screen.getByLabelText("mute-bass");
    expect(mute).toHaveAttribute("aria-pressed", "false"); // 既定＝鳴る
    await userEvent.click(mute);
    expect(mute).toHaveAttribute("aria-pressed", "true"); // ミュート
    await waitFor(() => expect(updateNeta).toHaveBeenCalledWith("s1", expect.objectContaining({ content: expect.objectContaining({ lanes_muted: ["bass"] }) })));
    // MIDI書き出しは全部入り＝ミュートしてもエクスポート経路(laneTracks/composite)には効かない（UI title で明示）
    expect(mute.getAttribute("title") ?? "").toContain("書き出しは全部入り");
  });

  it("song はアレンジ専用＝レーン畳み/ミュート/＋レーンは出さない（フォームストリップ）", async () => {
    getComposition.mockResolvedValue({ neta: mk("g1", "song"), children: [] });
    render(<SectionEditor neta={mk("g1", "song")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("form-strip"); // song はフォームストリップ（レーン概念なし）
    expect(screen.queryByLabelText("add-lane")).toBeNull();
    expect(screen.queryByLabelText("collapse-section")).toBeNull();
    expect(screen.queryByLabelText("mute-section")).toBeNull();
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

// ── S2 Fix C：section content を書く直接経路（bars/レーン設定）も CoW ガードを通す ──
// 落ちサビの常道＝共有セクションのレーンミュート/bars 変更が確認なしに全配置へ効く穴の根治。
// ハーネス＝NetaDialog と同じ結線（useCowGuard を組んで SectionEditor へ渡し、モーダルは CowPrompt）。
describe("SectionEditor × CoW（共有 section の直接保存ガード・Fix C）", () => {
  function CowHarness({ neta, parentId, onForked }: { neta: Neta; parentId: string; onForked?: (n: Neta) => void }) {
    const cow = useCowGuard(neta, { parentId, onForked });
    return (
      <>
        <SectionEditor neta={neta} keyPc={0} tempo={120} meter="4/4" cow={cow} />
        <CowPrompt prompt={cow.cowPrompt} onChoose={cow.resolveCow} />
      </>
    );
  }
  const sharedSection = () => mk("s1", "section", { title: "サビ" });

  beforeEach(() => {
    // この describe は独立＝上の describe の beforeEach は効かない。必要な既定と履歴リセットをここで。
    recommend.mockResolvedValue([]);
    getSong.mockResolvedValue(null);
    updateSong.mockResolvedValue({});
    updateNeta.mockReset();
    updateNeta.mockResolvedValue({});
    placeChild.mockClear();
    placeChild.mockResolvedValue({ ok: true });
    removeChild.mockClear();
    removeChild.mockResolvedValue({ ok: true });
    vary.mockReset();
    getRelations.mockResolvedValue([]);
    getPlacements.mockClear();
    getPlacements.mockResolvedValue({ parents: [{ parentId: "song1", positions: [0] }, { parentId: "song1", positions: [32] }], placementCount: 2 });
    getComposition.mockImplementation(async (id: string) =>
      id === "song1"
        ? { neta: mk("song1", "song"), children: [{ position: 0, ord: 0, node: { neta: sharedSection(), children: [] } }, { position: 32, ord: 0, node: { neta: sharedSection(), children: [] } }] }
        : { neta: sharedSection(), children: [] },
    );
  });

  it("共有 section の bars 変更＝確認が出る・「やめる」＝保存せず値も戻る", async () => {
    render(<CowHarness neta={sharedSection()} parentId="song1" />);
    await screen.findByLabelText("section-bars");
    expect(screen.getByLabelText("bars-count").textContent).toBe("8"); // MIN_BARS 既定
    await userEvent.click(screen.getByLabelText("bars-inc"));
    await userEvent.click(await screen.findByLabelText("cow-cancel"));
    await waitFor(() => expect(screen.getByLabelText("bars-count").textContent).toBe("8")); // 楽観更新を戻す＝無変更
    expect(updateNeta).not.toHaveBeenCalled(); // 原本に書かない
  });

  it("「この曲だけ変える」＝section を vary→親の該当辺差し替え→bars は分家へ・onForked", async () => {
    vary.mockResolvedValueOnce(mk("s1b", "section", { title: "サビ′" }));
    updateNeta.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({ ...mk(id, "section"), ...patch })); // 実APIと同じく更新後ネタを返す
    const onForked = vi.fn();
    render(<CowHarness neta={sharedSection()} parentId="song1" onForked={onForked} />);
    await screen.findByLabelText("section-bars");
    await userEvent.click(screen.getByLabelText("bars-inc")); // 8→9
    await userEvent.click(await screen.findByLabelText("cow-branch"));
    await waitFor(() => expect(vary).toHaveBeenCalledWith("s1")); // section を分家
    expect(removeChild).toHaveBeenCalledWith("song1", "s1", 0); // 親の該当辺（全配置）を
    expect(removeChild).toHaveBeenCalledWith("song1", "s1", 32);
    expect(placeChild).toHaveBeenCalledWith("song1", "s1b", 0, 0); // 分家へ差し替え（position/ord 維持）
    expect(placeChild).toHaveBeenCalledWith("song1", "s1b", 32, 0);
    await waitFor(() => expect(updateNeta).toHaveBeenCalledWith("s1b", expect.objectContaining({ bars: 9 }))); // 編集は分家へ
    expect(updateNeta).not.toHaveBeenCalledWith("s1", expect.anything()); // 原本は無傷
    await waitFor(() => expect(onForked).toHaveBeenCalledWith(expect.objectContaining({ id: "s1b" })));
  });

  it("「全部に効かす」＝従来どおり原本へ保存・以降は再確認しない", async () => {
    render(<CowHarness neta={sharedSection()} parentId="song1" />);
    await screen.findByLabelText("section-bars");
    await userEvent.click(screen.getByLabelText("bars-inc"));
    await userEvent.click(await screen.findByLabelText("cow-all"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalledWith("s1", expect.objectContaining({ bars: 9 })));
    // 2回目の変更＝確認は出ない（決定はセッション内で保持）
    await userEvent.click(screen.getByLabelText("bars-inc"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalledWith("s1", expect.objectContaining({ bars: 10 })));
    expect(screen.queryByLabelText("cow-prompt")).toBeNull();
  });

  it("共有 section のレーンミュート＝確認が出る・「やめる」＝保存せず aria-pressed も戻る", async () => {
    getComposition.mockImplementation(async (id: string) =>
      id === "song1"
        ? { neta: mk("song1", "song"), children: [{ position: 0, ord: 0, node: { neta: sharedSection(), children: [] } }, { position: 32, ord: 0, node: { neta: sharedSection(), children: [] } }] }
        : {
            neta: sharedSection(),
            children: [{ position: 0, ord: 0, node: { neta: mk("b1", "bass", { content: { notes: [{ pitch: 40, start: 0, dur: 1 }] } }), children: [] } }],
          },
    );
    render(<CowHarness neta={sharedSection()} parentId="song1" />);
    await screen.findByLabelText("block-b1@0");
    const mute = screen.getByLabelText("mute-bass");
    await userEvent.click(mute);
    expect(mute).toHaveAttribute("aria-pressed", "true"); // 楽観更新
    await userEvent.click(await screen.findByLabelText("cow-cancel"));
    await waitFor(() => expect(mute).toHaveAttribute("aria-pressed", "false")); // やめる＝戻す
    expect(updateNeta).not.toHaveBeenCalled();
  });

  it("cow 未指定（トップから開いた等）＝ガード無し＝従来どおり即保存（bit-safe）", async () => {
    getComposition.mockResolvedValue({ neta: sharedSection(), children: [] });
    render(<SectionEditor neta={sharedSection()} keyPc={0} tempo={120} meter="4/4" />);
    await screen.findByLabelText("section-bars");
    await userEvent.click(screen.getByLabelText("bars-inc"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalledWith("s1", expect.objectContaining({ bars: 9 })));
    expect(getPlacements).not.toHaveBeenCalledWith("s1"); // section 自身の共有判定はしない（共有バッジの子引きとは別）
  });

  // ── S3-a：compose 辺操作（ブロック削除/配置）も CoW ガード（S2 の既知の残の解消） ──
  const withMelodyChild = () => ({
    neta: sharedSection(),
    children: [{ position: 0, ord: 0, node: { neta: mk("m1", "melody", { title: "メロ" }), children: [] } }],
  });

  it("共有 section のブロック削除＝確認・「やめる」＝外さない", async () => {
    getComposition.mockImplementation(async (id: string) =>
      id === "song1"
        ? { neta: mk("song1", "song"), children: [{ position: 0, ord: 0, node: { neta: sharedSection(), children: [] } }, { position: 32, ord: 0, node: { neta: sharedSection(), children: [] } }] }
        : withMelodyChild(),
    );
    render(<CowHarness neta={sharedSection()} parentId="song1" />);
    await screen.findByLabelText("block-m1@0");
    await userEvent.click(screen.getByLabelText("mode-erase"));
    await userEvent.click(screen.getByLabelText("block-m1@0")); // 消しゴム tap＝辺操作
    await userEvent.click(await screen.findByLabelText("cow-cancel"));
    await new Promise((r) => setTimeout(r, 50));
    expect(removeChild).not.toHaveBeenCalled(); // 原本の辺は無傷
  });

  it("共有 section のブロック削除＝「この曲だけ」＝分家の辺から外す（原本無傷）", async () => {
    getComposition.mockImplementation(async (id: string) =>
      id === "song1"
        ? { neta: mk("song1", "song"), children: [{ position: 0, ord: 0, node: { neta: sharedSection(), children: [] } }, { position: 32, ord: 0, node: { neta: sharedSection(), children: [] } }] }
        : withMelodyChild(),
    );
    vary.mockResolvedValueOnce(mk("s1b", "section", { title: "サビ′" }));
    const onForked = vi.fn();
    render(<CowHarness neta={sharedSection()} parentId="song1" onForked={onForked} />);
    await screen.findByLabelText("block-m1@0");
    await userEvent.click(screen.getByLabelText("mode-erase"));
    await userEvent.click(screen.getByLabelText("block-m1@0"));
    await userEvent.click(await screen.findByLabelText("cow-branch"));
    await waitFor(() => expect(vary).toHaveBeenCalledWith("s1"));
    // 親の該当辺差し替え（position/ord 維持）
    expect(removeChild).toHaveBeenCalledWith("song1", "s1", 0);
    expect(placeChild).toHaveBeenCalledWith("song1", "s1b", 0, 0);
    // 辺操作は**分家に対して**実行（落ちサビ＝分家からドラム/ベースの辺を外すの土台）
    await waitFor(() => expect(removeChild).toHaveBeenCalledWith("s1b", "m1", 0));
    // 原本 s1 の子辺は外していない
    expect(removeChild).not.toHaveBeenCalledWith("s1", "m1", 0);
    await waitFor(() => expect(onForked).toHaveBeenCalled());
  });

  it("共有 section へのピッカー配置＝「この曲だけ」＝分家に置く（原本無傷）", async () => {
    getComposition.mockImplementation(async (id: string) =>
      id === "song1"
        ? { neta: mk("song1", "song"), children: [{ position: 0, ord: 0, node: { neta: sharedSection(), children: [] } }, { position: 32, ord: 0, node: { neta: sharedSection(), children: [] } }] }
        : { neta: sharedSection(), children: [] },
    );
    listNeta.mockResolvedValue([mk("mx", "melody", { title: "既存メロ", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } })]);
    vary.mockResolvedValueOnce(mk("s1b", "section", { title: "サビ′" }));
    render(<CowHarness neta={sharedSection()} parentId="song1" />);
    await screen.findByLabelText("timeline");
    await userEvent.click(screen.getByLabelText("place-melody-0")); // 空セル→ピッカー
    await userEvent.click(await screen.findByLabelText("place-mx"));
    await userEvent.click(await screen.findByLabelText("cow-branch"));
    await waitFor(() => expect(vary).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(placeChild).toHaveBeenCalledWith("s1b", "mx", 0, 0)); // 分家へ配置
    expect(placeChild).not.toHaveBeenCalledWith("s1", "mx", 0, 0); // 原本には置かない
  });

  it("共有 section へのピッカー配置＝「やめる」＝何も作らず置かない", async () => {
    getComposition.mockImplementation(async (id: string) =>
      id === "song1"
        ? { neta: mk("song1", "song"), children: [{ position: 0, ord: 0, node: { neta: sharedSection(), children: [] } }, { position: 32, ord: 0, node: { neta: sharedSection(), children: [] } }] }
        : { neta: sharedSection(), children: [] },
    );
    listNeta.mockResolvedValue([mk("mx", "melody", { title: "既存メロ" })]);
    render(<CowHarness neta={sharedSection()} parentId="song1" />);
    await screen.findByLabelText("timeline");
    await userEvent.click(screen.getByLabelText("place-melody-0"));
    await userEvent.click(await screen.findByLabelText("place-mx"));
    await userEvent.click(await screen.findByLabelText("cow-cancel"));
    await new Promise((r) => setTimeout(r, 50));
    expect(placeChild).not.toHaveBeenCalled();
    expect(vary).not.toHaveBeenCalled();
  });
});

// スライスC：伴奏パターンを「聴いて選ぶ」トレイ（コード楽器タイル＋ジャンルchip＋候補トレイ）。
describe("スライスC：伴奏パターンを聴いて選ぶ（コード楽器トレイ）", () => {
  const withChords = () => ({
    neta: mk("s1", "section"),
    children: [{ position: 0, ord: 0, node: { neta: mk("ch1", "chord_progression", { content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } }), children: [] } }],
  });
  // Task2/L3：候補の出所はライブラリネタ（listNeta）＝トレイの label は neta.title（型ID＋場面）。
  const cpNeta = (id: string, scenes: string) => mk(id, "chord_pattern", {
    title: `${id} ${scenes}`,
    scope: "library",
    content: { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0 }, steps: 16, hits: [{ step: 0, dur: 4 }, { step: 8, dur: 4 }] },
  });
  beforeEach(() => {
    recommend.mockResolvedValue([]);
    getSong.mockResolvedValue(null);
    updateSong.mockResolvedValue({});
    updateNeta.mockReset(); updateNeta.mockResolvedValue({});
    getPlacements.mockResolvedValue({ parents: [], placementCount: 0 });
    getRelations.mockResolvedValue([]);
    music.mockReset();
    listNeta.mockReset();
    createNeta.mockReset(); placeChild.mockReset(); link.mockReset(); link.mockResolvedValue({});
  });

  it("ジャンルchip→候補を出す＝listNeta を genre タグで引き、複数候補が型名/説明つきでトレイに並ぶ", async () => {
    listNeta.mockResolvedValue([cpNeta("PB-WHOLE", "白玉"), cpNeta("PB-ARP8", "8分アルペジオ"), cpNeta("PB-ARP16", "16分うねり")]);
    getComposition.mockResolvedValue(withChords());
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-chordinst")); // コード楽器引き出し（新パーツのタイル）
    await userEvent.click(screen.getByLabelText("comp-genre-ballad")); // バラード chip
    await userEvent.click(screen.getByLabelText("gen-gen_chord_pattern")); // 🎲 候補を出す
    await waitFor(() => expect(listNeta).toHaveBeenCalledWith(expect.objectContaining({ kind: "chord_pattern", scope: "library", tags: ["genre:ballad"] })));
    expect(music).not.toHaveBeenCalled();
    await screen.findByLabelText("candidate-tray");
    expect(screen.getAllByLabelText("candidate-card")).toHaveLength(3); // 別々の型が3件
    expect(screen.getAllByLabelText("candidate-label").map((e) => e.textContent)).toEqual(["PB-WHOLE 白玉", "PB-ARP8 8分アルペジオ", "PB-ARP16 16分うねり"]);
  });

  it("おまかせ（chip未選択）＝genre タグ無しで scope:library を引く（role/tempo 全体から）", async () => {
    listNeta.mockResolvedValue([cpNeta("PB-WHOLE", "白玉")]);
    getComposition.mockResolvedValue(withChords());
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-chordinst"));
    await userEvent.click(screen.getByLabelText("gen-gen_chord_pattern"));
    await waitFor(() => expect(listNeta).toHaveBeenCalled());
    const q = listNeta.mock.calls[0]![0] as { kind: string; scope: string; tags?: string[] };
    expect(q.kind).toBe("chord_pattern");
    expect(q.scope).toBe("library");
    expect(q.tags).toBeUndefined();
  });

  it("候補を採用＝createNeta(chord_pattern)＋placeChild で置く（既存の候補採用フロー）", async () => {
    listNeta.mockResolvedValue([cpNeta("PB-WHOLE", "白玉")]);
    getComposition.mockResolvedValue(withChords());
    createNeta.mockResolvedValue(mk("newcp", "chord_pattern"));
    placeChild.mockResolvedValue({ ok: true });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("drawer-chordinst"));
    await userEvent.click(screen.getByLabelText("gen-gen_chord_pattern"));
    await screen.findByLabelText("candidate-tray");
    await userEvent.click(screen.getByLabelText("place-candidate"));
    await waitFor(() => expect(createNeta).toHaveBeenCalledWith(expect.objectContaining({ kind: "chord_pattern" })));
    expect(placeChild).toHaveBeenCalled();
  });

  it("コード無しセクションではコード楽器タイルは出ない（needsChords・進行が要る）", async () => {
    getComposition.mockResolvedValue({
      neta: mk("s1", "section"),
      children: [{ position: 0, ord: 0, node: { neta: mk("m1", "melody", { content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }), children: [] } }],
    });
    render(<SectionEditor neta={mk("s1", "section")} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-m1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    expect(screen.queryByLabelText("drawer-chordinst")).toBeNull(); // 進行が無い＝タイル非表示
  });
});
