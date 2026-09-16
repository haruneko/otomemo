import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, renderHook, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

// Task #5 入口一本化（正準＝docs/design.md「アレンジS1＝写像規則の契約」節末尾の裁定＋「実装の細部（2026-09-16）」）：
//  (1) contextAuditionPlan＝仮想子の**追加**モード（空きセルに候補を置いた状態のセクション全体をループ）。
//  (2) usePlacePicker＝パターン系レーン（chord_pattern/bass/rhythm）はライブラリの型も引く。
//      ▶＝文脈（auditionSection）があれば tree＋loop、無ければ従来ワンショット。▶⇄■。
//  (3) PlacePicker＝「ライブラリの型」群・検索はネタ名に当たる・試聴中の明示。

const api = vi.hoisted(() => ({ listNeta: vi.fn(), recommend: vi.fn(), copyNeta: vi.fn(), placeChild: vi.fn() }));
vi.mock("../src/api", () => ({ api }));
vi.mock("../src/components/MiniRoll", () => ({ MiniRoll: () => <div data-testid="mini-roll" /> }));

const stop = vi.hoisted(() => vi.fn());
const startPlayback = vi.hoisted(() => vi.fn(async (_plan: unknown, _opts?: unknown) => ({ stop })));
vi.mock("../src/playback", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, startPlayback };
});
vi.mock("../src/music", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, buildPlayback: vi.fn(actual.buildPlayback as (...a: unknown[]) => unknown) };
});

import { buildPlayback, type PlaybackSource } from "../src/music";
import { contextAuditionPlan, type ContextAuditionCtx } from "../src/contextAudition";
import { usePlacePicker, type PlacePickerCtx } from "../src/usePlacePicker";
import { PlacePicker } from "../src/components/PlacePicker";
import type { Lane } from "../src/components/sectionLanes";

const bp = buildPlayback as unknown as ReturnType<typeof vi.fn>;
const lastSource = (): PlaybackSource => bp.mock.calls[bp.mock.calls.length - 1]![0] as PlaybackSource;

const mkNeta = (over: Partial<Neta> = {}): Neta => ({
  id: "n1", kind: "chord_pattern", title: "KB-PAD", text: null,
  content: null, key: null, mode: null, tempo: null, meter: null,
  bars: null, mood: null, scope: "project", tags: [], created: "", updated: "", ...over,
});

const CAND_CONTENT = { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 }, steps: 16, hits: [{ step: 4, dur: 4 }], patternId: "OG-STAB" };
const cand = mkNeta({ id: "cand1", title: "OG-STAB オルガン裏拍", scope: "library", content: CAND_CONTENT, meter: "4/4" });
const MELODY_CONTENT = { notes: [{ pitch: 72, start: 0, dur: 1 }] };
const CHORDS_CONTENT = { chords: [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 5, quality: "", start: 4, dur: 4 }] };

const section = (over: Partial<Neta> = {}): Neta =>
  mkNeta({ id: "sec1", kind: "section", title: "Aメロ", content: {}, key: 0, mode: "major", tempo: 100, meter: "4/4", ...over });
const child = (neta: Neta, position = 0, ord = 0) => ({ position, ord, node: { neta, children: [] } });
const ctx = (over: Partial<ContextAuditionCtx> = {}): ContextAuditionCtx => ({
  section: section(),
  children: [
    child(mkNeta({ id: "ch", kind: "chord_progression", content: CHORDS_CONTENT })),
    child(mkNeta({ id: "mel", kind: "melody", content: MELODY_CONTENT })),
  ],
  ...over,
});
const idOf = (c: { node: { neta: unknown } }) => (c.node.neta as { id?: string }).id;

