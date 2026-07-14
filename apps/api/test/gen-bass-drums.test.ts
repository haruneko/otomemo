// gen_bass×ドラム結線（2026-07-10・design「gen_bass×ドラム結線」・research/2026-07-10-bass-generation-upgrade.md）。
// 契約：(a) drums無し/係数0で従来と bit 一致 (b) snareGap=スネア頭で dur を切る(onset不変)
// (c) kickLock=キック骨格(正)/逆相(負) (d) approach=チェンジ直前の接近音→次ルート着地 (e) 5度は上(root+7実音)。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { genBass, genDrums, type Frame } from "../src/music/generate";
import { attachSyncScore } from "../src/music/syncopationReport";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

type Note = { pitch: number; start: number; dur: number };
const notesOf = (r: ReturnType<typeof genBass>): Note[] => (r.items[0]!.content as { notes: Note[] }).notes;
const J = (x: unknown) => JSON.stringify(x);

// genDrums 出力と同形のドラム content（16分グリッド・Kick=36/Snare=38）。
const mkDrums = (kick: number[], snare: number[], steps = 16, beatsPerStep = 0.25) => ({
  rhythm: {
    steps,
    bars: 1,
    beatsPerStep,
    lanes: [
      { name: "Kick", midi: 36, hits: kick, vel: 115 },
      { name: "Snare", midi: 38, hits: snare, vel: 105 },
    ],
  },
});
const C1 = [{ root: 0, quality: "", start: 0, dur: 64 }]; // Cを敷き詰め
const SEEDS = [1, 2, 3, 42];

describe("(a) 既定＝従来と bit 一致（鉄則）", () => {
  const frames: Frame[] = [
    { bars: 2, meter: "4/4" },
    { bars: 4, meter: "4/4", mood: "切ない" },
    { bars: 4, meter: "4/4", mood: "明るい", tempo: 140 },
    { bars: 4, meter: "6/8" },
  ];
  it("drums を渡しても全係数0なら従来と完全一致", () => {
    for (const f of frames)
      for (const seed of SEEDS) {
        const base = J(genBass(f, C1, seed));
        const d = mkDrums([0, 8, 10], [4, 12]);
        expect(J(genBass(f, C1, seed, d, { kickLock: 0, snareGap: 0, approach: 0 })), `${f.meter}/${f.mood}#${seed}`).toBe(base);
        expect(J(genBass(f, C1, seed, d, {})), `opts空 ${f.meter}#${seed}`).toBe(base);
        expect(J(genBass(f, C1, seed, d)), `opts無し ${f.meter}#${seed}`).toBe(base);
      }
  });
  it("drums 無しなら係数を立てても全て無効＝従来と完全一致", () => {
    for (const f of frames)
      for (const seed of SEEDS) {
        const base = J(genBass(f, C1, seed));
        expect(J(genBass(f, C1, seed, undefined, { kickLock: 1, snareGap: 1, approach: 1 })), `${f.meter}#${seed}`).toBe(base);
        expect(J(genBass(f, C1, seed, null, { kickLock: -1, snareGap: 0.5, approach: 0.5 }))).toBe(base);
      }
  });
  it("6/8(compound) は kickLock/approach 対象外＝従来経路のまま", () => {
    const f: Frame = { bars: 4, meter: "6/8" };
    const d68 = mkDrums([0, 6], [6], 12, 0.25); // 12step×0.25拍=3拍=6/8の1小節
    for (const seed of SEEDS)
      expect(J(genBass(f, C1, seed, d68, { kickLock: 1, approach: 1 })), `#${seed}`).toBe(J(genBass(f, C1, seed)));
  });
  it("ドラムの steps×beatsPerStep が拍子と合わない時は kickLock 無効（防御）", () => {
    const f: Frame = { bars: 2, meter: "4/4" };
    const d68 = mkDrums([0, 6], [6], 12, 0.25); // 3拍分＝4/4と不一致
    for (const seed of SEEDS)
      expect(J(genBass(f, C1, seed, d68, { kickLock: 1 })), `#${seed}`).toBe(J(genBass(f, C1, seed)));
  });
});

