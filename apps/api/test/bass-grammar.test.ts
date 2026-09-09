// リフ文法辞書（M3-3c・grammar セル3型を anchor/role 注記付きで bassLibrary へ正式登録）。
// 正典＝docs/design.md §2106 追補 (k)／計画 §5-2 M3 Scope 3c。出所＝phrase_maker `bass_rock_riff/riff.py:17-88`。
//
// ここで守るもの：
//   gate           ＝**既存の型の出音を変えない**（BASS_TYPES / ジャンル候補に混ぜない・既定の体は 3a と同じ格子）
//   byConstruction ＝辞書が源流のリズムと注記（anchor/role）をそのまま持っている
//   到達口         ＝`anchorGrammar` が4口から届く（作ったのに触れないノブは硬化する）
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";
import { genBass, type DrumsInput } from "../src/music/generate";
import { BASS_GRAMMARS, bassGrammarById, BASS_GRAMMAR_DEFAULT_ID, BASS_TYPES, bassTypeById, pickBassType, parseBassPattern } from "../src/music/bassLibrary";

type Note = { pitch: number; start: number; dur: number };
const FRAME = { bars: 4, meter: "4/4", key: 0 };
const CHORDS = [{ root: 9, quality: "min", start: 0, dur: 4 }, { root: 5, quality: "", start: 4, dur: 4 },
  { root: 0, quality: "", start: 8, dur: 4 }, { root: 7, quality: "", start: 12, dur: 4 }];
const DR: DrumsInput = { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [
  { name: "Kick", midi: 36, hits: [0, 6, 8, 14] }, { name: "Snare", midi: 38, hits: [4, 12] },
] } };
const notesOf = (o: object, seed = 42) => (genBass(FRAME, CHORDS, seed, DR, o).items[0]!.content as { notes: Note[] }).notes;

describe("辞書の中身＝源流 riff.py の3文法（byConstruction）", () => {
  it("3型が登録されている（id と出所）", () => {
    expect(BASS_GRAMMARS.map((g) => g.id)).toEqual(["pedal_answer", "gallop_pedal", "octave_call_response"]);
    for (const g of BASS_GRAMMARS) {
      expect(g.source).toMatch(/riff\.py:\d+-\d+/); // 数値の出所を引く（§6-4 #11）
      expect(g.bars).toBe(2);
      expect(g.onsets.length).toBe(2);
      expect(g.cells.length).toBe(2);
      for (const cell of g.cells) expect(cell.length).toBe(16);
    }
  });

  it("**anchor/role 注記が保たれている**＝BassCell では表せない情報（3c の要点）", () => {
    const pa = bassGrammarById("pedal_answer")!;
    // bar1＝ルートペダル（head が不可侵の錨・pedal/pickup・ゴースト）
    expect(pa.onsets[0]!.map((o) => [o.step, o.kind, o.deg, o.anchor, o.role]))
      .toEqual([
        [0, "accent", "R", true, "head"], [2, "note", "R", false, "pedal"], [3, "ghost", "R", false, "dead"],
        [4, "note", "R", false, "pedal"], [6, "note", "R", false, "pedal"], [8, "accent", "R", true, "head"],
        [10, "note", "R", false, "pedal"], [12, "note", "R", false, "pedal"], [14, "note", "5", false, "pickup"],
      ]);
    // bar2＝ペンタ答句（b7→5→4）
    expect(pa.onsets[1]!.filter((o) => o.role === "answer").map((o) => o.deg)).toEqual(["b7", "5", "4"]);
    expect(pa.onsets[1]!.find((o) => o.step === 11)).toEqual({ step: 11, kind: "ghost", deg: "b7", anchor: false, role: "dead" });
    // ギャロップ＝小節末のブルー b5 と半音クライム（b2 は anchor＝導音として不可侵）
    const gp = bassGrammarById("gallop_pedal")!;
    expect(gp.onsets[0]!.find((o) => o.step === 15)).toEqual({ step: 15, kind: "note", deg: "b5", anchor: false, role: "blue" });
    expect(gp.onsets[1]!.find((o) => o.step === 15)).toEqual({ step: 15, kind: "note", deg: "b2", anchor: true, role: "climb" });
    // オクターブ呼応＝オクターブ往復（レジスタの動きが知識の芯）
    const oc = bassGrammarById("octave_call_response")!;
    expect(oc.onsets[0]!.filter((o) => o.role === "octave").map((o) => o.step)).toEqual([2, 6, 10, 14]);
    expect(oc.onsets[0]!.every((o) => o.role !== "octave" || o.deg === "8")).toBe(true);
  });

  it("cells（派生）は源流のリズムと同じ＝ghost は休符扱い・onset の step 集合が一致", () => {
    for (const g of BASS_GRAMMARS) {
      g.onsets.forEach((bar, bi) => {
        const cells = g.cells[bi]!;
        for (const o of bar) {
          expect(cells[o.step]!.kind, `${g.id} bar${bi} step${o.step}`).toBe(o.kind === "ghost" || o.kind === "dead" ? "ghost" : "on");
          if (cells[o.step]!.kind === "on") expect(cells[o.step]!.deg).toBe(o.deg);
        }
        const steps = new Set(bar.map((o) => o.step));
        cells.forEach((c, i) => { if (!steps.has(i)) expect(c.kind, `${g.id} bar${bi} step${i}`).toBe("rest"); });
      });
    }
  });

  it("未知IDは null（呼び手が既定へ落とせる）／既定は pedal_answer", () => {
    expect(bassGrammarById("nope")).toBeNull();
    expect(bassGrammarById(undefined)).toBeNull();
    expect(BASS_GRAMMAR_DEFAULT_ID).toBe("pedal_answer");
  });
});

