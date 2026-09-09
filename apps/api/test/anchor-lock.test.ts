// 錨と間の分業（M3-3a・第三経路 `anchorLock`）のテスト。正典＝docs/design.md §2106 追補 (k)／
// 計画 docs/drafts/2026-09-09-phrasemaker-port-master-plan.md §5-2 M3・§11-3。
// 移植元＝phrase_maker `ensemble.py:1111-1179 _lock_bass_roots_to_sheet`（純関数・RNG/hash なし）。
//
// 順序は計画 §11-3 のとおり：① bit 一致4本立て（最重要＝既定の出音を 1bit も変えない）→ ② 不変条件＋被覆率
// → ③ 変異検査（出力に故障を注入＝それぞれ落ちる不変条件が1つ以上）。
// 受け入れの型分け（M3）：`gate`＝bit 一致・変異検査／`byConstruction`＝「全キックに錨」「非キックセル無傷」
// （構造上そうなる＝証拠に数えず**被覆率を数値で出す**）／`diagnostic`＝分岐内訳。耳は作曲で。
import { describe, it, expect } from "vitest";
import { genBass, type DrumsInput } from "../src/music/generate";
import type { DerivedCue } from "@cm/music-core";

type Note = { pitch: number; start: number; dur: number; vel?: number };
const content = (r: ReturnType<typeof genBass>) => r.items[0]!.content as { notes: Note[]; engine?: { version: string } };
const notesOf = (r: ReturnType<typeof genBass>) => content(r).notes;

const BF = { meter: "4/4", bars: 4 };
// Am F C G（1小節1コード）。root は pc（A=9, F=5, C=0, G=7）。
const CHORDS = [
  { root: 9, quality: "min", start: 0, dur: 4 },
  { root: 5, quality: "", start: 4, dur: 4 },
  { root: 0, quality: "", start: 8, dur: 4 },
  { root: 7, quality: "", start: 12, dur: 4 },
];
const drums = (kick: number[]): DrumsInput => ({
  rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [
    { name: "Kick", midi: 36, hits: kick },
    { name: "Snare", midi: 38, hits: [4, 12] },
  ] },
});
const DR = drums([0, 6, 8, 14]); // 拍頭＋シンコペ混在＝(a)(b)(c) と案B が全部効く
const withCues = (frame: Record<string, unknown>, cues: DerivedCue[]) => ({ ...frame, section: { ...((frame.section as object) ?? {}), cues } });

// ── ① bit 一致（最重要・cues-cascade.test.ts:27-77 の定型を anchorLock 版に） ───────────────
describe("bit 一致＝anchorLock は既定 OFF・cues 未指定なら従来出力と完全一致（gate）", () => {
  it("anchorLock 未指定＝従来 genBass 出力と deepStrictEqual（content に engine キーが生えない）", () => {
    const a = genBass(BF, CHORDS, 11, DR, { kickLock: 0.6 });
    const b = genBass(BF, CHORDS, 11, DR, { kickLock: 0.6, anchorLock: undefined });
    const c = genBass(BF, CHORDS, 11, DR, { kickLock: 0.6, anchorLock: false });
    expect(b).toStrictEqual(a);
    expect(c).toStrictEqual(a);
    expect("engine" in content(a)).toBe(false);
    expect("engine" in content(c)).toBe(false);
  });

  it("anchorLock 未指定＝ドラム/スタイルの有無を問わず従来と一致（fig 経路・style 経路とも）", () => {
    expect(genBass(BF, CHORDS, 5, null, { anchorLock: false })).toStrictEqual(genBass(BF, CHORDS, 5, null));
    expect(genBass(BF, CHORDS, 5, DR, { style: "RK-8ROOT", anchorLock: false })).toStrictEqual(genBass(BF, CHORDS, 5, DR, { style: "RK-8ROOT" }));
  });

  it("anchorLock ON でも：section 無し ＝ section:{} ＝ section:{cues:[]}", () => {
    const a = genBass(BF, CHORDS, 11, DR, { anchorLock: true });
    const b = genBass({ ...BF, section: {} }, CHORDS, 11, DR, { anchorLock: true });
    const c = genBass({ ...BF, section: { cues: [] } }, CHORDS, 11, DR, { anchorLock: true });
    expect(b).toStrictEqual(a);
    expect(c).toStrictEqual(a);
  });

  it("anchorLock ON でも：未知 kind（\"kime\"）は無視＝cues 無しと一致", () => {
    const kime = [{ bar: 1, kind: "kime" }] as unknown as DerivedCue[];
    expect(genBass(withCues(BF, kime) as never, CHORDS, 11, DR, { anchorLock: true }))
      .toStrictEqual(genBass(BF, CHORDS, 11, DR, { anchorLock: true }));
  });

  it("anchorLock ON でも：respondToCues:false＝cues を読まない（land 入りでも従来経路のまま）", () => {
    const land = [{ bar: 0, kind: "land" }] as DerivedCue[];
    const off = genBass(withCues(BF, land) as never, CHORDS, 11, DR, { anchorLock: true, respondToCues: false });
    expect(off).toStrictEqual(genBass(BF, CHORDS, 11, DR, { anchorLock: true }));
    const on = genBass(withCues(BF, land) as never, CHORDS, 11, DR, { anchorLock: true });
    expect(notesOf(on)[0]!.vel).toBe(118); // 合図に乗る側は land が効く＝上の一致が「何も効いていない」ことの陰性対照
  });

  it("決定性＝同一 (frame, chords, seed, drums, つまみ) → 同一出力（2回呼び）", () => {
    const a = genBass(BF, CHORDS, 7, DR, { anchorLock: true, anchorRestOnSyncopatedKick: true });
    const b = genBass(BF, CHORDS, 7, DR, { anchorLock: true, anchorRestOnSyncopatedKick: true });
    expect(b).toStrictEqual(a);
  });
});

