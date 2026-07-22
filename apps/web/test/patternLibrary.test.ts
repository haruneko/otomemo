import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Neta } from "../src/api";

// Task2/L3（design「### Task2/L3＝ピッカーをライブラリ検索へ差し替え」）：候補の出所＝生成器→ネタ帳ライブラリ。
// helper（source＝listNeta と neta→PatternCand の写し）を単体検証：
//  (a) kind/scope/tags クエリが正しい・(b) neta.content が PatternCand.apply/audition に載る・(c) 候補0で空配列（エラー無し）。
const api = vi.hoisted(() => ({ listNeta: vi.fn() }));
vi.mock("../src/api", () => ({ api }));

import { fetchLibraryPatternNetas, netaToPatternCand, sceneTagOf } from "../src/components/patternLibrary";

const mkNeta = (over: Partial<Neta> = {}): Neta => ({
  id: "n1",
  kind: "chord_pattern",
  title: "GT-FOLK8 弾き語り",
  text: null,
  content: { mode: "strum", steps: 16, hits: [{ step: 0, dur: 4 }], patternId: "GT-FOLK8" },
  key: 0,
  mode: null,
  tempo: null,
  meter: null,
  bars: null,
  mood: null,
  scope: "library",
  tags: ["lib:factory", "genre:folk", "scene:verse"],
  created: "",
  updated: "",
  ...over,
});

describe("fetchLibraryPatternNetas（L3 source＝scope:library をタグで引く）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("(a) genre 指定＝{kind, scope:'library', tags:['genre:<g>']} で引く（最大4件）", async () => {
    api.listNeta.mockResolvedValue([mkNeta()]);
    await fetchLibraryPatternNetas("chord_pattern", "rock");
    expect(api.listNeta).toHaveBeenCalledWith({ kind: "chord_pattern", scope: "library", tags: ["genre:rock"], limit: 4 });
  });

  it("(a) おまかせ（genre 空）＝genre タグ無しで scope:library 全体から引く", async () => {
    api.listNeta.mockResolvedValue([]);
    await fetchLibraryPatternNetas("rhythm", "");
    const arg = api.listNeta.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.kind).toBe("rhythm");
    expect(arg.scope).toBe("library");
    expect(arg).not.toHaveProperty("tags"); // おまかせ＝genre タグを付けない
  });

  it("(c) 候補0（seed 未投入）＝空配列（エラーにしない）", async () => {
    api.listNeta.mockResolvedValue([]);
    expect(await fetchLibraryPatternNetas("bass", "funk")).toEqual([]);
  });

  it("genre 指定は先頭4件に丸める（返りが多くても）", async () => {
    api.listNeta.mockResolvedValue(Array.from({ length: 7 }, (_, i) => mkNeta({ id: `n${i}` })));
    const out = await fetchLibraryPatternNetas("chord_pattern", "folk");
    expect(out).toHaveLength(4);
  });
});

describe("netaToPatternCand（neta→PatternCand・content を試聴/適用へそのまま載せる）", () => {
  it("(b) apply/audition が neta.content をそのまま受け取る＋name/key/scene の写し", () => {
    const audition = vi.fn();
    const apply = vi.fn();
    const neta = mkNeta();
    const cand = netaToPatternCand(neta, { audition, apply, scene: true, fallbackName: "コード楽器" });

    expect(cand.key).toBe("n1"); // ネタ id＝一意キー
    expect(cand.name).toBe("GT-FOLK8 弾き語り"); // title＝型名
    expect(cand.scene).toBe("verse"); // scene: タグを剥がす

    cand.audition();
    cand.apply();
    expect(audition).toHaveBeenCalledWith(neta.content); // ライブラリ原本の content をそのまま
    expect(apply).toHaveBeenCalledWith(neta.content);
  });

  it("scene:false＝場面を出さない（ドラム/ベースは scene 無し）", () => {
    const cand = netaToPatternCand(mkNeta({ kind: "rhythm", tags: ["genre:rock"] }), { audition: vi.fn(), apply: vi.fn(), fallbackName: "おまかせ" });
    expect(cand.scene).toBeUndefined();
  });

  it("title 欠落時は content.patternId → fallbackName の順で名前を埋める", () => {
    const noTitle = netaToPatternCand(mkNeta({ title: null }), { audition: vi.fn(), apply: vi.fn(), fallbackName: "コード楽器" });
    expect(noTitle.name).toBe("GT-FOLK8"); // content.patternId
    const noId = netaToPatternCand(mkNeta({ title: null, content: { steps: 16 } }), { audition: vi.fn(), apply: vi.fn(), fallbackName: "コード楽器" });
    expect(noId.name).toBe("コード楽器"); // fallback
  });
});

describe("sceneTagOf", () => {
  it("scene: タグを1つ剥がす・無ければ undefined", () => {
    expect(sceneTagOf(mkNeta())).toBe("verse");
    expect(sceneTagOf(mkNeta({ tags: ["genre:rock"] }))).toBeUndefined();
  });
});
