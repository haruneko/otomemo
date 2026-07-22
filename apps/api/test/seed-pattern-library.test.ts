// 辞書→ライブラリネタのシードパイプライン（Task2/L2・2026-07-23・design「### Task2/L2＝…シードパイプライン」）。契約：
//  (a) 3 kind（chord_pattern/bass/rhythm）のネタが型数ぶん作られる（4/4のみ・6/8 drum は除外）
//  (b) タグが L1 SSOT どおり付く（lib:factory/genre:/scene:/tempo:/pat:）
//  (c) 冪等＝2回実行で件数が変わらない（scope:"library"＋lib:factory を消して再投入）
//  (d) content が期待 kind（chord=voicing.top=72＝L0 反映／bass=mode:"relative"／drum=rhythm）
//  (e) project scope のネタには一切触らない（既存ネタ不可侵）
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { seedPatternLibrary } from "../scripts/seed-pattern-library";
import { COMP_TYPES } from "../src/music/chordLibrary";
import { BASS_TYPES } from "../src/music/bassLibrary";
import { BEAT_PATTERNS } from "../src/music/drumLibrary";

const freshCore = (): Core => new Core(openDb(":memory:"));
const DRUMS_44 = BEAT_PATTERNS.filter((t) => t.meter === "4/4"); // 6/8（six8.ballad）は除外

describe("(a) 3 kind のネタが型数ぶん作られる", () => {
  it("chord=26型・bass=33型・drum=4/4型のみ（six8.ballad 除外）", () => {
    const core = freshCore();
    const r = seedPatternLibrary(core);
    expect(r.chord).toBe(COMP_TYPES.length); // 26
    expect(r.bass).toBe(BASS_TYPES.length); // 33
    expect(r.drum).toBe(DRUMS_44.length); // 17（18-1）
    expect(r.deleted).toBe(0); // 初回は旧 seed 無し

    // scope:"library"＋kind 別の件数が seed 数と一致。
    const lib = { scope: "library" as const, tags: ["lib:factory"], limit: 99999 };
    expect(core.listNeta({ ...lib, kind: "chord_pattern" }).length).toBe(COMP_TYPES.length);
    expect(core.listNeta({ ...lib, kind: "bass" }).length).toBe(BASS_TYPES.length);
    expect(core.listNeta({ ...lib, kind: "rhythm" }).length).toBe(DRUMS_44.length);
    // 6/8 型は seed されない（pat タグで確認）。
    expect(core.listNeta({ scope: "library", tags: ["pat:six8.ballad"], limit: 10 }).length).toBe(0);
  });

  it("既定一覧（scope=project）には1件も出ない＝汚染対策", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    expect(core.listNeta({ limit: 99999 }).length).toBe(0); // 既定 scope=project は空
  });
});

describe("(b) タグが L1 SSOT どおり付く", () => {
  it("chord 型：lib:factory/genre:/scene:/tempo:/pat: が1件で揃う", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    // PB-WHOLE（ballad・roles intro/verse・tempo 60-85）。
    const [n] = core.listNeta({ scope: "library", tags: ["pat:PB-WHOLE"], limit: 10 });
    expect(n).toBeTruthy();
    const tags = new Set(n!.tags);
    expect(tags.has("lib:factory")).toBe(true);
    expect(tags.has("genre:ballad")).toBe(true);
    expect(tags.has("scene:intro")).toBe(true);
    expect(tags.has("scene:verse")).toBe(true);
    expect(tags.has("tempo:60-85")).toBe(true);
    expect(tags.has("pat:PB-WHOLE")).toBe(true);
    expect(n!.kind).toBe("chord_pattern");
    expect(n!.scope).toBe("library");
  });

  it("bass 型：genre/scene/tempo/pat（RK-8ROOT）", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    const [n] = core.listNeta({ scope: "library", tags: ["pat:RK-8ROOT"], limit: 10 });
    const tags = new Set(n!.tags);
    expect(tags.has("lib:factory")).toBe(true);
    expect(tags.has("genre:rock")).toBe(true);
    expect(tags.has("scene:verse")).toBe(true); // RK-8ROOT roles に verse
    expect(tags.has("tempo:120-170")).toBe(true);
    expect(n!.kind).toBe("bass");
  });

  it("drum 型：genre（複数可）/tempo/pat・scene は付かない（型に roles 無し）", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    const [n] = core.listNeta({ scope: "library", tags: ["pat:beat8.basic"], limit: 10 });
    const tags = n!.tags;
    expect(tags).toContain("lib:factory");
    expect(tags).toContain("genre:jpop"); // genres=["jpop","rock","pop"]＝複数 genre タグ
    expect(tags).toContain("genre:rock");
    expect(tags).toContain("tempo:70-140");
    expect(tags).toContain("pat:beat8.basic");
    expect(tags.some((t) => t.startsWith("scene:"))).toBe(false); // drum は scene 無し
    expect(n!.kind).toBe("rhythm");
  });
});

