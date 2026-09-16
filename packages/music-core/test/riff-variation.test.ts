// 繰り返しに変奏の層（design.md 追補 (k-7)・2026-09-16 オーナー裁定）＝層単体のテスト（S1）。
// 設計の赤テスト①〜⑦（恒等・決定論・提示無傷・非対象無傷・語彙内・入れ子・保護 step 無傷）＋⑧レバーの期待セル列＋⑨変異検査。
// **変換の組み合わせと強さ（スケジュール・階段・向き）は「仮」**＝耳で決まる値。テスト名にも「仮」と書く。
import { describe, it, expect } from "vitest";
import {
  varyRiffTiles, riffVariationSchedule, normalizeRiffVariationLevel, RIFF_VARIATION_LEVERS, RIFF_LADDER,
  type RiffCell, type RiffTile, type RiffVariationOpts,
} from "../src/riffVariation";
import { GUITAR_GRAMMARS } from "../src/guitarRiff";

// ── 固定入力（ギター＝music-core の文法3型／ベース＝api bassLibrary の3型を半音で写した写し） ──
const gtrCells = (id: keyof typeof GUITAR_GRAMMARS): RiffCell[] =>
  GUITAR_GRAMMARS[id].cells.map((c) => ({ step: c.step, kind: c.kind, deg: c.deg, anchor: c.anchor, role: c.role, voicing: c.voicing }));
const b = (step: number, kind: RiffCell["kind"], deg: number, anchor: boolean, role: string): RiffCell => ({ step, kind, deg, anchor, role });
// apps/api/src/music/bassLibrary.ts の G_PEDAL_ANSWER／G_GALLOP_PEDAL／G_OCTAVE_CALL_RESPONSE（源流 riff.py:17-85）
const BASS: Record<string, RiffCell[]> = {
  pedal_answer: [
    b(0, "accent", 0, true, "head"), b(2, "note", 0, false, "pedal"), b(3, "ghost", 0, false, "dead"), b(4, "note", 0, false, "pedal"),
    b(6, "note", 0, false, "pedal"), b(8, "accent", 0, true, "head"), b(10, "note", 0, false, "pedal"), b(12, "note", 0, false, "pedal"),
    b(14, "note", 7, false, "pickup"), b(16, "accent", 0, true, "head"), b(18, "note", 0, false, "pedal"), b(20, "note", 0, false, "pedal"),
    b(22, "note", 0, false, "pedal"), b(24, "accent", 0, true, "head"), b(26, "note", 10, false, "answer"), b(27, "ghost", 10, false, "dead"),
    b(28, "note", 7, false, "answer"), b(30, "note", 5, false, "answer"),
  ],
  gallop_pedal: [
    b(0, "accent", 0, true, "head"), b(2, "note", 0, false, "pedal"), b(3, "note", 0, false, "pedal"), b(4, "note", 0, false, "head"),
    b(6, "note", 0, false, "pedal"), b(7, "note", 0, false, "pedal"), b(8, "note", 0, false, "head"), b(10, "note", 0, false, "pedal"),
    b(11, "note", 0, false, "pedal"), b(12, "note", 0, false, "head"), b(14, "note", 7, false, "answer"), b(15, "note", 6, false, "blue"),
    b(16, "accent", 0, true, "head"), b(18, "note", 0, false, "pedal"), b(19, "note", 0, false, "pedal"), b(20, "note", 0, false, "head"),
    b(22, "note", 0, false, "pedal"), b(23, "note", 0, false, "pedal"), b(24, "note", 0, false, "head"), b(26, "note", 0, false, "pedal"),
    b(27, "note", 0, false, "pedal"), b(28, "note", 0, false, "head"), b(30, "note", 10, false, "climb"), b(31, "note", 1, true, "climb"),
  ],
  octave_call_response: [
    b(0, "accent", 0, true, "head"), b(2, "note", 12, false, "octave"), b(4, "note", 0, false, "root"), b(6, "note", 12, false, "octave"),
    b(8, "accent", 0, true, "head"), b(10, "note", 12, false, "octave"), b(11, "ghost", 0, false, "dead"), b(12, "note", 7, false, "answer"),
    b(14, "note", 12, false, "octave"), b(16, "accent", 0, true, "head"), b(18, "note", 12, false, "octave"), b(20, "note", 0, false, "root"),
    b(22, "note", 10, false, "answer"), b(24, "accent", 0, true, "head"), b(26, "note", 12, false, "octave"), b(28, "note", 6, false, "blue"),
    b(30, "note", 0, false, "root"),
  ],
};