describe("(b) snareGap＝スネア頭で音価を切る（onset列は不変）", () => {
  it("snareGap=1: pitch/start 不変・スネア(2,4拍)を跨ぐ音は切られる・最小dur=0.25", () => {
    const f: Frame = { bars: 4, meter: "4/4", mood: "切ない" }; // 長音が出る＝跨ぎが発生
    const d = mkDrums([0, 8], [4, 12]); // スネア＝拍1,3
    for (const seed of SEEDS) {
      const base = notesOf(genBass(f, C1, seed));
      const out = notesOf(genBass(f, C1, seed, d, { snareGap: 1 }));
      expect(out.map((n) => [n.pitch, n.start])).toEqual(base.map((n) => [n.pitch, n.start])); // onset不変
      const snares: number[] = [];
      for (let bar = 0; bar < 4; bar++) snares.push(bar * 4 + 1, bar * 4 + 3);
      for (const n of out) {
        const next = snares.find((t) => t > n.start + 1e-6);
        if (next !== undefined) expect(n.start + n.dur, `t=${n.start}#${seed}`).toBeLessThanOrEqual(Math.max(next, n.start + 0.25) + 1e-6);
        expect(n.dur).toBeGreaterThanOrEqual(0.25 - 1e-9);
      }
      expect(out.some((n, i) => n.dur < base[i]!.dur - 1e-9), `実際に切れている#${seed}`).toBe(true);
    }
  });
  it("snareGap=0.5 は決定的（同入力同出力）", () => {
    const f: Frame = { bars: 4, meter: "4/4", mood: "切ない" };
    const d = mkDrums([0, 8], [4, 12]);
    expect(J(genBass(f, C1, 7, d, { snareGap: 0.5 }))).toBe(J(genBass(f, C1, 7, d, { snareGap: 0.5 })));
  });
});

describe("(c) kickLock＝キック骨格（正）／逆相（負）", () => {
  it("kickLock=1(→0.85上限): 小節頭+キックstep(確率採用)・レガートdur・小節頭=ルート", () => {
    // 2026-07-14 較正：kickLock は上限0.85にクランプ（実測 share→1.0 は非実在）＝一部キックは確率で不採用。
    const f: Frame = { bars: 2, meter: "4/4" };
    const d = mkDrums([0, 6, 10], [4, 12]); // キック＝拍0,1.5,2.5
    const out = notesOf(genBass(f, C1, 42, d, { kickLock: 1 }));
    expect(out.map((n) => n.start)).toEqual([0, 1.5, 4, 5.5, 6.5]); // 上限0.85で bar1 の拍2.5 が落ちる
    expect(out.map((n) => n.dur)).toEqual([1.5, 2.5, 1.5, 1, 1.5]); // 次オンセット/小節末までレガート
    expect(out[0]!.pitch).toBe(36); // 小節頭アンカー=ルートC2（低域窓 A1..C3 で C は36据え置き）
    expect(out[2]!.pitch).toBe(36); // bar2 小節頭もルート
    expect(out.every((n) => [0, 1.5, 2.5].includes(((n.start % 4) + 4) % 4))).toBe(true); // オンセットは {the-one}∪キック拍 の部分集合
    expect(J(genBass(f, C1, 42, d, { kickLock: 1 }))).toBe(J(genBass(f, C1, 42, d, { kickLock: 1 }))); // 決定的
  });
  it("kickLock=1: キック不在の小節頭でも 'the one' は必ず弾く", () => {
    const d = mkDrums([6, 10], [4, 12]); // step0 にキック無し
    const out = notesOf(genBass({ bars: 2, meter: "4/4" }, C1, 42, d, { kickLock: 1 }));
    expect(out.some((n) => n.start === 0)).toBe(true);
    expect(out.some((n) => n.start === 4)).toBe(true);
  });
  it("kickLock=-1: 逆相＝キックに無い8分裏のみ（キック位置とは重ならない）", () => {
    const d = mkDrums([0, 6, 10], [4, 12]); // 8分裏{2,6,10,14}∖キック={2,14}→拍0.5,3.5
    const out = notesOf(genBass({ bars: 2, meter: "4/4" }, C1, 42, d, { kickLock: -1 }));
    const pos = [...new Set(out.map((n) => ((n.start % 4) + 4) % 4))].sort((a, b) => a - b);
    expect(pos).toEqual([0.5, 3.5]);
  });
  it("kickLock経路の音域窓は 33..48（A1..C3・実測較正 2026-07-14）", () => {
    const d = mkDrums([0, 4, 6, 10, 12, 14], [4, 12]);
    for (const seed of SEEDS) {
      const out = notesOf(genBass({ bars: 4, meter: "4/4" }, C1, seed, d, { kickLock: 1 }));
      for (const n of out) {
        expect(n.pitch).toBeGreaterThanOrEqual(33);
        expect(n.pitch).toBeLessThanOrEqual(48); // 旧55(G3)→48(C3)＝実曲上限(p95=A2)超えを刈る
      }
    }
  });
});

