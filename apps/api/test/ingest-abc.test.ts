import { describe, it, expect } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { ingestAbc, splitAbcTunes } from "../src/ingest-abc";

// S6-b コーパス取り込み：ABCコレクション → library の melody netas（Cへ正規化・style タグ）。
// 取り込み後 similarMelodies で引ける＝眠っていた連想 retrieval が実データで動く土台。

describe("ingestAbc（ABCコレクション→library melody）", () => {
  const COLL = [
    "X:1", "T:Tune A", "M:4/4", "L:1/8", "K:D", "DEFG ABcd|", "",
    "X:2", "T:Tune B", "M:6/8", "L:1/8", "K:G", "GAB cBA|",
  ].join("\n");

  it("X: 区切りで複数曲に分割", () => {
    expect(splitAbcTunes(COLL).length).toBe(2);
  });

  it("各曲を library melody として投入・style タグ付き・Cへ正規化", () => {
    const core = new Core(openDb(":memory:"));
    const r = ingestAbc(core, COLL, "irish");
    expect(r.created).toBe(2);
    const lib = core.listNeta({ kind: "melody", scope: "library" });
    expect(lib.length).toBe(2);
    expect(lib.every((n) => (n.tags ?? []).includes("irish"))).toBe(true);
    // Tune A は K:D（主音pc=2）→ 全音下げて正規化。先頭 D4(62)-2=60。
    const a = lib.find((n) => n.title === "Tune A")!;
    const notesA = (a.content as { notes: { pitch: number }[] }).notes;
    expect(notesA[0]!.pitch).toBe(60);
    expect(notesA.length).toBe(8);
  });

  it("投入後 similarMelodies で引ける", () => {
    const core = new Core(openDb(":memory:"));
    ingestAbc(core, COLL, "irish");
    // Tune A 自身に近い旋律を投げれば自分が高スコアで返る
    const a = core.listNeta({ kind: "melody", scope: "library" }).find((n) => n.title === "Tune A")!;
    const notesA = (a.content as { notes: { pitch: number; start?: number; dur?: number }[] }).notes;
    const hits = core.similarMelodies(notesA, "library", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.similarity).toBeGreaterThan(0.5);
  });

  it("音の無い曲（ヘッダのみ）はスキップ", () => {
    const core = new Core(openDb(":memory:"));
    const r = ingestAbc(core, "X:1\nT:Empty\nK:G", "irish");
    expect(r.created).toBe(0);
  });
});