const tilesOf = (cells: RiffCell[], n: number): RiffTile[] =>
  Array.from({ length: n }, (_, i) => ({ index: i, last: i === n - 1, cells: cells.map((c) => ({ ...c })) }));

type Fixture = { name: string; instrument: "bass" | "guitar"; cells: RiffCell[] };
const FIXTURES: Fixture[] = [
  ...(["power_chug", "pedal_answer", "gallop"] as const).map((id) => ({ name: `guitar/${id}`, instrument: "guitar" as const, cells: gtrCells(id) })),
  ...Object.entries(BASS).map(([id, cells]) => ({ name: `bass/${id}`, instrument: "bass" as const, cells })),
];
const KICK_4 = [0, 4, 8, 12];
const kickProtected = (nTiles: number, kick: number[]): Set<number> => {
  const s = new Set<number>();
  for (let bar = 0; bar < nTiles * 2; bar++) for (const k of kick) s.add(bar * 16 + k);
  return s;
};
const opts = (f: Fixture, level: 0 | 0.5 | 1, seed = 0, prot: ReadonlySet<number> = new Set()): RiffVariationOpts =>
  ({ level, seed, protectedSteps: prot, instrument: f.instrument });

// ── 不変条件（テスト側の検証器・実装の表を使わない） ──
const key = (c: RiffCell) => `${c.kind}|${c.deg}|${c.anchor}|${c.role}|${c.voicing ?? ""}`;
function changedSteps(a: RiffTile, z: RiffTile): Set<number> {
  const ma = new Map(a.cells.map((c) => [c.step, key(c)])), mz = new Map(z.cells.map((c) => [c.step, key(c)]));
  const out = new Set<number>();
  for (const s of new Set([...ma.keys(), ...mz.keys()])) if (ma.get(s) !== mz.get(s)) out.add(s);
  return out;
}
const FROZEN_ROLES = new Set(["head", "chord", "octave", "root"]);
/** ④非対象無傷＋⑦保護 step 無傷。問題の列を返す（空＝合格）。 */
function nonTargetProblems(input: RiffTile[], output: RiffTile[], prot: ReadonlySet<number>): string[] {
  const probs: string[] = [];
  for (let t = 0; t < input.length; t++) {
    const inp = input[t]!, out = output[t]!;
    const byStep = new Map(out.cells.map((c) => [c.step, c]));
    const inSteps = new Set(inp.cells.map((c) => c.step));
    for (const c of inp.cells) {
      const o = byStep.get(c.step);
      const g = inp.index * 32 + c.step;
      const strict = c.anchor || FROZEN_ROLES.has(c.role) || prot.has(g);
      if (strict) { if (!o || key(o) !== key(c)) probs.push(`t${t} step${c.step} 不可侵セルが変わった`); continue; }
      if (c.role === "pedal" || c.role === "chug") {
        if (!o) { probs.push(`t${t} step${c.step} ${c.role} が消えた`); continue; }
        const expanded = o.role === "answer";
        const octaveUp = o.role === c.role && o.kind === c.kind && o.deg === c.deg + 12 && (o.voicing ?? "") === (c.voicing ?? "");
        if (key(o) !== key(c) && !expanded && !octaveUp) probs.push(`t${t} step${c.step} ${c.role} が許されない形に変わった`);
      } else if (c.role === "dead") {
        if (o && key(o) !== key(c)) probs.push(`t${t} step${c.step} dead が書き換わった`);
      }
    }
    for (const o of out.cells) {
      if (!inSteps.has(o.step)) {
        if (!(o.kind === "ghost" && o.role === "dead")) probs.push(`t${t} step${o.step} ghost 以外が足された`);
        if (prot.has(inp.index * 32 + o.step)) probs.push(`t${t} step${o.step} 保護 step に足された`);
      }
    }
  }
  return probs;
}
function vocabProblems(input: RiffTile[], output: RiffTile[]): string[] {
  const allowed = new Set<number>([...RIFF_LADDER, ...input.flatMap((t) => t.cells.map((c) => c.deg))]);
  return output.flatMap((t) => t.cells.filter((c) => !allowed.has(c.deg)).map((c) => `t${t.index} step${c.step} deg ${c.deg}`));
}
function nestingProblems(input: RiffTile[], mid: RiffTile[], high: RiffTile[]): string[] {
  const probs: string[] = [];
  for (let t = 0; t < input.length; t++) {
    const cm = changedSteps(input[t]!, mid[t]!), ch = changedSteps(input[t]!, high[t]!);
    for (const s of cm) if (!ch.has(s)) probs.push(`t${t} step${s} は中で変わり多めで変わらない`);
  }
  return probs;
}
const presentationProblems = (input: RiffTile[], output: RiffTile[]): string[] =>
  JSON.stringify(input[0]) === JSON.stringify(output[0]) ? [] : ["提示（tile 0）が変わった"];

