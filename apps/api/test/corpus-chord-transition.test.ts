import { describe, it, expect } from "vitest";
import { openDb } from "../src/db";
import {
  chordTok,
  buildChordTransitions,
  ingestChordTransitions,
  hasChordTransitions,
  loadChordTransitions,
  transitionWeights,
  type ChordTransitionModel,
} from "../src/music/corpusStats";
import { nextChordCandidates } from "../src/music/continuation";
import { genChords } from "../src/music/generate";

// (D) コード遷移統計（#21拡張・design「コーパス遷移統計テーブル 第2弾」＋緊張補強）。
// 思想＝頻度は idiom バイアスであってランカーでない。正当性は文法・緊張は構造層+スパイス。ここは地の手癖のみ。

describe("(D) chordTok / buildChordTransitions（純関数・集計）", () => {
  it("chordTok＝度数+正準品質・> を含まない・負値も安全", () => {
    expect(chordTok({ root: 0, quality: "" })).toBe("0q"); // I
    expect(chordTok({ root: 9, quality: "m" })).toBe("9qm"); // vi
    expect(chordTok({ root: 7, quality: "7" })).toBe("7q7"); // V7
    expect(chordTok({ root: -3, quality: "m" })).toBe("9qm"); // -3→9
  });

  it("bigram/trigram を進行 count で重み付け集計", () => {
    const rows = buildChordTransitions([
      { chords: [{ root: 0, quality: "" }, { root: 7, quality: "" }, { root: 9, quality: "m" }], mode: "major", count: 3 },
    ]);
    const big = rows.filter((r) => r.ngram === 2);
    expect(big).toContainEqual({ mode: "major", ngram: 2, from_ctx: "0q", to_tok: "7q", count: 3 });
    expect(big).toContainEqual({ mode: "major", ngram: 2, from_ctx: "7q", to_tok: "9qm", count: 3 });
    const tri = rows.filter((r) => r.ngram === 3);
    expect(tri).toContainEqual({ mode: "major", ngram: 3, from_ctx: "0q>7q", to_tok: "9qm", count: 3 });
  });

  it("複数進行は同遷移のカウントを加算", () => {
    const rows = buildChordTransitions([
      { chords: [{ root: 0, quality: "" }, { root: 7, quality: "" }], count: 2 },
      { chords: [{ root: 0, quality: "" }, { root: 7, quality: "" }], count: 5 },
    ]);
    expect(rows.find((r) => r.ngram === 2 && r.from_ctx === "0q" && r.to_tok === "7q")!.count).toBe(7);
  });

  it("count 未指定は 1 として数える", () => {
    const rows = buildChordTransitions([{ chords: [{ root: 0, quality: "" }, { root: 5, quality: "" }] }]);
    expect(rows.find((r) => r.from_ctx === "0q" && r.to_tok === "5q")!.count).toBe(1);
  });
});

describe("(D) ingest / has / load（在DB round-trip・追加のみ）", () => {
  it("has は投入前 false・投入後 true／load が count 降順 bigram を戻す", () => {
    const db = openDb(":memory:");
    expect(hasChordTransitions(db)).toBe(false);
    const rows = buildChordTransitions([
      { chords: [{ root: 0, quality: "" }, { root: 7, quality: "" }, { root: 5, quality: "" }], mode: "major", count: 4 },
      { chords: [{ root: 0, quality: "" }, { root: 9, quality: "m" }], mode: "major", count: 1 },
    ]);
    ingestChordTransitions(db, rows, "pop");
    expect(hasChordTransitions(db)).toBe(true);
    const model = loadChordTransitions(db, "pop", "major");
    const from0 = model.bigram.get("0q")!;
    expect(from0[0]).toEqual(["7q", 4]); // 最頻が先頭
    expect(from0.find((e) => e[0] === "9qm")).toEqual(["9qm", 1]);
  });

  it("ingest は冪等（同 PK は上書き＝重複しない）", () => {
    const db = openDb(":memory:");
    const rows = buildChordTransitions([{ chords: [{ root: 0, quality: "" }, { root: 7, quality: "" }], count: 3 }]);
    ingestChordTransitions(db, rows, "pop");
    ingestChordTransitions(db, rows, "pop");
    const from0 = loadChordTransitions(db, "pop", "major").bigram.get("0q")!;
    expect(from0).toEqual([["7q", 3]]); // 加算されず 1 行のまま
  });
});

