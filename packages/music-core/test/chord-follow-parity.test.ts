// py-parity（M3-3b）＝phrase_maker `chord_follow` の5ガードとのデータ一致。
// 参照値＝`tools/py-parity/cases-chord-follow/*.json`（`tools/py-parity/run_dump_chord_follow.sh` が焼く・コミット済み）。
//
// なぜデータ一致を主張してよいか（計画 §6-1 の2行目）：`chord_follow` の base line と diverge は RNG 0件
// （`networkx` は `solve_fingering` のメトリクス用に import されているだけで音の経路では未使用）。
// ＝`build_line`＋`apply_boundaries` は純関数だから列で突き合わせられる。
import { describe, it, expect } from "vitest";
import {
  buildChordFollowLine, applyBoundaries, validateChordFollow, scaleOffsets, scaleOrigin,
  PM_CHORD_TONES, remapDeg,
} from "../src/chordFollow";
import { loadCfCase, listCfCaseIds, type CfParityCase } from "./pyParityChordFollow";

type Run = { rows: { step: number; pitch: number; kind: string; anchor: boolean; role: string; strong: boolean }[]; approaches: number[] };

/** 源流と同じ順で回す：build_line（①強拍コードトーン強制＋度数 remap）→ apply_boundaries（③区間末の接近音化）。 */
function run(c: CfParityCase): Run {
  const { onsets, pitches } = buildChordFollowLine(c.cells, c.segs, c.totalSteps, c.window);
  const approaches = applyBoundaries(onsets, pitches, c.segs, c.window, c.loop);
  return {
    rows: onsets.map((o, i) => ({ step: o.step, pitch: pitches[i]!, kind: o.kind, anchor: o.anchor, role: o.role, strong: o.strong })),
    approaches,
  };
}

describe("py-parity スモーク（3b＝ここが動かないと chord_follow の受け入れが実行できない）", () => {
  it("pedal_answer × Am F C G が Python と列一致（step/pitch/kind/anchor/role/strong）", () => {
    const c = loadCfCase("pedal_answer__amfcg__loopA");
    expect(c.progression).toBe("Am F C G");
    const r = run(c);
    expect(r.rows).toEqual(c.expected.map((e) => ({ step: e.step, pitch: e.pitch, kind: e.kind, anchor: e.anchor, role: e.role, strong: e.strong })));
    expect(r.approaches).toEqual(c.approaches);
  });
});

describe("py-parity ケース表（grammar 3型 × 進行6本 × loop 2）", () => {
  const ids = listCfCaseIds();
  it("ケース表がコミットされている（36件）", () => {
    expect(ids.length).toBe(36);
  });
  for (const id of ids) {
    it(`一致：${id}`, () => {
      const c = loadCfCase(id);
      const r = run(c);
      expect(r.rows).toEqual(c.expected.map((e) => ({ step: e.step, pitch: e.pitch, kind: e.kind, anchor: e.anchor, role: e.role, strong: e.strong })));
      expect(r.approaches).toEqual(c.approaches);
    });
  }
});

describe("層B のスケール表が源流と一致（＝表の移植そのものの検算・§6-4 #5 抜き打ち）", () => {
  it("全ケースの全区間で `scale_offsets()` が一致（源流 core/chordlib.py の SCALE をそのまま持ってきた証拠）", () => {
    let checked = 0;
    for (const id of listCfCaseIds()) {
      const c = loadCfCase(id);
      c.segs.forEach((s, i) => {
        const mine = [...scaleOffsets(s.chord.quality, s.chord.tones)].sort((a, b) => a - b);
        expect(mine, `${id} seg${i} (${s.chord.quality})`).toEqual(c.scaleOffsets[i]);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(50); // 被覆＝この検算が空虚でない
  });

  it("コードトーン表も源流と一致（層B 25 クオリティ）", () => {
    for (const id of listCfCaseIds()) {
      const c = loadCfCase(id);
      for (const s of c.segs) {
        const mine = PM_CHORD_TONES[s.chord.quality];
        expect(mine, s.chord.quality).toBeDefined();
        expect([...mine!], s.chord.quality).toEqual([...s.chord.tones]);
      }
    }
  });
});

describe("validate（源流 chord_follow.validate）のメトリクスも一致", () => {
  for (const id of listCfCaseIds()) {
    it(`メトリクス一致：${id}`, () => {
      const c = loadCfCase(id);
      const { onsets, pitches } = buildChordFollowLine(c.cells, c.segs, c.totalSteps, c.window);
      applyBoundaries(onsets, pitches, c.segs, c.window, c.loop);
      const m = validateChordFollow(onsets, pitches, c.segs, c.window, c.loop);
      expect({
        strongTotal: m.strongTotal, strongHit: m.strongHit, strongRate: m.strongRate,
        nonInteg: m.nonInteg.length, passing: m.passing.length, unplayable: m.unplayable.length,
        boundaryTotal: m.boundaryTotal, boundaryOk: m.boundaryOk,
      }).toEqual(c.metrics);
    });
  }
});

describe("陰性対照（§6-4 の 4＝比較が空虚でないことを見る）", () => {
  it("ルートを1半音ずらすと参照値と一致しなくなる（一致が偶然でない）", () => {
    const c = loadCfCase("pedal_answer__amfcg__loopA");
    const moved = { ...c, segs: c.segs.map((s) => ({ ...s, chord: { ...s.chord, rootPc: (s.chord.rootPc + 1) % 12 } })) };
    expect(run(moved).rows).not.toEqual(run(c).rows);
  });

  it("`altered` 進行（aug/dim7/m7b5/7b9）は remap_deg の5度族分岐を実際に踏む＝♮5 が出ない", () => {
    const c = loadCfCase("octave_call_response__altered__loopA");
    // 源流の主張＝「5度族（P5/P4/blue b5）はそのコードの**実際の**5度へ流す」。aug の♮5(=7)は出ない。
    const aug = c.segs.find((s) => s.chord.quality === "aug")!;
    expect(remapDeg(7, aug.chord, false)).toBe(8);   // aug＝#5
    const dim7 = c.segs.find((s) => s.chord.quality === "dim7")!;
    expect(remapDeg(7, dim7.chord, false)).toBe(6);  // dim7＝b5
    // ケース自体も一致している（表だけでなく線でも踏んでいる）
    expect(run(c).rows).toEqual(c.expected.map((e) => ({ step: e.step, pitch: e.pitch, kind: e.kind, anchor: e.anchor, role: e.role, strong: e.strong })));
  });

  it("スケールの出所ラベルが正しい（源流由来／こちらで補った／既定）", () => {
    expect(scaleOrigin("dom7")).toBe("phrase_maker-layerB");  // 層Bの名前
    expect(scaleOrigin("7")).toBe("phrase_maker-layerB");     // otomemo の名前→層B
    expect(scaleOrigin("maj7#11")).toBe("otomemo-derived");   // 層Bに無い8キー
    expect(scaleOrigin("zzz")).toBe("fallback");
  });
});
