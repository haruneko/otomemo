// L4 トラックA＝新21型（chord9/bass6/drum6）＋co-tag＋roles の辞書化・seed タグ検証（2026-07-25）。
// 正典＝docs/research/2026-07-25-L4-trackA-definitions.md／同 authoring-plan.md／design「Task2/L1＞共通分類の横串統一」。
// 契約：
//  (1) 型数＝chord35・bass34・drum24（seed 対象 drum=23＝six8.ballad 除外）／新21型が *ById で全解決
//  (2) BL-ARPUP＝フォールバック譜（R-5-8）でオンセットが厳密上行（末尾10度=descending の"3"を落とす・監査#1）
//  (3) seed 後：3ジャンル×verse/chorus×3パートの18セルが各≥4件／genre:vocarock chord=6／drum に scene:／co-tag は genre 2個
//  (4) 不変ガード：GENRE_TABLE 経路（pickCompType/pickBassType/pickBeatPattern）は既存型で従来と同一ID＝出音据え置き
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { seedPatternLibrary } from "../scripts/seed-pattern-library";
import { genBass } from "../src/music/generate";
import { COMP_TYPES, compTypeById, pickCompType } from "../src/music/chordLibrary";
import { BASS_TYPES, bassTypeById, pickBassType } from "../src/music/bassLibrary";
import { BEAT_PATTERNS, beatPatternById, pickBeatPattern } from "../src/music/drumLibrary";

const freshCore = (): Core => new Core(openDb(":memory:"));
const notesOf = (r: ReturnType<typeof genBass>) => (r.items[0]!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;

// 新21型のID（研究doc §A/B/C）。
const NEW_CHORD = ["PB-WHOLE-R10", "PB-LH8OCT", "PB-BLOCK8", "PB-SUSBLD", "GT-MUTE8", "AN-SYNC", "DN-PLUCK8", "DN-GATE16", "DN-PAD4"];
const NEW_BASS = ["BL-2BEAT", "BL-ARPUP", "BL-8ROOT", "VR-OCTRUN", "VR-LINE8", "ED-GATE8"];
const NEW_DRUM = ["ballad.rim8", "ballad.soft16", "halftime.ballad", "beat8.ride", "four.edm16", "four.clapride"];

describe("(1) 型数＋新21型の解決", () => {
  it("chord50・bass42・drum32（4/4 drum=23・裁定D で world68 追加後＋アレンジS1 オルガン5）", () => {
    expect(COMP_TYPES.length).toBe(50); // 35＋world68 10＋オルガン5（アレンジS1・2026-08-02）
    expect(BASS_TYPES.length).toBe(42); // 34＋world68 8
    expect(BEAT_PATTERNS.length).toBe(32); // 24＋world68 8
    expect(BEAT_PATTERNS.filter((p) => p.meter === "4/4").length).toBe(23); // six8.ballad+world68(6/8)を除く
  });
  it("新21型が compTypeById/bassTypeById/beatPatternById で全解決・ID 一意", () => {
    for (const id of NEW_CHORD) expect(compTypeById(id), id).toBeTruthy();
    for (const id of NEW_BASS) expect(bassTypeById(id), id).toBeTruthy();
    for (const id of NEW_DRUM) expect(beatPatternById(id), id).toBeTruthy();
    const allIds = [...COMP_TYPES.map((t) => t.id), ...BASS_TYPES.map((t) => t.id), ...BEAT_PATTERNS.map((p) => p.id)];
    // 各辞書内で ID 一意（3辞書横断は名前空間が別＝重複してよい）。
    for (const arr of [COMP_TYPES.map((t) => t.id), BASS_TYPES.map((t) => t.id), BEAT_PATTERNS.map((p) => p.id)]) {
      expect(new Set(arr).size).toBe(arr.length);
    }
    expect(allIds.length).toBe(50 + 42 + 32);
  });
  it("新chord9型に coGenres 欄（co-tag 型のみ）／新bass/drum roles が付く", () => {
    // co-tag を持つ新型：GT-MUTE8/AN-SYNC=vocarock, DN-*=edm。PB-* は coGenres 無し。
    expect(compTypeById("GT-MUTE8")!.coGenres).toEqual(["vocarock"]);
    expect(compTypeById("AN-SYNC")!.coGenres).toEqual(["vocarock"]);
    for (const id of ["DN-PLUCK8", "DN-GATE16", "DN-PAD4"]) expect(compTypeById(id)!.coGenres, id).toEqual(["edm"]);
    for (const id of ["PB-WHOLE-R10", "PB-LH8OCT", "PB-BLOCK8", "PB-SUSBLD"]) expect(compTypeById(id)!.coGenres, id).toBeUndefined();
    for (const id of NEW_DRUM) expect((beatPatternById(id)!.roles ?? []).length, id).toBeGreaterThan(0);
  });
});

describe("(2) BL-ARPUP＝フォールバック譜でオンセット厳密上行（監査#1）", () => {
  it("譜は R-5-8＋末尾休符（descending の末尾10度=3 を落とす）", () => {
    expect(bassTypeById("BL-ARPUP")!.pattern).toBe("R - - - | 5 - - - | 8 - - - | - - - -");
  });
  it("key0・I(C) で realize したオンセット列が厳密上行（36<43<48）", () => {
    // style 型経路＝realizeBassGrid（web resolveRelativeBass と同規則・度数はルートから上へ積む）。
    const C1 = [{ root: 0, quality: "", start: 0, dur: 64 }];
    const out = notesOf(genBass({ bars: 1, meter: "4/4" }, C1, 1, undefined, { style: "BL-ARPUP" }));
    const pitches = out.map((n) => n.pitch);
    expect(pitches).toEqual([36, 43, 48]); // R=36, 5=43, 8=48（"3"譜なら末尾40へ落ちて上行が崩れる）
    for (let i = 1; i < pitches.length; i++) expect(pitches[i]!, `onset ${i}`).toBeGreaterThan(pitches[i - 1]!);
  });
});

describe("(3) seed タグ：18セル≥4件・vocarock chord=6・drum scene・co-tag genre2", () => {
  const GENRES = ["ballad", "vocarock", "edm"];
  const KINDS = [
    { kind: "chord_pattern" as const },
    { kind: "bass" as const },
    { kind: "rhythm" as const },
  ];
  const cell = (core: Core, genre: string, role: string, kind: "chord_pattern" | "bass" | "rhythm") =>
    core.listNeta({ scope: "library", tags: [`genre:${genre}`, `scene:${role}`], kind, limit: 99999 }).length;

  it("3ジャンル×verse/chorus×3パート＝18セルが各≥4件", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    const short: string[] = [];
    for (const g of GENRES) for (const r of ["verse", "chorus"]) for (const { kind } of KINDS) {
      const n = cell(core, g, r, kind);
      if (n < 4) short.push(`${g}/${r}/${kind}=${n}`);
    }
    expect(short, `未達セル: ${short.join(", ")}`).toEqual([]);
  });

  it("genre:vocarock の chord は 6件（AN-VERSE/AN-CHORUS/GT-DOWN8/GT-POWER16 co-tag＋GT-MUTE8/AN-SYNC）", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    const rows = core.listNeta({ scope: "library", tags: ["genre:vocarock"], kind: "chord_pattern", limit: 99999 });
    expect(rows.length).toBe(6);
    const pats = new Set(rows.flatMap((n) => n.tags.filter((t) => t.startsWith("pat:")).map((t) => t.slice(4))));
    for (const id of ["AN-VERSE", "AN-CHORUS", "GT-DOWN8", "GT-POWER16", "GT-MUTE8", "AN-SYNC"]) expect(pats.has(id), id).toBe(true);
  });

  it("co-tag 型は genre タグが2個（例：GT-BALLAD=folk+ballad・DN-OFFBEAT=dance+edm）", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    for (const [pat, gs] of [["GT-BALLAD", ["genre:folk", "genre:ballad"]], ["DN-OFFBEAT", ["genre:dance", "genre:edm"]], ["AN-VERSE", ["genre:anison", "genre:vocarock"]]] as const) {
      const [n] = core.listNeta({ scope: "library", tags: [`pat:${pat}`], limit: 10 });
      const genreTags = n!.tags.filter((t) => t.startsWith("genre:"));
      expect(genreTags.length, pat).toBe(2);
      for (const g of gs) expect(genreTags, pat).toContain(g);
    }
  });

  it("drum ネタに scene: タグ（新6型・既存型とも）／ED-PULSE に scene:verse", () => {
    const core = freshCore();
    seedPatternLibrary(core);
    // 新drum＝ballad.rim8 は scene:verse/chorus。
    const [rim] = core.listNeta({ scope: "library", tags: ["pat:ballad.rim8"], limit: 10 });
    expect(rim!.tags).toContain("scene:verse");
    expect(rim!.tags).toContain("scene:chorus");
    // 既存drum＝beat8.basic にも scene が付く（roles=intro/verse）。
    const [b8] = core.listNeta({ scope: "library", tags: ["pat:beat8.basic"], limit: 10 });
    expect(b8!.tags.some((t) => t.startsWith("scene:"))).toBe(true);
    // bass ED-PULSE＝roles に verse 追加（L4）。
    const [pulse] = core.listNeta({ scope: "library", tags: ["pat:ED-PULSE"], limit: 10 });
    expect(pulse!.tags).toContain("scene:verse");
    expect(pulse!.tags).toContain("scene:chorus");
  });
});