describe("gate＝既存の型の出音を変えない（追加のみ）", () => {
  it("BASS_TYPES にも型IDにも混ざっていない＝既定の型選抜は 1bit も変わらない", () => {
    for (const g of BASS_GRAMMARS) {
      expect(BASS_TYPES.some((t) => t.id === g.id)).toBe(false);
      expect(bassTypeById(g.id)).toBeFalsy(); // 型辞書の口からは引けない
      // ジャンル名からの選抜（pickBassType）にも出てこない
      for (const genre of ["rock", "ballad", "citypop", "funk", "edm", "vocarock"]) {
        for (let seed = 0; seed < 12; seed++) {
          expect(pickBassType(genre, undefined, 120, seed)?.id).not.toBe(g.id);
        }
      }
    }
  });

  it("既定の体は 3a と同じ格子（暫定 BASS_GRAMMAR_PEDAL_ANSWER の譜面と派生 cells が一致）＝出音不変", () => {
    // 3a が内部に置いていた暫定の譜（コミット 5d60c37）をここでリテラルに持ち、辞書の派生と突き合わせる。
    const provisional = [
      parseBassPattern("R . R x | R . R . | R . R . | R . 5 ."),
      parseBassPattern("R . R . | R . R . | R . b7 x | 5 . 4 ."),
    ];
    expect(bassGrammarById("pedal_answer")!.cells).toEqual(provisional);
  });

  it("anchorLock の既定（anchorGrammar 未指定）は pedal_answer 明示と完全一致", () => {
    expect(notesOf({ anchorLock: true })).toEqual(notesOf({ anchorLock: true, anchorGrammar: "pedal_answer" }));
  });

  it("anchorLock を使わない経路では anchorGrammar を渡しても 1bit も変わらない", () => {
    for (const base of [{}, { style: "RK-8ROOT" }, { kickLock: 0.7 }]) {
      expect(notesOf({ ...base, anchorGrammar: "gallop_pedal" })).toEqual(notesOf(base));
    }
  });
});