// ── engineVersion（新経路を使ったときだけ刻む） ────────────────────────────────
describe("engineVersion＝新経路使用時のみ content に engine:{version}（gate）", () => {
  it("anchorLock 経路が立った時だけ engine が載る", () => {
    const on = content(genBass(BF, CHORDS, 3, DR, { anchorLock: true }));
    expect(on.engine?.version).toMatch(/^pm-/);
    expect("engine" in content(genBass(BF, CHORDS, 3, DR, {}))).toBe(false);
  });
  it("anchorLock を頼んでも経路が立たなければ engine を載せず、理由を返す（黙って落とさない）", () => {
    const noDrums = genBass(BF, CHORDS, 3, null, { anchorLock: true });
    expect("engine" in content(noDrums)).toBe(false);
    expect((noDrums as { anchorLockFallback?: string }).anchorLockFallback).toBe("no-drums");
    const compound = genBass({ meter: "6/8", bars: 4 }, CHORDS, 3, DR, { anchorLock: true });
    expect((compound as { anchorLockFallback?: string }).anchorLockFallback).toBe("compound-meter");
    // 経路が立たなかった時は従来経路の出力そのもの＝bit 一致
    expect(noDrums).toStrictEqual({ ...genBass(BF, CHORDS, 3, null, {}), anchorLockFallback: "no-drums" });
  });
});

// ── relative との組み合わせ（絶対で返し理由を添える） ──────────────────────────
describe("relative:true × anchorLock＝絶対で返し relativeFallback:\"anchor-lock\"（gate）", () => {
  it("style 型ありでも相対にせず絶対 notes を返す", () => {
    const r = genBass(BF, CHORDS, 3, DR, { style: "RK-8ROOT", relative: true, anchorLock: true });
    const c = r.items[0]!.content as { mode?: string; notes?: Note[] };
    expect(c.mode).toBeUndefined();
    expect(Array.isArray(c.notes)).toBe(true);
    expect((r as { relativeFallback?: string }).relativeFallback).toBe("anchor-lock");
  });
  it("anchorLock 無しの相対は従来どおり相対のまま（後退ゼロ）", () => {
    const c = genBass(BF, CHORDS, 3, DR, { style: "RK-8ROOT", relative: true }).items[0]!.content as { mode?: string };
    expect(c.mode).toBe("relative");
  });
});