describe("(D) 意外性ダイヤル transitionWeights（頻度=重み・ランカーでない）", () => {
  const entries: [string, number][] = [["7q", 40], ["9qm", 8], ["5q", 2]];
  it("低温(0.1)＝王道＝最頻が支配的", () => {
    const [w7, w9] = transitionWeights(["7q", "9qm"], entries, { temperature: 0.1 });
    expect(w7! / w9!).toBeGreaterThan(100);
  });
  it("高温(4)＝攻め＝ならされて裾が持ち上がる", () => {
    const [w7, w9] = transitionWeights(["7q", "9qm"], entries, { temperature: 4 });
    expect(w7! / w9!).toBeLessThan(3);
  });
  it("未見の正当候補も floor>0＝弾かない（正当性は文法が担う）", () => {
    const [, wUnseen] = transitionWeights(["7q", "11qdim"], entries, { temperature: 1, floor: 0.5 });
    expect(wUnseen).toBeGreaterThan(0);
  });
  it("空/未ヒットモデル＝全て等重み（一様＝素通し）", () => {
    const w = transitionWeights(["0q", "7q", "9qm"], undefined, {});
    expect(new Set(w).size).toBe(1);
  });
});

describe("(D) next_chord 結線（注入無し=bit一致・注入時=コーパス順）", () => {
  const prog = [{ degree: 0, quality: "" }]; // C(I) の後
  const base = nextChordCandidates(prog, { mode: "major", top: 4 });

  it("注入無し＝現行の機能文法順（S→D＝ii,IV,V,vii°）", () => {
    expect(base.map((c) => c.degree)).toEqual([2, 5, 7, 11]);
  });

  it("空 transitions（ctx 未ヒット）＝並び不変（degrade gracefully）", () => {
    const empty: ChordTransitionModel = { bigram: new Map(), trigram: new Map() };
    const r = nextChordCandidates(prog, { mode: "major", top: 4, transitions: empty });
    expect(r.map((c) => c.degree)).toEqual(base.map((c) => c.degree));
  });

  it("transitions 在＝コーパスカウントで並べ替え（V を最上位へ）", () => {
    const bigram = new Map<string, [string, number][]>([["0q", [["7q", 100], ["5q", 30]]]]);
    const r = nextChordCandidates(prog, { mode: "major", top: 4, transitions: { bigram, trigram: new Map() } });
    expect(r.map((c) => c.degree)).toEqual([7, 5, 2, 11]); // V(100)→IV(30)→残りは元順(ii,vii°)
  });
});

describe("(D) genChords 結線（注入無し=bit一致・注入時=手癖反映）", () => {
  const frame = { bars: 8, meter: "4/4", key: 0 };
  const SEEDS = [1, 2, 3, 7, 42, 99, 123, 777];

  it("transitions 無し＝現行と bit 一致（回帰ゼロ）", () => {
    for (const seed of SEEDS) {
      expect(JSON.stringify(genChords(frame, seed, undefined, {}))).toBe(JSON.stringify(genChords(frame, seed)));
    }
  });

  it("空モデル（ctx 未ヒット）＝bit 一致（degrade gracefully）", () => {
    const empty = { bigram: new Map<string, [string, number][]>(), trigram: new Map<string, [string, number][]>() };
    for (const seed of SEEDS) {
      expect(JSON.stringify(genChords(frame, seed, undefined, { transitions: empty }))).toBe(JSON.stringify(genChords(frame, seed)));
    }
  });

  it("コーパスモデル在＝決定的・かつ一部 seed で出力が動く（中間の手癖が効く）", () => {
    // 定番進行を高 count で仕込む＝多くの ctx で固定重み[3,2,1]と異なる選好になる。
    const rows = buildChordTransitions(
      [
        [{ root: 0, quality: "" }, { root: 7, quality: "" }, { root: 9, quality: "m" }, { root: 5, quality: "" }], // I-V-vi-IV
        [{ root: 0, quality: "" }, { root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 7, quality: "" }], // I-vi-IV-V
        [{ root: 2, quality: "m" }, { root: 7, quality: "" }, { root: 0, quality: "" }], // ii-V-I
        [{ root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 7, quality: "" }], // vi-IV-I-V
      ].map((chords) => ({ chords, mode: "major", count: 100 })),
    );
    const db = openDb(":memory:");
    ingestChordTransitions(db, rows, "pop");
    const model = loadChordTransitions(db, "pop", "major");

    let anyDiff = false;
    for (const seed of [...SEEDS, ...Array.from({ length: 20 }, (_, i) => 1000 + i)]) {
      const a = genChords(frame, seed, undefined, { transitions: model, temperature: 0.4 });
      const b = genChords(frame, seed, undefined, { transitions: model, temperature: 0.4 });
      expect(JSON.stringify(b)).toBe(JSON.stringify(a)); // 決定的（同 seed+model は同一）
      if (JSON.stringify(a) !== JSON.stringify(genChords(frame, seed))) anyDiff = true;
    }
    expect(anyDiff).toBe(true); // 少なくとも一部 seed で手癖が出力を動かす
  });
});
