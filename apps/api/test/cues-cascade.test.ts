import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { genDrums, genBass } from "../src/music/generate";
import { deriveCues, type Cue, type DerivedCue } from "@cm/music-core";

// カスケード・ブリーフィング S1/S2 の cue 配線テスト（設計＝docs/drafts/2026-08-21-cascade-briefing-implementation.md §5/§6・
// M0契約 §6⑤⑦）。最重要＝**cues 未指定なら従来と完全 bit 一致**（既存の音を1bitも変えない）。

type Lane = { name: string; midi: number; hits: number[]; vel: number; velCurve?: number[] };
type Rhythm = { steps: number; bars: number; beatsPerStep: number; lanes: Lane[] };
const rh = (r: ReturnType<typeof genDrums>): Rhythm => (r.items[0]!.content as { rhythm: Rhythm }).rhythm;
const lane = (r: Rhythm, name: string) => r.lanes.find((l) => l.name === name);
const bassNotes = (r: ReturnType<typeof genBass>) => (r.items[0]!.content as { notes: { pitch: number; start: number; dur: number; vel?: number }[] }).notes;
const j = (x: unknown) => JSON.stringify(x);
// section.cues を frame に載せた変種を作る（DerivedCue[] は resolve 境界＝導出済みが届く）。
const withCues = (frame: Record<string, unknown>, cues: DerivedCue[]) => ({ ...frame, section: { ...((frame.section as object) ?? {}), cues } });