describe("(d) approach＝コードチェンジ直前の接近音", () => {
  const CF = [
    { root: 0, quality: "", start: 0, dur: 4 },
    { root: 5, quality: "", start: 4, dur: 4 },
  ]; // C→F
  it("approach=1: チェンジ直前の弱拍オンセットが次ルート(F=41)への半音/全音接近・チェンジ頭は41着地", () => {
    // kickLock 経路は上限0.85で前ルート末尾の弱オンセットが確率で落ちうる＝approach 機構は従来(fig)経路でも効く
    // ので、クランプ非依存の従来経路（kickLock なし）で機構を検証（approach は kickPath 後段で経路共通）。
    const d = mkDrums([0, 8, 14], [4, 12]);
    const out = notesOf(genBass({ bars: 2, meter: "4/4" }, CF, 42, d, { approach: 1 }));
    const appr = out.find((n) => Math.abs(n.start - 3.5) < 1e-6)!;
    expect(appr).toBeDefined();
    expect([39, 40, 42]).toContain(appr.pitch); // 41へ 全音下/半音下/半音上
    const head2 = out.find((n) => Math.abs(n.start - 4) < 1e-6)!;
    expect(head2.pitch).toBe(41); // beat1=ターゲット（次ルート F=41・低域窓 A1..C3）
  });
  it("approach=0 なら kickLock だけの出力と一致（段の独立性）", () => {
    const d = mkDrums([0, 8, 14], [4, 12]);
    expect(J(genBass({ bars: 2, meter: "4/4" }, CF, 42, d, { kickLock: 1, approach: 0 }))).toBe(
      J(genBass({ bars: 2, meter: "4/4" }, CF, 42, d, { kickLock: 1 })),
    );
  });
  it("強拍(1,3拍頭)・長音には適用しない（out-of-key 露出ガード）", () => {
    // キック=拍0,2のみ→チェンジ直前の最後のオンセットは拍2(強拍・dur2の長音)＝置換されない
    const d = mkDrums([0, 8], [4, 12]);
    const out = notesOf(genBass({ bars: 2, meter: "4/4" }, CF, 42, d, { kickLock: 1, approach: 1 }));
    const n2 = out.find((n) => Math.abs(n.start - 2) < 1e-6)!;
    expect([36, 43, 48]).toContain(n2.pitch); // C の R/5度上/oct のまま（接近音39/40/42でない）
  });
});

describe("(e) 5度は原則上（root+7 実音）＝低域窓 A1..C3(2026-07-14 較正)内で", () => {
  it("root=D(38): 5度は上(45=A2)・下転回(33=A1)は出ない・語彙は R/5度上/オクターブ上のみ", () => {
    // 旧テストは root=G で 5度上=50(D3)・oct=55(G3) を検証したが、窓上端が 55→48 に下がった＝D3/G3 は窓外。
    // 「5度は原則上（下に転回しない）」の契約は窓内に収まる root=D で検証（5度上 A2=45 ≤48）。
    const chD = [{ root: 2, quality: "", start: 0, dur: 64 }];
    const d = mkDrums([0, 4, 6, 10, 12, 14], [4, 12]);
    let sawFifth = false;
    for (const seed of SEEDS) {
      const out = notesOf(genBass({ bars: 4, meter: "4/4" }, chD, seed, d, { kickLock: 1 }));
      for (const n of out) {
        expect([38, 45], `pitch=${n.pitch}#${seed}`).toContain(n.pitch); // R=38(D2)/5度上=45(A2)。下転回A1=33なし・oct D3=50は窓外で刈られる
        expect(n.pitch).toBeGreaterThanOrEqual(38); // 下5度(A1=33)へ落ちない
      }
      if (out.some((n) => n.pitch === 45)) sawFifth = true;
    }
    expect(sawFifth).toBe(true); // 5度が実際に「上(45=A2)」で出る
  });
  it("root=G(43): 5度上(50=D3)/oct(55=G3) は窓上端48超で刈られ root 集中（高ルートの帰結）", () => {
    const chG = [{ root: 7, quality: "", start: 0, dur: 64 }];
    const d = mkDrums([0, 4, 6, 10, 12, 14], [4, 12]);
    for (const seed of SEEDS) {
      const out = notesOf(genBass({ bars: 4, meter: "4/4" }, chG, seed, d, { kickLock: 1 }));
      for (const n of out) expect(n.pitch, `pitch=${n.pitch}#${seed}`).toBe(43); // G2 のみ（5度上/oct は窓外＝下転回もしない）
    }
  });
});