describe("変奏の層（S1）＝不変条件①〜⑦", () => {
  for (const f of FIXTURES) {
    for (const n of [1, 2, 3, 4]) {
      for (const lock of [false, true]) {
        const prot = lock ? kickProtected(n, KICK_4) : new Set<number>();
        const label = `${f.name} tiles=${n}${lock ? " 保護あり" : ""}`;
        it(`① 恒等＝level 0 は入力と同じ（${label}）`, () => {
          const input = tilesOf(f.cells, n);
          expect(varyRiffTiles(input, opts(f, 0, 3, prot)).tiles).toEqual(input);
        });
        it(`② 決定論・入力を破壊しない（${label}）`, () => {
          for (const lv of [0.5, 1] as const) {
            const input = tilesOf(f.cells, n);
            const snap = JSON.stringify(input);
            const a = varyRiffTiles(input, opts(f, lv, 7, prot));
            const z = varyRiffTiles(input, opts(f, lv, 7, prot));
            expect(a).toEqual(z);
            expect(JSON.stringify(input)).toBe(snap);
          }
        });
        it(`③④⑤⑥⑦ 提示無傷・非対象無傷・語彙内・入れ子・保護（${label}）`, () => {
          for (const seed of [0, 1, 2, 3]) {
            const input = tilesOf(f.cells, n);
            const mid = varyRiffTiles(input, opts(f, 0.5, seed, prot)).tiles;
            const high = varyRiffTiles(input, opts(f, 1, seed, prot)).tiles;
            for (const out of [mid, high]) {
              expect(presentationProblems(input, out)).toEqual([]);
              expect(nonTargetProblems(input, out, prot)).toEqual([]);
              expect(vocabProblems(input, out)).toEqual([]);
            }
            expect(nestingProblems(input, mid, high)).toEqual([]);
          }
        });
      }
    }
  }

  it("被覆（空虚でない）：反復単位2枚以上・保護なしの全固定入力で、中も多めも2枚目以降に変化がある", () => {
    for (const f of FIXTURES) for (const n of [2, 3, 4]) {
      const input = tilesOf(f.cells, n);
      for (const lv of [0.5, 1] as const) {
        const out = varyRiffTiles(input, opts(f, lv, 0)).tiles;
        const total = out.slice(1).reduce((s, t, i) => s + changedSteps(input[i + 1]!, t).size, 0);
        expect(total, `${f.name} n=${n} level=${lv}`).toBeGreaterThan(0);
      }
    }
  });

  it("反復単位が1枚＝変奏の余地なし（report で分かる）", () => {
    const f = FIXTURES[0]!;
    const r = varyRiffTiles(tilesOf(f.cells, 1), opts(f, 1, 0));
    expect(r.report.tiles.every((t) => t.changed === 0)).toBe(true);
  });
});