describe("(4) 不変ガード：GENRE_TABLE 経路は据え置き（出音不変）", () => {
  it("pickCompType/pickBassType/pickBeatPattern は既存プローブで従来と同一ID（新型は GENRE_TABLE 非登録）", () => {
    // 新型はどの GENRE_TABLE にも入れていない＝単数 pick 経路は既存型のみを返す（bit 経路を汚さない）。
    expect(pickCompType("ballad", "verse", 70, 1)?.id).toBeTruthy();
    expect(pickBassType("rock", "chorus", 180, 1)?.id).toBe("RK-GALLOP"); // 既存契約（gen-bass-library）
    expect(pickBeatPattern("jpop", "chorus", 140, false, 3)?.id).toBe("four.rock"); // 既存契約（gen-drums-library）
    // 新 chord/bass/drum 型は pick で選ばれない（GENRE_TABLE 非登録の確証）。
    const pickedChord = new Set<string>();
    for (const g of ["ballad", "rock", "dance", "anison", "folk", "metal"]) for (const seed of [1, 2, 3, 5, 7]) {
      const t = pickCompType(g, "verse", undefined, seed); if (t) pickedChord.add(t.id);
    }
    for (const id of NEW_CHORD) expect(pickedChord.has(id), `${id} は単数pickで出ない`).toBe(false);
  });
  it("drum 新6型：hits は 0..15 域内・vel 1..127", () => {
    for (const id of NEW_DRUM) {
      const p = beatPatternById(id)!;
      for (const lane of p.lanes) {
        for (const h of lane.hits) { expect(h, `${id}/${lane.name}`).toBeGreaterThanOrEqual(0); expect(h, `${id}/${lane.name}`).toBeLessThan(16); }
        expect(lane.vel, `${id}/${lane.name} vel`).toBeGreaterThanOrEqual(1);
        expect(lane.vel, `${id}/${lane.name} vel`).toBeLessThanOrEqual(127);
      }
    }
  });
});