// ── ② 不変条件＋被覆率（byConstruction＝証拠に数えず数値を出す） ──────────────────
const SLOT = 0.25; // 4/4 の16分1スロット（拍）
const rootPcAt = (t: number): number => {
  const ch = CHORDS.find((c) => c.start <= t && t < c.start + c.dur);
  return ch ? ((ch.root % 12) + 12) % 12 : 0;
};
/** 錨の被覆率＝「ルート音が乗ったキック step ／ キック step 総数」。 */
function anchorCoverage(notes: Note[], kick: number[], bars: number): { total: number; hit: number; coverage: number } {
  let total = 0, hit = 0;
  for (let bar = 0; bar < bars; bar++) {
    for (const k of kick) {
      const t = bar * 4 + k * SLOT;
      total++;
      if (notes.some((n) => Math.abs(n.start - t) < 1e-9 && ((n.pitch % 12) + 12) % 12 === rootPcAt(t))) hit++;
    }
  }
  return { total, hit, coverage: total > 0 ? hit / total : 1 };
}

describe("不変条件（INV）と被覆率（byConstruction・数値で出す）", () => {
  it("INV1：全キック step にルート錨が乗る（案B OFF・被覆率=1）", () => {
    const kick = [0, 6, 8, 14];
    const n = notesOf(genBass(BF, CHORDS, 11, drums(kick), { anchorLock: true }));
    const cov = anchorCoverage(n, kick, 4);
    expect(cov.total).toBe(16); // 4小節 × キック4点
    expect(cov.hit).toBe(16);
    expect(cov.coverage).toBe(1);
  });

  it("INV1'：case B（拍頭でない無音キックは休む）を入れると被覆率が下がる＝つまみが効いている", () => {
    // pedal_answer 既定の体で休符に当たるシンコペ step（5,9,13）をキックにする
    const kick = [0, 5, 9, 13];
    const off = anchorCoverage(notesOf(genBass(BF, CHORDS, 11, drums(kick), { anchorLock: true })), kick, 4);
    const on = anchorCoverage(notesOf(genBass(BF, CHORDS, 11, drums(kick), { anchorLock: true, anchorRestOnSyncopatedKick: true })), kick, 4);
    expect(off.coverage).toBe(1);
    expect(on.coverage).toBeLessThan(1);
    expect(on.coverage).toBeGreaterThan(0);
    expect(on.hit).toBe(4); // 拍頭 step0 の4小節分だけ残る
  });

  it("INV2：非キックセル（リフ本体）が1つも書き換わらない＝錨の位置を変えても間の音は同じ", () => {
    // 検算側は生成器の表を import しない（§6-4 の 2）。同じ体に別のキックを当て、
    // **どちらのキックでもない step** の (start,pitch) が完全に一致することで「リフ無傷」を見る。
    const kA = [0], kB = [0, 6];
    const a = notesOf(genBass(BF, CHORDS, 11, drums(kA), { anchorLock: true }));
    const b = notesOf(genBass(BF, CHORDS, 11, drums(kB), { anchorLock: true }));
    const kickTimes = new Set<number>();
    for (let bar = 0; bar < 4; bar++) for (const k of [...kA, ...kB]) kickTimes.add(bar * 4 + k * SLOT);
    const free = (ns: Note[]) => ns.filter((n) => !kickTimes.has(n.start)).map((n) => `${n.start}:${n.pitch}`);
    expect(free(a).length).toBeGreaterThan(0); // 空虚さの自己診断＝比べる対象が実在する
    expect(free(b)).toEqual(free(a));
  });

  it("INV3：全ノートが低域窓 [33,48] の中・dur>0・start 昇順（構造バリデータの前段）", () => {
    const n = notesOf(genBass(BF, CHORDS, 11, DR, { anchorLock: true }));
    expect(n.length).toBeGreaterThan(0);
    for (const x of n) {
      expect(x.pitch).toBeGreaterThanOrEqual(33);
      expect(x.pitch).toBeLessThanOrEqual(48);
      expect(x.dur).toBeGreaterThan(0);
    }
    for (let i = 1; i < n.length; i++) expect(n[i]!.start).toBeGreaterThanOrEqual(n[i - 1]!.start);
  });

  it("INV4：音は重ならない（レガートで次オンセットの手前まで）", () => {
    const n = notesOf(genBass(BF, CHORDS, 11, DR, { anchorLock: true }));
    for (let i = 1; i < n.length; i++) expect(n[i - 1]!.start + n[i - 1]!.dur).toBeLessThanOrEqual(n[i]!.start + 1e-9);
  });

  it("INV5：step 粒度のコード読み＝1拍1コードでも古いルートを掴まない", () => {
    // 1拍1コード（Am F C G を1拍ずつ）＝拍量子化していると2拍目以降のキック錨が Am のまま残る
    const fast = [
      { root: 9, quality: "min", start: 0, dur: 1 }, { root: 5, quality: "", start: 1, dur: 1 },
      { root: 0, quality: "", start: 2, dur: 1 }, { root: 7, quality: "", start: 3, dur: 1 },
    ];
    const kick = [0, 4, 8, 12];
    const n = notesOf(genBass({ meter: "4/4", bars: 1 }, fast, 11, drums(kick), { anchorLock: true }));
    const pcAt = (t: number) => { const c = fast.find((x) => x.start <= t && t < x.start + x.dur)!; return c.root % 12; };
    for (const k of kick) {
      const t = k * SLOT;
      const hit = n.find((x) => Math.abs(x.start - t) < 1e-9);
      expect(hit, `kick step ${k} に錨が無い`).toBeDefined();
      expect(((hit!.pitch % 12) + 12) % 12).toBe(pcAt(t));
    }
  });

  it("style と併用できる（体が style 型の格子に変わる）／kickLock とは排他（anchorLock が勝つ）", () => {
    const plain = notesOf(genBass(BF, CHORDS, 11, DR, { anchorLock: true }));
    const styled = notesOf(genBass(BF, CHORDS, 11, DR, { anchorLock: true, style: "RK-GALLOP" }));
    expect(styled.map((n) => n.start)).not.toEqual(plain.map((n) => n.start)); // 体が変わる＝併用が効いている
    // kickLock を足しても anchorLock の出力は変わらない＝二重適用しない（排他）
    expect(genBass(BF, CHORDS, 11, DR, { anchorLock: true, kickLock: 0.8 })).toStrictEqual(genBass(BF, CHORDS, 11, DR, { anchorLock: true }));
    // style 型でも全キックに錨（被覆率=1）
    const cov = anchorCoverage(styled, [0, 6, 8, 14], 4);
    expect(cov.coverage).toBe(1);
  });
});