describe("スケジュール（仮＝耳で決める）", () => {
  it("仮：なし＝空／中＝奇数と最後に sequence／多め＝奇数 sequence+ornament・偶数 fragment・最後 sequence+expand+ornament", () => {
    expect(riffVariationSchedule(0, 1, true)).toEqual([]);
    expect(riffVariationSchedule(0.5, 0, false)).toEqual([]);
    expect(riffVariationSchedule(1, 0, true)).toEqual([]);
    expect(riffVariationSchedule(0.5, 1, false)).toEqual(["sequence"]);
    expect(riffVariationSchedule(0.5, 2, false)).toEqual([]);
    expect(riffVariationSchedule(0.5, 2, true)).toEqual(["sequence"]);
    expect(riffVariationSchedule(1, 1, false)).toEqual(["sequence", "ornament"]);
    expect(riffVariationSchedule(1, 2, false)).toEqual(["fragment"]);
    expect(riffVariationSchedule(1, 3, true)).toEqual(["sequence", "expand", "ornament"]);
  });
  it("変換の登録口：スケジュールに出る名前はすべて登録済み（リズムの変換は未登録＝研究待ち）", () => {
    for (const lv of [0, 0.5, 1] as const) for (const i of [0, 1, 2, 3]) for (const last of [false, true]) {
      for (const name of riffVariationSchedule(lv, i, last)) expect(RIFF_VARIATION_LEVERS[name], name).toBeTypeOf("function");
    }
    expect(Object.keys(RIFF_VARIATION_LEVERS).sort()).toEqual(["expand", "fragment", "ornament", "sequence"]);
  });
  it("変奏量の丸め：0/0.5/1 の最寄りへ・丸めたら rounded", () => {
    expect(normalizeRiffVariationLevel(0.5)).toEqual({ level: 0.5, rounded: false });
    expect(normalizeRiffVariationLevel(0.8)).toEqual({ level: 1, rounded: true });
    expect(normalizeRiffVariationLevel(0.2)).toEqual({ level: 0, rounded: true });
    expect(normalizeRiffVariationLevel(-3)).toEqual({ level: 0, rounded: true });
    expect(normalizeRiffVariationLevel(Number.NaN)).toEqual({ level: 0, rounded: true });
  });
});