describe("API 配線（/music/gen_bass・/gen/section のドラム→ベース結線）", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = buildHttp(new Core(openDb(":memory:")));
    await app.ready();
  });
  it("/music/gen_bass: drums+ノブを透過（kickLock=1 でキック骨格になる）", async () => {
    const d = mkDrums([0, 6, 10], [4, 12]);
    const r = await app.inject({
      method: "POST",
      url: "/music/gen_bass",
      payload: { frame: { bars: 2, meter: "4/4" }, chords: [{ root: 0, quality: "", start: 0, dur: 8 }], seed: 42, drums: d, kickLock: 1 },
    });
    expect(r.statusCode).toBe(200);
    const notes = (r.json() as { items: { content: { notes: Note[] } }[] }).items[0]!.content.notes;
    expect(notes.map((n) => n.start)).toEqual([0, 1.5, 4, 5.5, 6.5]); // kickLock 上限0.85＝bar1 拍2.5 は確率で不採用（2026-07-14 較正）
  });
  it("/music/gen_bass: drums 無しは従来と一致（回帰）", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/music/gen_bass",
      payload: { frame: { bars: 2, meter: "4/4" }, chords: [{ root: 0, quality: "", start: 0, dur: 8 }] },
    });
    expect(r.statusCode).toBe(200);
    // 回帰＝ベース content は従来 bit 一致。HTTP は読み取り専用の meta.sync（WP-D2 ノリメーター）を添付するので期待側も同ctx で添付。
    const expected = genBass({ bars: 2, meter: "4/4" }, [{ root: 0, quality: "", start: 0, dur: 8 }]);
    attachSyncScore(expected, { beatsPerBar: 4 });
    expect(J(r.json())).toBe(J(expected));
  });
  it("/gen/section: 生成済みドラムがベースへ渡る（bass.kickLock 指定でキック位置に乗る）", async () => {
    const frame = { bars: 2, meter: "4/4", key: 0 };
    const seed = 42;
    const r = await app.inject({
      method: "POST",
      url: "/gen/section",
      payload: { frame, seed, parts: ["chords", "bass", "drums"], bass: { kickLock: 1 } },
    });
    expect(r.statusCode).toBe(200);
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] } };
    const kinds = comp.composition.children.map((c) => c.node.neta.kind);
    expect(kinds).toContain("bass");
    expect(kinds).toContain("rhythm");
    const bass = comp.composition.children.find((c) => c.node.neta.kind === "bass")!.node.neta.content as { notes: Note[] };
    // 期待＝genDrums(frame,seed) を genBass に渡した結果と一致（結線の実体）
    const drums = genDrums(frame, seed).items[0]!.content as ReturnType<typeof mkDrums>;
    const chords = comp.composition.children.find((c) => c.node.neta.kind === "chord_progression")!.node.neta.content as { chords: { root: number; quality: string; start: number; dur: number }[] };
    const expected = notesOf(genBass(frame, chords.chords, seed, drums, { kickLock: 1 }));
    expect(bass.notes).toEqual(expected);
    // キック位置にオンセットが乗っている（キックstep⊆ベースonset）
    const kickBeats = drums.rhythm.lanes.find((l) => l.midi === 36)!.hits.map((s) => s * drums.rhythm.beatsPerStep);
    const starts = new Set(bass.notes.map((n) => ((n.start % 4) + 4) % 4));
    for (const kb of kickBeats) expect(starts.has(kb), `kick@${kb}`).toBe(true);
  });
  it("/gen/section: bass ノブ未指定は従来と bit 一致（回帰）", async () => {
    const frame = { bars: 2, meter: "4/4", key: 0 };
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { frame, seed: 7, parts: ["chords", "bass", "drums"] } });
    expect(r.statusCode).toBe(200);
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] } };
    const bass = comp.composition.children.find((c) => c.node.neta.kind === "bass")!.node.neta.content as { notes: Note[] };
    const chords = comp.composition.children.find((c) => c.node.neta.kind === "chord_progression")!.node.neta.content as { chords: { root: number; quality: string; start: number; dur: number }[] };
    expect(bass.notes).toEqual(notesOf(genBass(frame, chords.chords, 7))); // drums を渡しても係数0＝従来
  });
});