describe("文法を切り替えると体が変わる（ノブが実際に効いている）", () => {
  it("3型それぞれで別の線が出る＝辞書が生きている", () => {
    const pa = notesOf({ anchorLock: true, anchorGrammar: "pedal_answer" });
    const gp = notesOf({ anchorLock: true, anchorGrammar: "gallop_pedal" });
    const oc = notesOf({ anchorLock: true, anchorGrammar: "octave_call_response" });
    expect(gp).not.toEqual(pa);
    expect(oc).not.toEqual(pa);
    expect(oc).not.toEqual(gp);
    expect(gp.length).toBeGreaterThan(pa.length); // ギャロップは密（8分＋16分×2）
  });

  it("錨（キック step）はどの文法でもルートで、非キックのセルだけが文法ごとに違う＝分業が保たれる", () => {
    const kickBeats = [0, 1.5, 2, 3.5];
    const rootAt = (t: number) => CHORDS.find((c) => c.start <= t && t < c.start + c.dur)!.root;
    for (const id of ["pedal_answer", "gallop_pedal", "octave_call_response"]) {
      const ns = notesOf({ anchorLock: true, anchorGrammar: id });
      let covered = 0;
      for (let bar = 0; bar < 4; bar++) for (const kb of kickBeats) {
        const t = bar * 4 + kb;
        const n = ns.find((x) => Math.abs(x.start - t) < 1e-9);
        expect(n, `${id} kick@${t}`).toBeDefined();
        expect(((n!.pitch % 12) + 12) % 12, `${id} kick@${t}`).toBe(rootAt(t));
        covered++;
      }
      expect(covered).toBe(16); // 被覆率 16/16＝全キック step（数値で出す・§6-4 #7）
    }
  });

  it("style 指定時は style 型の格子が体＝文法は使われない（追補 (k) の併用規則）", () => {
    const a = notesOf({ anchorLock: true, style: "CP-OCT8", anchorGrammar: "pedal_answer" });
    const b = notesOf({ anchorLock: true, style: "CP-OCT8", anchorGrammar: "gallop_pedal" });
    expect(b).toEqual(a);
  });

  it("未知の文法IDは既定へ落として **meta.warnings** で言う＝黙って落とさない（独自キーは無言）", () => {
    const warns = (r: unknown) => ((r as { meta?: { warnings?: string[] } }).meta?.warnings ?? []);
    const r = genBass(FRAME, CHORDS, 42, DR, { anchorLock: true, anchorGrammar: "nope" });
    expect(warns(r).join("|")).toMatch(/知らないリフ文法（nope）.*既定（pedal_answer）/);
    expect("anchorGrammarFallback" in (r as object)).toBe(false);
    expect(notesOf({ anchorLock: true, anchorGrammar: "nope" })).toEqual(notesOf({ anchorLock: true }));
    expect(warns(genBass(FRAME, CHORDS, 42, DR, { anchorLock: true }))).toEqual([]); // 正しく指定した時は黙る
  });
});

describe("到達口＝anchorGrammar が4口から届く（④web は SectionEditor.test.tsx）", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });

  it("①/music/gen_bass（HTTP）", async () => {
    const r = await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: FRAME, chords: CHORDS, seed: 42, drums: DR, anchorLock: true, anchorGrammar: "gallop_pedal" } });
    expect(r.statusCode).toBe(200);
    const c = (r.json() as { items: { content: { notes: Note[] } }[] }).items[0]!.content;
    expect(c.notes).toEqual(notesOf({ anchorLock: true, anchorGrammar: "gallop_pedal" }));
    expect(c.notes).not.toEqual(notesOf({ anchorLock: true }));
  });

  it("②MCP gen_bass（inputSchema の選択肢が辞書と一致＝schema が実態とずれない）", async () => {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(st), client.connect(ct)]);
    const tool = (await client.listTools()).tools.find((t) => t.name === "gen_bass")!;
    const props = (tool.inputSchema as { properties: Record<string, { enum?: string[] }> }).properties;
    expect(props.anchorGrammar!.enum).toEqual(BASS_GRAMMARS.map((g) => g.id)); // 辞書が増えたら schema も増える
    const res = await client.callTool({ name: "gen_bass", arguments: { frame: FRAME, chords: CHORDS, seed: 42, drums: DR, anchorLock: true, anchorGrammar: "octave_call_response" } });
    const out = JSON.parse((res as { content: { text: string }[] }).content[0]!.text) as { items: { content: { notes: Note[] } }[] };
    expect(out.items[0]!.content.notes).toEqual(notesOf({ anchorLock: true, anchorGrammar: "octave_call_response" }));
  });

  it("③/gen/section（body.bass 素通し）", async () => {
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { frame: { bars: 2, meter: "4/4", key: 0 }, seed: 42, parts: ["chords", "bass", "drums"], bass: { anchorLock: true, anchorGrammar: "gallop_pedal" } } });
    expect(r.statusCode).toBe(200);
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] } };
    const bassA = comp.composition.children.find((c) => c.node.neta.kind === "bass")!.node.neta.content as { notes: Note[] };
    const r2 = await app.inject({ method: "POST", url: "/gen/section", payload: { frame: { bars: 2, meter: "4/4", key: 0 }, seed: 42, parts: ["chords", "bass", "drums"], bass: { anchorLock: true } } });
    const bassB = ((r2.json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] } }).composition.children.find((c) => c.node.neta.kind === "bass")!.node.neta.content) as { notes: Note[] };
    expect(bassA.notes).not.toEqual(bassB.notes); // 値が届いている（型だけでない）
  });
});