describe("(c) 冪等＝2回実行で件数が変わらない", () => {
  it("再 seed で総数不変・旧 seed を削除して再投入", () => {
    const core = freshCore();
    const r1 = seedPatternLibrary(core);
    const total1 = core.listNeta({ scope: "library", tags: ["lib:factory"], limit: 99999 }).length;
    const r2 = seedPatternLibrary(core);
    const total2 = core.listNeta({ scope: "library", tags: ["lib:factory"], limit: 99999 }).length;
    expect(total1).toBe(r1.chord + r1.bass + r1.drum);
    expect(total2).toBe(total1); // 件数不変
    expect(r2.deleted).toBe(total1); // 2回目は旧 seed を全削除してから再投入
    expect(r2.chord).toBe(r1.chord);
    expect(r2.bass).toBe(r1.bass);
    expect(r2.drum).toBe(r1.drum);
  });
});

describe("(d) content が期待 kind", () => {
  it("chord（keyboard 型）は voicing.top=72＋patternId（L0 反映）", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    const [n] = core.listNeta({ scope: "library", tags: ["pat:PB-WHOLE"], limit: 10 });
    const c = n!.content as { voicing: { top?: number }; patternId?: string; hits: unknown[] };
    expect(c.voicing.top).toBe(72); // L0＝keyboard 型に top を積む
    expect(c.patternId).toBe("PB-WHOLE");
    expect(Array.isArray(c.hits)).toBe(true);
  });

  it("bass は mode:'relative'＋pattern（度数×step）", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    const [n] = core.listNeta({ scope: "library", tags: ["pat:RK-8ROOT"], limit: 10 });
    const c = n!.content as { mode?: string; pattern?: { degree: string }[]; patternId?: string };
    expect(c.mode).toBe("relative");
    expect(c.patternId).toBe("RK-8ROOT");
    expect(Array.isArray(c.pattern)).toBe(true);
    expect(c.pattern!.length).toBeGreaterThan(0);
  });

  it("drum は rhythm（lanes/steps）＋patternId", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    const [n] = core.listNeta({ scope: "library", tags: ["pat:beat8.basic"], limit: 10 });
    const c = n!.content as { rhythm?: { steps: number; lanes: unknown[]; patternId?: string } };
    expect(c.rhythm).toBeTruthy();
    expect(c.rhythm!.steps).toBeGreaterThan(0);
    expect(Array.isArray(c.rhythm!.lanes)).toBe(true);
    expect(c.rhythm!.patternId).toBe("beat8.basic");
  });
});

describe("(e) project scope の既存ネタには触らない", () => {
  it("project ネタは seed 前後で不変（冪等削除も lib:factory に限定）", () => {
    const core = freshCore();
    // 手作業ネタ（project）を1つ置く（scope 既定 project）。
    const mine = core.createNeta({ kind: "melody", title: "私のメロ", content: { notes: [] } });
    seedPatternLibrary(core);
    seedPatternLibrary(core); // 冪等削除を挟んでも
    const still = core.listNeta({ limit: 99999 }); // project 一覧
    expect(still.length).toBe(1);
    expect(still[0]!.id).toBe(mine.id);
  });
});