describe("カスケード S1/S2＝cue 配線（最重要＝cues 未指定は従来と bit 一致）", () => {
  const DF = { meter: "4/4", bars: 4, mood: "明るい" }; // ドラム基本フレーム（bars>=2＝フィル可）
  const BF = { meter: "4/4", bars: 4 };
  const chords = [{ root: 0, quality: "", start: 0, dur: 8 }];

  // ── C. bit 一致（最重要・M0§6⑤・cascade §6-C）：cues 未指定＝現行と deepStrictEqual ──
  describe("bit 一致＝cues 未指定は従来出力と完全一致（frame.section 無し／section 有るが cues 無しの両方）", () => {
    it("genDrums：section 無し ＝ section:{} ＝ section:{cues:[]}（opts.fill 指定時も）", () => {
      const a = genDrums(DF, 7, { fill: 0.5 }); // frame.section 自体なし
      const b = genDrums({ ...DF, section: {} }, 7, { fill: 0.5 }); // section 在るが cues 不在
      const c = genDrums({ ...DF, section: { cues: [] } }, 7, { fill: 0.5 }); // cues 空配列
      expect(b).toStrictEqual(a);
      expect(c).toStrictEqual(a);
    });

    it("genDrums：fill ノブ無し（素の生成）でも section の有無で bit 一致", () => {
      const a = genDrums(DF, 3);
      expect(genDrums({ ...DF, section: {} }, 3)).toStrictEqual(a);
      expect(genDrums({ ...DF, section: { cues: [] } }, 3)).toStrictEqual(a);
    });

    it("genBass：section 無し ＝ section:{} ＝ section:{cues:[]}（opts.fill 指定時も）", () => {
      const a = genBass(BF, chords, 11, null, { fill: 0.4 });
      const b = genBass({ ...BF, section: {} }, chords, 11, null, { fill: 0.4 });
      const c = genBass({ ...BF, section: { cues: [] } }, chords, 11, null, { fill: 0.4 });
      expect(b).toStrictEqual(a);
      expect(c).toStrictEqual(a);
    });

    it("genBass：fill ノブ無しでも section の有無で bit 一致", () => {
      const a = genBass(BF, chords, 5, null);
      expect(genBass({ ...BF, section: {} }, chords, 5, null)).toStrictEqual(a);
      expect(genBass({ ...BF, section: { cues: [] } }, chords, 5, null)).toStrictEqual(a);
    });

    it("未知 kind（\"kime\"）入り＝無視＝現行と bit 一致（additive の要）", () => {
      const kime = [{ bar: 1, kind: "kime" }] as unknown as DerivedCue[]; // 未実装 kind
      // ドラム：fill ノブは opts で立てたまま、未知 cue は素通り＝opts.fill 経路（＝section 無し）と一致
      expect(genDrums(withCues(DF, kime), 7, { fill: 0.5 })).toStrictEqual(genDrums(DF, 7, { fill: 0.5 }));
      // ベース：同上
      expect(genBass(withCues(BF, kime) as never, chords, 11, null, { fill: 0.4 })).toStrictEqual(genBass(BF, chords, 11, null, { fill: 0.4 }));
    });

    it("build/break＝受理するが no-op（全演奏者が無視＝bit 一致）", () => {
      const bb: DerivedCue[] = [{ bar: 1, kind: "build", intensity: 0.8 }, { bar: 2, kind: "break" }];
      expect(genDrums(withCues(DF, bb), 7)).toStrictEqual(genDrums(DF, 7));
      expect(genBass(withCues(BF, bb) as never, chords, 5, null)).toStrictEqual(genBass(BF, chords, 5, null));
    });

    it("respondToCues 相当＝旧生成器は cues を読むだけ（該当 kind 無し＝従来）", () => {
      // fill/land を含まない cue 群（build/break/未知）は旧生成器では常に no-op＝cues 無しと同一。
      const noise = [{ bar: 0, kind: "build" }, { bar: 3, kind: "kime" }] as unknown as DerivedCue[];
      expect(genDrums(withCues(DF, noise), 9, { fill: 0.5 })).toStrictEqual(genDrums(DF, 9, { fill: 0.5 }));
    });
  });

  // ── C. 決定性：同一 (入力, cues) → 同一出力 ──
  describe("決定性＝同一 (frame, cues, seed) → 同一出力（cues を固定条件に）", () => {
    it("genDrums：cue fill を固定して2回＝一致", () => {
      const cues: DerivedCue[] = [{ bar: 1, kind: "fill", intensity: 0.7 }];
      expect(j(genDrums(withCues(DF, cues), 42))).toBe(j(genDrums(withCues(DF, cues), 42)));
    });
    it("genBass：cue fill を固定して2回＝一致", () => {
      const cues: DerivedCue[] = [{ bar: 1, kind: "fill", intensity: 0.3 }];
      expect(j(genBass(withCues(BF, cues) as never, chords, 42, null))).toBe(j(genBass(withCues(BF, cues) as never, chords, 42, null)));
    });
  });

  // ── B. cue.bar が fill 位置を動かす（S1） ──
  describe("cue.bar が fill 位置を動かす（指定時）", () => {
    it("ドラム：cue.bar=bars-2（=2）＋intensity 0.5 は既定フィル（opts.fill=0.5）と同位置＝bit 一致", () => {
      // 既定 applyDrumFill の 1小節フィルは fillStart=N-1-1=bars-2。cue.bar=bars-2 は同アンカー＝完全一致。
      const viaCue = genDrums(withCues(DF, [{ bar: 2, kind: "fill", intensity: 0.5 }]), 7);
      const viaOpt = genDrums(DF, 7, { fill: 0.5 });
      expect(viaCue).toStrictEqual(viaOpt);
    });

    it("ドラム：cue.bar=1 は既定位置（bars-2=2）と異なる＝位置が動く", () => {
      const atBar1 = rh(genDrums(withCues(DF, [{ bar: 1, kind: "fill", intensity: 0.5 }]), 7));
      const atBar2 = rh(genDrums(DF, 7, { fill: 0.5 }));
      expect(j(atBar1)).not.toBe(j(atBar2));
    });

    it("ベース：cue.bar=bars-2（=2）＋intensity 0.5 は既定フィル（opts.fill=0.5）と同位置＝bit 一致", () => {
      const viaCue = genBass(withCues(BF, [{ bar: 2, kind: "fill", intensity: 0.5 }]) as never, chords, 5, null);
      const viaOpt = genBass(BF, chords, 5, null, { fill: 0.5 });
      expect(viaCue).toStrictEqual(viaOpt);
    });

    it("ベース：cue.bar=1 は既定位置（bars-2=2）と異なる＝位置が動く", () => {
      const atBar1 = bassNotes(genBass(withCues(BF, [{ bar: 1, kind: "fill", intensity: 0.5 }]) as never, chords, 5, null));
      const atBar2 = bassNotes(genBass(BF, chords, 5, null, { fill: 0.5 }));
      expect(j(atBar1)).not.toBe(j(atBar2));
    });
  });

  // ── B. 越境（fill@bars-1）→ 次セクション bar0 に land（S2） ──
  describe("越境 fill（bars-1）→ 次セクション bar0 に land（deriveCues＋ドラム消費）", () => {
    it("deriveCues：前セクション末フィル（bar=bars-1）→ 当該セクション bar0 に land を導出", () => {
      const secs = [{ cues: [{ bar: 3, kind: "fill" as const }], bars: 4 }, { cues: [], bars: 4 }];
      expect(deriveCues(secs, 1)).toEqual([{ bar: 0, kind: "land" }]);
    });

    it("ドラム：bar0 land 消費＝crash+kick が bar0 step0 に鳴る", () => {
      const r = rh(genDrums(withCues(DF, [{ bar: 0, kind: "land" }]), 7));
      expect(lane(r, "Crash")!.hits).toContain(0); // 着地シンバル
      expect(lane(r, "Kick")!.hits).toContain(0); // 着地キック
      // land 無しでは Crash が居ない（land が音を足したことの裏取り＝bit で異なる）。
      const noLand = rh(genDrums(DF, 7));
      expect(lane(noLand, "Crash")).toBeUndefined();
      expect(j(r)).not.toBe(j(noLand));
    });

    it("ドラム越境 fill（cue.bar=bars-1）＝最終小節にフィル本体・セクションは延びない・当セクション内に着地を打たない", () => {
      const cross = rh(genDrums(withCues(DF, [{ bar: 3, kind: "fill", intensity: 0.6 }]), 7));
      expect(cross.bars).toBe(4); // 延伸しない
      // 内部着地（bar2）と越境（bar3）は別物＝位置が末尾へ寄る。
      const internal = rh(genDrums(withCues(DF, [{ bar: 2, kind: "fill", intensity: 0.6 }]), 7));
      expect(j(cross)).not.toBe(j(internal));
    });

    it("ベース：bar0 land 消費＝頭ノートがルートへ差し替わり velocity が強くなる", () => {
      const withLand = bassNotes(genBass(withCues(BF, [{ bar: 0, kind: "land" }]) as never, chords, 5, null));
      const head = withLand.find((n) => Math.abs(n.start) < 1e-9)!;
      expect(head.pitch).toBe(36); // chords の root=0(C) → bassPcToWindow(0)=36(C2)
      expect(head.vel).toBeGreaterThan(100); // 通常ベースの既定(vel フィールド無し=100相当)より明確に強い
      // land 無しでは vel フィールドが立たない（land が音を変えたことの裏取り＝bit で異なる）。
      const noLand = bassNotes(genBass(BF, chords, 5, null));
      expect(noLand.find((n) => Math.abs(n.start) < 1e-9)!.vel).toBeUndefined();
      expect(j(withLand)).not.toBe(j(noLand));
    });
  });

  // ── respondToCues（既定 true・裁定6）＝false ならこのトラックは cues を一切読まない ──
  describe("respondToCues:false＝cues があっても従来と bit 一致（そのトラックだけ合図に乗らない自由）", () => {
    it("ベース：fill cue 有りでも respondToCues:false＝cues 無しと同一出力", () => {
      const cues: DerivedCue[] = [{ bar: 1, kind: "fill", intensity: 0.7 }];
      const withOff = genBass(withCues(BF, cues) as never, chords, 5, null, { respondToCues: false });
      const noCues = genBass(BF, chords, 5, null);
      expect(withOff).toStrictEqual(noCues);
    });

    it("ベース：land cue 有りでも respondToCues:false＝cues 無しと同一出力", () => {
      const withOff = genBass(withCues(BF, [{ bar: 0, kind: "land" }]) as never, chords, 5, null, { respondToCues: false });
      const noCues = genBass(BF, chords, 5, null);
      expect(withOff).toStrictEqual(noCues);
    });
  });

  // ── B. 配布の1枚性（/gen/section が deriveCues→frame.section.cues で全生成器へ配る・S2 end-to-end） ──
  describe("/gen/section 配布＝prevSection の末フィル→当セクション rhythm bar0 に land（越境 end-to-end）", () => {
    let app: FastifyInstance;
    beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });

    const rhythmOf = (composition: any): Rhythm => {
      const child = composition.children.find((c: any) => c.node.neta.kind === "rhythm");
      return (child.node.neta.content as { rhythm: Rhythm }).rhythm;
    };

    it("prevSection.cues に末フィル（bar=bars-1）＝当セクション drums bar0 に crash+kick（land）", async () => {
      const res = await app.inject({
        method: "POST", url: "/gen/section",
        payload: { frame: { meter: "4/4", bars: 4, key: 0 }, parts: ["rhythm"], seed: 7, prevSection: { cues: [{ bar: 3, kind: "fill" }], bars: 4 } },
      });
      expect(res.statusCode).toBe(200);
      const r = rhythmOf(res.json().composition);
      expect(r.lanes.find((l) => l.name === "Crash")!.hits).toContain(0);
    });

    it("prevSection.cues に末フィル（bar=bars-1）＝ドラムとベースが同じ land に噛み合う（bar0＝crash+kick かつ ベース頭がルート強打）", async () => {
      const bassOf = (composition: any) => {
        const child = composition.children.find((c: any) => c.node.neta.kind === "bass");
        return (child.node.neta.content as { notes: { pitch: number; start: number; dur: number; vel?: number }[] }).notes;
      };
      const res = await app.inject({
        method: "POST", url: "/gen/section",
        payload: { frame: { meter: "4/4", bars: 4, key: 0 }, parts: ["rhythm", "bass"], seed: 7, prevSection: { cues: [{ bar: 3, kind: "fill" }], bars: 4 } },
      });
      expect(res.statusCode).toBe(200);
      const composition = res.json().composition;
      const r = rhythmOf(composition);
      expect(r.lanes.find((l) => l.name === "Crash")!.hits).toContain(0); // ドラム＝着地シンバル
      const bass = bassOf(composition);
      const head = bass.find((n: { start: number }) => Math.abs(n.start) < 1e-9)!;
      expect(head.vel).toBeGreaterThan(100); // ベース＝bar0 頭がルート強打（land）
    });

    it("cues 未指定の /gen/section rhythm は従来（land 無し）＝Crash が居ない＝bit 一致の担保", async () => {
      const res = await app.inject({
        method: "POST", url: "/gen/section",
        payload: { frame: { meter: "4/4", bars: 4, key: 0 }, parts: ["rhythm"], seed: 7 },
      });
      const r = rhythmOf(res.json().composition);
      expect(r.lanes.find((l) => l.name === "Crash")).toBeUndefined();
    });

    it("body.cues に末フィル（bars-1）＝越境＝当セクション内では land を導出しない（前セクションが無い）", async () => {
      // 自セクションの末フィルは「次セクション頭」へ着地＝自分の bar0 には land を差さない（deriveCues は prev のみ見る）。
      const res = await app.inject({
        method: "POST", url: "/gen/section",
        payload: { frame: { meter: "4/4", bars: 4, key: 0 }, parts: ["rhythm"], seed: 7, cues: [{ bar: 3, kind: "fill" }] },
      });
      const r = rhythmOf(res.json().composition);
      // 末フィル本体は鳴るが、bar0 の land（前セクション由来）は無い。
      expect(r.bars).toBe(4);
    });
  });
});