// ── ③ 変異検査（出力に故障を注入＝落ちる不変条件が1つ以上あること） ──────────────
describe("変異検査（gate・§6-4 の 6＝この段で有効な変異は出力に注入する）", () => {
  const kick = [0, 6, 8, 14];
  const base = () => notesOf(genBass(BF, CHORDS, 11, drums(kick), { anchorLock: true })).map((n) => ({ ...n }));

  it("陽性対照：無傷の出力は INV1（被覆率=1）を通る", () => {
    expect(anchorCoverage(base(), kick, 4).coverage).toBe(1);
  });

  it("m4 錨を1つ削る → INV1 が落ちる", () => {
    const n = base();
    const idx = n.findIndex((x) => Math.abs(x.start - 6 * SLOT) < 1e-9); // bar0 の step6 の錨
    expect(idx).toBeGreaterThanOrEqual(0);
    n.splice(idx, 1);
    expect(anchorCoverage(n, kick, 4).coverage).toBeLessThan(1);
  });

  it("m2 錨を1半音ずらす → INV1 が落ちる", () => {
    const n = base();
    const hit = n.find((x) => Math.abs(x.start - 8 * SLOT) < 1e-9)!;
    hit.pitch += 1;
    expect(anchorCoverage(n, kick, 4).coverage).toBeLessThan(1);
  });

  it("m5 seed を無視する → seed 依存の不変条件が落ちる（型のジャンル選抜・既定 fig 経路）", () => {
    // anchorLock 経路そのものは**意図的に RNG を消費しない**（源流も決定的）＝seed で骨は動かない。
    // seed を無視する故障を捕まえるのは (i) ジャンル名指定の型選抜（anchorLock でも seed を読む）と
    // (ii) 既定 fig 経路。この2つを不変条件として置く（「seed 無視でも同じ」は嘘になるので書かない）。
    const s1 = notesOf(genBass(BF, CHORDS, 1, drums(kick), { anchorLock: true, style: "rock" }));
    const s2 = notesOf(genBass(BF, CHORDS, 4, drums(kick), { anchorLock: true, style: "rock" }));
    expect(JSON.stringify(s2)).not.toBe(JSON.stringify(s1)); // seed で体（型）が変わる
    const d1 = notesOf(genBass(BF, CHORDS, 1, null));
    const d2 = notesOf(genBass(BF, CHORDS, 4, null));
    expect(JSON.stringify(d2)).not.toBe(JSON.stringify(d1)); // 既定経路は seed で変わる
  });
});
