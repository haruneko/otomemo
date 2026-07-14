import { describe, it, expect, vi } from "vitest";
import { validateNotes, attachStructureWarnings } from "../src/music/structureValidator";
import { genMelody } from "../src/music/generate";

// 生成後の構造バリデータ（2026-07-15・統計監査の是正）。E-rule が素通しする構造欠陥（dur<=0/重複onset/範囲外）
// を機械的に検出する純関数＋GenResult への警告添付（弾かず・直さず・警告のみ）。

describe("validateNotes（純関数＝各違反種別を検出）", () => {
  const clean = [
    { pitch: 60, start: 0, dur: 1 },
    { pitch: 62, start: 1, dur: 1 },
    { pitch: 64, start: 2, dur: 2 },
  ];

  it("正常ノート＝ok:true・violations 空", () => {
    const r = validateNotes(clean, { bars: 1, bpb: 4 });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("dur<=0（0/負/未指定）＝dur_nonpositive を検出", () => {
    for (const bad of [0, -0.5, undefined]) {
      const notes = [{ pitch: 60, start: 0, dur: bad as number }];
      const r = validateNotes(notes, { bars: 1, bpb: 4 });
      expect(r.ok, `dur=${bad}`).toBe(false);
      expect(r.violations.map((v) => v.kind)).toContain("dur_nonpositive");
    }
  });

  it("同時刻・同pitch の重複＝duplicate を検出（後着 index）", () => {
    const notes = [
      { pitch: 60, start: 0.25, dur: 0.25 },
      { pitch: 60, start: 0.25, dur: 0.25 }, // 同時刻・同pitch＝幽霊/ユニゾン潰れ
    ];
    const r = validateNotes(notes, { bars: 1, bpb: 4 });
    expect(r.ok).toBe(false);
    const dup = r.violations.find((v) => v.kind === "duplicate");
    expect(dup?.index).toBe(1); // 後着を違反に
  });

  it("同時刻でも pitch が違えば重複でない（和音的な同時発音は許容）", () => {
    const notes = [
      { pitch: 60, start: 0, dur: 1 },
      { pitch: 64, start: 0, dur: 1 },
    ];
    const r = validateNotes(notes, { bars: 1, bpb: 4 });
    expect(r.violations.some((v) => v.kind === "duplicate")).toBe(false);
  });

  it("小節範囲外の start＝out_of_bar_range を検出（前後端）", () => {
    // bars=2,bpb=4 → 総拍長8。負start・start>=8 は範囲外。
    const notes = [
      { pitch: 60, start: -0.5, dur: 1 }, // 負（既定 minStart=0）
      { pitch: 62, start: 8, dur: 1 }, // 末尾以降＝始まる余地なし
      { pitch: 64, start: 7.5, dur: 1 }, // 範囲内
    ];
    const r = validateNotes(notes, { bars: 2, bpb: 4 });
    const oob = r.violations.filter((v) => v.kind === "out_of_bar_range").map((v) => v.index);
    expect(oob).toContain(0);
    expect(oob).toContain(1);
    expect(oob).not.toContain(2);
  });

  it("minStart で負start（弱起）を許容できる", () => {
    const notes = [{ pitch: 60, start: -0.5, dur: 0.5 }];
    expect(validateNotes(notes, { bars: 1, bpb: 4 }).ok).toBe(false); // 既定は負を弾く
    expect(validateNotes(notes, { bars: 1, bpb: 4, minStart: -1 }).ok).toBe(true); // 明示で許容
  });

  it("音域外の pitch＝pitch_out_of_range を検出（pitchRange 指定時のみ）", () => {
    const notes = [{ pitch: 40, start: 0, dur: 1 }];
    expect(validateNotes(notes, { bars: 1, bpb: 4 }).ok).toBe(true); // 未指定＝音域検査なし
    const r = validateNotes(notes, { bars: 1, bpb: 4, pitchRange: [48, 84] });
    expect(r.violations.map((v) => v.kind)).toContain("pitch_out_of_range");
  });

  it("複数違反を同時に列挙する", () => {
    const notes = [
      { pitch: 60, start: 0, dur: 0 }, // dur<=0
      { pitch: 200, start: 0, dur: 1 }, // 音域外
    ];
    const r = validateNotes(notes, { bars: 1, bpb: 4, pitchRange: [0, 127] });
    const kinds = new Set(r.violations.map((v) => v.kind));
    expect(kinds.has("dur_nonpositive")).toBe(true);
    expect(kinds.has("pitch_out_of_range")).toBe(true);
  });
});

describe("attachStructureWarnings（GenResult への警告添付＝弾かず・直さず）", () => {
  it("違反ノートで meta.structureWarnings が積まれ・console.warn が出る・ノートは不変", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = {
      items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 0 }] }, label: "案1" }],
      edges: [] as never[],
    };
    const before = JSON.stringify(res.items[0]!.content);
    attachStructureWarnings(res as never, { bars: 1, bpb: 4, pitchRange: [0, 127] });
    expect((res as { meta?: { structureWarnings?: string[] } }).meta?.structureWarnings?.length).toBeGreaterThan(0);
    expect(warnSpy).toHaveBeenCalled();
    expect(JSON.stringify(res.items[0]!.content), "候補ノートは修復されない（不変）").toBe(before);
    warnSpy.mockRestore();
  });

  it("正常な items では meta を触らない（キー無し＝従来 bit 一致）", () => {
    const res = { items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] }, label: "案1" }], edges: [] as never[] };
    attachStructureWarnings(res as never, { bars: 1, bpb: 4, pitchRange: [0, 127] });
    expect((res as { meta?: unknown }).meta).toBeUndefined();
  });

  it("検査対象 kind でなければスキップ（drums/chord_progression は notes 検査しない）", () => {
    const res = { items: [{ kind: "drums", content: { rhythm: {} }, label: "d" }], edges: [] as never[] };
    attachStructureWarnings(res as never, { bars: 1, bpb: 4 });
    expect((res as { meta?: unknown }).meta).toBeUndefined();
  });
});

describe("結線の煙テスト：正常生成で structureWarnings 空（回帰＝生成物が構造健全）", () => {
  const chords = [
    { root: 0, quality: "maj7", start: 0, dur: 4 },
    { root: 9, quality: "min7", start: 4, dur: 4 },
    { root: 5, quality: "maj7", start: 8, dur: 4 },
    { root: 7, quality: "7", start: 12, dur: 4 },
  ];
  it("gen_melody（V2）を多seed・多ノブで生成→全て構造警告ゼロ", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const o of [{}, { density: 0.85, runs: 0.7 }, { finest: "eighth" as const }, { pickup: 1 }]) {
        const res = genMelody({ key: 0, bars: 4, meter: "4/4" }, chords, seed, { useV2: true, ...o });
        attachStructureWarnings(res, { bars: 4, bpb: 4, pitchRange: [0, 127] });
        expect(res.meta?.structureWarnings, `seed=${seed} opts=${JSON.stringify(o)}`).toBeUndefined();
      }
    }
  });
});
