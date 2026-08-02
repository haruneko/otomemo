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
// seed 対象 drum＝4/4 型 ∪ world68（6/8・裁定D 2026-07-25）。それ以外の非4/4（six8.ballad）は除外。
const DRUMS_SEEDED = BEAT_PATTERNS.filter((t) => t.meter === "4/4" || t.genres.includes("world68"));

describe("(a) 3 kind のネタが型数ぶん作られる", () => {
  it("chord=全型・bass=全型・drum=4/4∪world68（six8.ballad 除外・裁定D 2026-07-25）", () => {
    const core = freshCore();
    const r = seedPatternLibrary(core);
    expect(r.chord).toBe(COMP_TYPES.length); // 45（35＋world68 10）
    expect(r.bass).toBe(BASS_TYPES.length); // 42（34＋world68 8）
    expect(r.drum).toBe(DRUMS_SEEDED.length); // 31（4/4 23＋world68 8）
    expect(r.deleted).toBe(0); // 初回は旧 seed 無し

    // scope:"library"＋kind 別の件数が seed 数と一致。
    const lib = { scope: "library" as const, tags: ["lib:factory"], limit: 99999 };
    expect(core.listNeta({ ...lib, kind: "chord_pattern" }).length).toBe(COMP_TYPES.length);
    expect(core.listNeta({ ...lib, kind: "bass" }).length).toBe(BASS_TYPES.length);
    expect(core.listNeta({ ...lib, kind: "rhythm" }).length).toBe(DRUMS_SEEDED.length);
    // six8.ballad（6/8だが world68 でない）は seed されない（pat タグで確認）。
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

  it("drum 型：genre（複数可・co-tag込み）/scene（L4トラックA roles）/tempo/pat", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    const [n] = core.listNeta({ scope: "library", tags: ["pat:beat8.basic"], limit: 10 });
    const tags = n!.tags;
    expect(tags).toContain("lib:factory");
    expect(tags).toContain("genre:jpop"); // genres=["jpop","rock","pop","vocarock"]＝複数 genre タグ
    expect(tags).toContain("genre:rock");
    expect(tags).toContain("genre:vocarock"); // L4トラックA co-tag（seed 専用・生成器不変）
    expect(tags).toContain("tempo:70-140");
    expect(tags).toContain("pat:beat8.basic");
    // L4トラックA（2026-07-25）：BeatPattern.roles → scene タグ（beat8.basic roles=intro/verse）。
    expect(tags).toContain("scene:intro");
    expect(tags).toContain("scene:verse");
    expect(n!.kind).toBe("rhythm");
  });
});

// ── 裁定D：6/8 無国籍民族調（world68）が genre:world68＋meter:6/8 で各パート seed される ──
describe("(w68) world68 が 6/8・genre:world68・scene タグで seed される", () => {
  it("chord/bass/drum 各パート world68 が seed され meter:6/8・genre:world68・scene:", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    const [ch] = core.listNeta({ scope: "library", tags: ["pat:w68-ch-drone5"], limit: 10 });
    expect(ch, "chord world68 seeded").toBeTruthy();
    expect(ch!.kind).toBe("chord_pattern");
    expect(ch!.meter).toBe("6/8");
    expect(ch!.tags).toContain("genre:world68");
    expect(ch!.tags.some((t) => t.startsWith("scene:"))).toBe(true);
    expect((ch!.content as { steps: number }).steps).toBe(12); // 1小節=12

    const [bs] = core.listNeta({ scope: "library", tags: ["pat:w68-bs-anchor"], limit: 10 });
    expect(bs!.kind).toBe("bass");
    expect(bs!.meter).toBe("6/8");
    expect(bs!.tags).toContain("genre:world68");
    expect((bs!.content as { mode: string; steps: number }).mode).toBe("relative");
    expect((bs!.content as { steps: number }).steps).toBe(12);

    const [dr] = core.listNeta({ scope: "library", tags: ["pat:w68-dr-full"], limit: 10 });
    expect(dr!.kind).toBe("rhythm");
    expect(dr!.meter).toBe("6/8");
    expect(dr!.tags).toContain("genre:world68");
    expect(dr!.tags.some((t) => t.startsWith("scene:"))).toBe(true);
    expect((dr!.content as { rhythm: { steps: number } }).rhythm.steps).toBe(12);
  });
  it("genre:world68 の3パートが各≥8件（chord10/bass8/drum8）", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    const cnt = (kind: "chord_pattern" | "bass" | "rhythm") => core.listNeta({ scope: "library", tags: ["genre:world68"], kind, limit: 99999 }).length;
    expect(cnt("chord_pattern")).toBe(10);
    expect(cnt("bass")).toBe(8);
    expect(cnt("rhythm")).toBe(8);
  });
});

// ── アレンジS1（2026-08-02）：オルガン型（2小節テンプレ／followChords／program）が seed ネタへ載る ──
//   content は zod では素通し（schemas.ts content: z.unknown()）＝新キーが DB 往復で欠けないことの確認も兼ねる。
describe("(S1) オルガン型が seed され 2小節テンプレ/followChords が DB 往復で保持される", () => {
  it("OG-PAD2＝bars2・steps32・followChords・program／OG-PAD＝1小節16step（bars 欄は書かない）", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    const [n] = core.listNeta({ scope: "library", tags: ["pat:OG-PAD2"], limit: 10 });
    expect(n, "OG-PAD2 seeded").toBeTruthy();
    expect(n!.kind).toBe("chord_pattern");
    expect(n!.bars).toBe(2); // 2小節型はネタの尺も2小節
    const c = n!.content as { steps: number; followChords?: true; program?: number; hits: { step: number; dur: number }[]; patternId?: string };
    expect(c.steps).toBe(32);
    expect(c.followChords).toBe(true); // contract③ フラグが往復で残る
    expect(c.program).toBe(16); // GM 0-based 16=Drawbar Organ
    expect(c.patternId).toBe("OG-PAD2");
    expect(Math.max(...c.hits.map((h) => h.step + h.dur))).toBe(32); // 2小節ぶん敷かれている

    const [p] = core.listNeta({ scope: "library", tags: ["pat:OG-PAD"], limit: 10 });
    expect((p!.content as { steps: number }).steps).toBe(16);
    expect(p!.bars).toBeNull(); // 1小節型は従来どおり bars を書かない（既存 seed と同形）
    expect(p!.tags).toContain("genre:rock");
    expect(p!.tags.some((t) => t.startsWith("scene:"))).toBe(true);
  });
  it("オルガン5型が全て seed される（pat: タグで解決）", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    for (const id of ["OG-PAD", "OG-PAD2", "OG-STAB", "OG-SOUL", "OG-PUNCH"]) {
      expect(core.listNeta({ scope: "library", tags: [`pat:${id}`], limit: 10 }).length, id).toBe(1);
    }
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