describe("⑧ レバーの期待セル列（仮の中身）", () => {
  const cellAt = (t: RiffTile, s: number) => t.cells.find((c) => c.step === s);

  it("仮 sequence：ベース pedal_answer・seed 0・2枚目（(0+1) 奇数＝上）＝ pickup 5→b7・答句 b7,5,4 → 8,b7,b5", () => {
    const f = FIXTURES.find((x) => x.name === "bass/pedal_answer")!;
    const out = varyRiffTiles(tilesOf(f.cells, 2), opts(f, 0.5, 0)).tiles[1]!;
    expect([14, 26, 28, 30].map((s) => cellAt(out, s)!.deg)).toEqual([10, 12, 10, 6]);
    expect(cellAt(out, 20)!.deg).toBe(0); // ペダルは不変
  });

  it("仮 sequence：seed 1（偶数＝下）＝ pickup 5→b5・答句 → 7,6,3", () => {
    const f = FIXTURES.find((x) => x.name === "bass/pedal_answer")!;
    const out = varyRiffTiles(tilesOf(f.cells, 2), opts(f, 0.5, 1)).tiles[1]!;
    expect([14, 26, 28, 30].map((s) => cellAt(out, s)!.deg)).toEqual([6, 7, 6, 3]);
  });

  it("仮 reselect：全セルが端で動けない時だけ [7,10,12,5] を seed mod 4 回して1音は必ず変える", () => {
    const cells: RiffCell[] = [b(0, "accent", 0, true, "head"), b(26, "note", 12, false, "answer")];
    const lever = RIFF_VARIATION_LEVERS.sequence!;
    const tile: RiffTile = { index: 1, last: true, cells };
    const up = (seed: number) => lever(tile.cells, { tile, opts: { level: 0.5, seed, protectedSteps: new Set(), instrument: "bass" }, ladder: RIFF_LADDER });
    // seed 0：(0+1) 奇数＝上、12 は上端＝動けない → reselect 回転 0 ＝[7,10,12,5] の 12 以外の最初＝7
    expect(up(0).find((c) => c.step === 26)!.deg).toBe(7);
    // seed 2：回転 2 ＝[12,5,7,10] → 5
    expect(up(2).find((c) => c.step === 26)!.deg).toBe(5);
  });

  it("仮 fragment：ベース pedal_answer 3枚目（多め・偶数）＝答句は頭 26 だけ残る・pickup（単独）は残る", () => {
    const f = FIXTURES.find((x) => x.name === "bass/pedal_answer")!;
    const out = varyRiffTiles(tilesOf(f.cells, 4), opts(f, 1, 0)).tiles[2]!;
    expect(cellAt(out, 26)!.deg).toBe(10);
    expect(cellAt(out, 28)).toBeUndefined();
    expect(cellAt(out, 30)).toBeUndefined();
    expect(cellAt(out, 14)!.deg).toBe(7);
  });

  it("仮 fragment：ギター power_chug＝答句の頭 26 以降の ghost/dead(27) も落ちる", () => {
    const f = FIXTURES.find((x) => x.name === "guitar/power_chug")!;
    const out = varyRiffTiles(tilesOf(f.cells, 4), opts(f, 1, 0)).tiles[2]!;
    expect(out.cells.map((c) => c.step).filter((s) => s >= 24)).toEqual([24, 26]);
  });

  it("仮 expand＋ornament：ベース pedal_answer 最後（多め・seed 0＝上）＝ 20,22 が answer で b5,5… 階段で頭(8)へ・18 がオクターブ上", () => {
    const f = FIXTURES.find((x) => x.name === "bass/pedal_answer")!;
    const out = varyRiffTiles(tilesOf(f.cells, 2), opts(f, 1, 0)).tiles[1]!;
    expect(cellAt(out, 26)!.deg).toBe(12);
    expect([cellAt(out, 20)!.role, cellAt(out, 20)!.deg]).toEqual(["answer", 7]);
    expect([cellAt(out, 22)!.role, cellAt(out, 22)!.deg]).toEqual(["answer", 10]);
    expect([cellAt(out, 18)!.role, cellAt(out, 18)!.deg]).toEqual(["pedal", 12]);
  });

  it("仮 expand＋ornament：ギター power_chug 最後（多め）＝ 20 が mono の answer・27 の dead が外れ 25 に ghost", () => {
    const f = FIXTURES.find((x) => x.name === "guitar/power_chug")!;
    const out = varyRiffTiles(tilesOf(f.cells, 2), opts(f, 1, 0)).tiles[1]!;
    expect([cellAt(out, 20)!.role, cellAt(out, 20)!.voicing]).toEqual(["answer", "mono"]);
    expect(cellAt(out, 27)).toBeUndefined();
    expect(cellAt(out, 22)).toBeUndefined(); // 同じ小節の ghost/dead は外れる
    expect(cellAt(out, 25)).toEqual({ step: 25, kind: "ghost", deg: 0, anchor: false, role: "dead", voicing: "mono" });
  });

  it("保護：キック step の答句は動かない（ギター power_chug 28 はキック 12 に当たる）", () => {
    const f = FIXTURES.find((x) => x.name === "guitar/power_chug")!;
    const prot = kickProtected(2, [12]);
    const out = varyRiffTiles(tilesOf(f.cells, 2), opts(f, 1, 0, prot)).tiles[1]!;
    expect(cellAt(out, 28)).toEqual(f.cells.find((c) => c.step === 28));
    expect(cellAt(out, 26)!.deg).not.toBe(10);
  });
});