describe("(1) contextAuditionPlan＝空きセルに候補を仮想子として追加", () => {
  beforeEach(() => vi.clearAllMocks());

  it("既存の子はそのまま＋候補がレーン行(ord)・位置で1つ足される（tree）", () => {
    const got = contextAuditionPlan(ctx(), { neta: cand, position: 4, ord: 1 });
    expect(got).not.toBeNull();
    const src = lastSource() as Extract<PlaybackSource, { kind: "tree" }>;
    expect(src.kind).toBe("tree");
    expect(src.children.map(idOf)).toEqual(["ch", "mel", "cand1"]);
    const v = src.children[2]!;
    expect(v.position).toBe(4);
    expect((v as { ord?: number }).ord).toBe(1);
    expect(v.node.neta.content).toBe(CAND_CONTENT);
    expect(src.tempo).toBe(100);
    expect(src.meter).toBe("4/4");
  });

  it("loop＝0拍〜セクション総拍（既定8小節＝32拍・bars=12 なら48拍）", () => {
    expect(contextAuditionPlan(ctx(), { neta: cand, position: 0, ord: 0 })!.loop).toEqual({ startBeat: 0, endBeat: 32 });
    expect(contextAuditionPlan(ctx({ section: section({ bars: 12 }) }), { neta: cand, position: 0, ord: 0 })!.loop.endBeat).toBe(48);
  });

  it("レーンミュートは尊重（melody ミュートで外れる）／候補はミュート中のレーンでも必ず鳴る", () => {
    const muted = ctx({ section: section({ content: { lanes_muted: ["melody", "chord_pattern"] } }) });
    contextAuditionPlan(muted, { neta: cand, position: 0, ord: 0 });
    const ids = (lastSource() as Extract<PlaybackSource, { kind: "tree" }>).children.map(idOf);
    expect(ids).not.toContain("mel");
    expect(ids).toContain("cand1");
  });

  it("子が空のセクションでも候補だけでループ試聴になる", () => {
    const got = contextAuditionPlan(ctx({ children: [] }), { neta: cand, position: 0, ord: 0 });
    expect(got).not.toBeNull();
    expect((lastSource() as Extract<PlaybackSource, { kind: "tree" }>).children.map(idOf)).toEqual(["cand1"]);
  });
});

const CP_LANE: Lane = { key: "chord_pattern2", label: "コード楽器2", kinds: ["chord_pattern"], row: 1 } as Lane;
const MEL_LANE: Lane = { key: "melody", label: "メロ", kinds: ["melody"] } as Lane;

const hookCtx = (over: Partial<PlacePickerCtx> = {}): PlacePickerCtx => ({
  neta: section(),
  keyPc: 0,
  tempo: 100,
  liveMeter: "4/4",
  occupiedAt: () => false,
  overlapsOtherInLane: () => false,
  contentDur: () => 4,
  sectionProjects: [],
  progForKind: () => undefined,
  reload: async () => {},
  ...over,
});