describe("⑨ 変異検査（検証器が本当に落ちるか）", () => {
  const f = FIXTURES.find((x) => x.name === "guitar/power_chug")!;
  const input = tilesOf(f.cells, 4);
  const mid = varyRiffTiles(input, opts(f, 0.5, 0)).tiles;
  const high = varyRiffTiles(input, opts(f, 1, 0)).tiles;
  const clone = (x: RiffTile[]) => JSON.parse(JSON.stringify(x)) as RiffTile[];

  it("m-b tile 0 にも当てる → 提示無傷が落ちる", () => {
    const m = clone(high);
    m[0]!.cells.find((c) => c.role === "answer")!.deg = 12;
    expect(presentationProblems(input, m).length).toBeGreaterThan(0);
  });
  it("m-c 頭の step を1ずらす → 非対象無傷が落ちる", () => {
    const m = clone(high);
    m[1]!.cells.find((c) => c.role === "head")!.step += 1;
    expect(nonTargetProblems(input, m, new Set()).length).toBeGreaterThan(0);
  });
  it("m-d 階段に無い deg（2）を混ぜる → 語彙内が落ちる", () => {
    const m = clone(mid);
    m[1]!.cells.find((c) => c.role === "answer")!.deg = 2;
    expect(vocabProblems(input, m).length).toBeGreaterThan(0);
  });
  it("m-f 多めから中の変換（sequence）を抜く → 入れ子が落ちる", () => {
    const noSeq = varyRiffTiles(input, { ...opts(f, 1, 0), schedule: (lv, i, last) => riffVariationSchedule(lv, i, last).filter((n) => n !== "sequence") }).tiles;
    expect(nestingProblems(input, mid, noSeq).length).toBeGreaterThan(0);
  });
  it("m-g 保護 step に手を出す → 保護が落ちる", () => {
    const prot = kickProtected(4, [12]);
    const m = clone(varyRiffTiles(input, opts(f, 1, 0, prot)).tiles);
    m[1]!.cells.find((c) => c.step === 28)!.deg = 12;
    expect(nonTargetProblems(input, m, prot).length).toBeGreaterThan(0);
  });
});

// 2026-09-16 監査 中④：ギター装飾（ornament）が答句の頭の1 step 前へゴーストを足す判定に保護が効いているか。
//   既存の固定入力（保護＝キック 0/4/8/12）には「頭の1つ前が保護」の形が無く、保護判定を外す変異が緑のまま通った。
//   ここでは**入力で空いている step を全部保護**する＝足せる所が全部保護＝足したら必ず「保護 step に足された」になる形。
describe("⑦' 保護 step 無傷：ギター装飾のゴーストは空いた保護 step に足さない（監査 中④）", () => {
  for (const f of FIXTURES.filter((x) => x.instrument === "guitar")) {
    it(`${f.name}：保護なしなら足される形がある／空き step を全部保護すると足さない`, () => {
      const n = 4;
      const input = tilesOf(f.cells, n);
      const free = new Set<number>();
      for (const t of input) for (let s = 0; s < 32; s++) if (!t.cells.some((c) => c.step === s)) free.add(t.index * 32 + s);
      const addedGhosts = (out: RiffTile[]) => out.reduce((k, t, i) => k + t.cells.filter((c) => !input[i]!.cells.some((x) => x.step === c.step)).length, 0);
      expect(addedGhosts(varyRiffTiles(input, opts(f, 1, 0)).tiles), "陽性対照：保護なしでゴーストが足される").toBeGreaterThan(0);
      const out = varyRiffTiles(input, opts(f, 1, 0, free)).tiles;
      expect(nonTargetProblems(input, out, free)).toEqual([]);
      expect(addedGhosts(out)).toBe(0);
    });
  }
});