describe("(2) usePlacePicker＝ライブラリの型を引く・▶は文脈試聴", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.recommend.mockResolvedValue([]);
    api.listNeta.mockImplementation(async (q: { scope?: string }) => (q.scope === "library" ? [cand] : []));
  });

  it("パターン系レーン＝同 kind の scope:library を引いて pickerLib に持つ", async () => {
    const { result } = renderHook(() => usePlacePicker(hookCtx()));
    await act(async () => { await result.current.openPicker(CP_LANE, 8); });
    expect(api.listNeta).toHaveBeenCalledWith(expect.objectContaining({ kind: "chord_pattern", scope: "library" }));
    expect(result.current.pickerLib.map((n) => n.id)).toEqual(["cand1"]);
  });

  it("メロのレーン＝ライブラリの型は引かない（おすすめ経路のまま）", async () => {
    const { result } = renderHook(() => usePlacePicker(hookCtx()));
    await act(async () => { await result.current.openPicker(MEL_LANE, 0); });
    expect(api.listNeta).not.toHaveBeenCalledWith(expect.objectContaining({ scope: "library" }));
    expect(result.current.pickerLib).toEqual([]);
  });

  it("文脈あり＝▶で tree（そのセルに置いた状態）＋loop・もう一度押すと停止（▶⇄■）", async () => {
    const c = ctx();
    const { result } = renderHook(() => usePlacePicker(hookCtx({ auditionSection: () => c })));
    await act(async () => { await result.current.openPicker(CP_LANE, 8); });
    await act(async () => { await result.current.previewNeta(cand); });
    const src = lastSource() as Extract<PlaybackSource, { kind: "tree" }>;
    expect(src.kind).toBe("tree");
    const v = src.children.find((x) => idOf(x) === "cand1")!;
    expect([v.position, (v as { ord?: number }).ord]).toEqual([8, 1]);
    expect(startPlayback.mock.calls[0]![1]).toEqual({ vocalMode: "peek", loop: { startBeat: 0, endBeat: 32 } });
    expect(result.current.previewing).toEqual({ id: "cand1", inContext: true });
    await act(async () => { await result.current.previewNeta(cand); });
    expect(stop).toHaveBeenCalled();
    expect(result.current.previewing).toBeNull();
    expect(startPlayback).toHaveBeenCalledTimes(1);
  });

  it("文脈なし（FormStrip 等）＝従来のワンショット（kind:'neta'・loop 無し）", async () => {
    const { result } = renderHook(() => usePlacePicker(hookCtx()));
    await act(async () => { await result.current.openPicker(CP_LANE, 0); });
    await act(async () => { await result.current.previewNeta(cand); });
    expect(lastSource().kind).toBe("neta");
    expect(startPlayback.mock.calls[0]![1]).toEqual({ vocalMode: "peek" });
    expect(result.current.previewing).toEqual({ id: "cand1", inContext: false });
  });
});

describe("(3) PlacePicker＝ライブラリの型の群・名前検索・試聴中の明示", () => {
  const base = (over: Partial<Parameters<typeof PlacePicker>[0]> = {}) => ({
    picker: { lane: CP_LANE, position: 0, all: [mkNeta({ id: "mine", title: "自作パッド", meter: "4/4" })] },
    neta: section(),
    liveTitle: "Aメロ",
    BPB: 4,
    keyPc: 0,
    pq: "",
    setPq: vi.fn(),
    pickerSource: "",
    setPickerSource: vi.fn(),
    pickerOtherMeter: false,
    setPickerOtherMeter: vi.fn(),
    pickerRecs: [],
    pickerLib: [cand, mkNeta({ id: "lib2", title: "KB-PAD 白玉", scope: "library", meter: "4/4" })],
    previewing: null,
    placeAt: vi.fn(),
    previewNeta: vi.fn(),
    createInLane: vi.fn(),
    onClose: vi.fn(),
    ...over,
  });

  it("自作の下に「ライブラリの型」群が並び、タップで placeAt（置く経路は共通）", async () => {
    const p = base();
    render(<PlacePicker {...p} />);
    expect(screen.getByLabelText("place-mine")).toBeTruthy();
    expect(screen.getByLabelText("picker-lib")).toBeTruthy();
    await userEvent.click(screen.getByLabelText("place-cand1"));
    expect(p.placeAt).toHaveBeenCalledWith(cand);
  });

  it("検索はネタ名に当たる（「オルガン」で OG だけ残る）", () => {
    render(<PlacePicker {...base({ pq: "オルガン" })} />);
    expect(screen.getByLabelText("place-cand1")).toBeTruthy();
    expect(screen.queryByLabelText("place-lib2")).toBeNull();
  });

  it("試聴中＝その行は■・「主旋律と一緒に試聴中」を出す", () => {
    render(<PlacePicker {...base({ previewing: { id: "cand1", inContext: true } })} />);
    expect(screen.getByLabelText("preview-cand1").textContent).toBe("■");
    expect(screen.getByLabelText("preview-lib2").textContent).toBe("▶");
    expect(screen.getByLabelText("picker-audition-status").textContent).toContain("主旋律と一緒に試聴中");
  });
});
