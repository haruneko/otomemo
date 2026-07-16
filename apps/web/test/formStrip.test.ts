import { describe, it, expect } from "vitest";
import {
  stripPositions,
  cardsToEdges,
  collapseRuns,
  reconcileEdges,
  resolveDurById,
  totalSpanBeats,
  roleOf,
  roleInfo,
  type StripCard,
  type Edge,
} from "../src/formStrip";
import { partTracks } from "../src/music";
import type { Note } from "../src/music";

// ── 前置和射影（position＝カード順から再計算・データ契約不変の核） ──
describe("stripPositions（前置和射影）", () => {
  it("尺列→各カードの開始 position（先頭0・以降は累積）", () => {
    expect(stripPositions([32, 32, 16])).toEqual([0, 32, 64]); // 8+8+4小節(4/4)
    expect(stripPositions([])).toEqual([]);
    expect(stripPositions([32])).toEqual([0]);
  });
  it("尺0/負/NaN は0扱いで射影が壊れない（防御）", () => {
    expect(stripPositions([32, 0, 16])).toEqual([0, 32, 32]);
    expect(stripPositions([32, NaN, 16])).toEqual([0, 32, 32]); // NaN は加算しない
  });
});

describe("cardsToEdges（カード列→辺・射影position＋ord）", () => {
  const card = (childId: string, dur: number, ord = 0): StripCard => ({ childId, dur, ord, position: -1 });
  it("並べた順に隙間なく position を振る（ord は保つ）", () => {
    expect(cardsToEdges([card("A", 32), card("B", 16), card("A", 32)])).toEqual([
      { childId: "A", position: 0, ord: 0 },
      { childId: "B", position: 32, ord: 0 },
      { childId: "A", position: 48, ord: 0 }, // 同じ子を2回＝×2 反復（別 position）
    ]);
  });
});

// ── ×N畳み（連続同一 child を1カードに） ──
describe("collapseRuns（×N畳み）", () => {
  it("連続する同一 childId を1グループに束ねる（indices で逆引き）", () => {
    expect(collapseRuns(["intro", "A", "A", "B", "A"])).toEqual([
      { childId: "intro", count: 1, indices: [0] },
      { childId: "A", count: 2, indices: [1, 2] }, // 連続2回＝×2
      { childId: "B", count: 1, indices: [3] },
      { childId: "A", count: 1, indices: [4] }, // 離れた A は別グループ（畳まない）
    ]);
  });
  it("空列＝空", () => { expect(collapseRuns([])).toEqual([]); });
});

// ── 辺の差分（並べ替え/挿入/削除→最小の place/remove） ──
describe("reconcileEdges（辺の差分・多重集合）", () => {
  const e = (childId: string, position: number, ord = 0): Edge => ({ childId, position, ord });
  it("変化なし＝place/remove 空（据え置き）", () => {
    const eds = [e("A", 0), e("B", 32)];
    expect(reconcileEdges(eds, eds)).toEqual({ place: [], remove: [] });
  });
  it("並べ替え＝位置が変わる辺だけ remove→place", () => {
    const old = [e("A", 0), e("B", 32)];
    const next = [e("B", 0), e("A", 32)]; // A↔B 入れ替え（射影後）
    const { place, remove } = reconcileEdges(old, next);
    expect(remove).toEqual([e("A", 0), e("B", 32)]);
    expect(place).toEqual([e("B", 0), e("A", 32)]);
  });
  it("削除＝残りを詰め直し、消えた辺と位置ズレ辺を落とす", () => {
    const old = [e("A", 0), e("B", 32), e("C", 64)]; // A,B,C 各8小節
    const next = [e("A", 0), e("C", 32)]; // B を削除→C が前へ詰まる
    const { place, remove } = reconcileEdges(old, next);
    expect(remove).toEqual([e("B", 32), e("C", 64)]); // B と旧位置の C
    expect(place).toEqual([e("C", 32)]); // A@0 は据え置き、C だけ置き直し
  });
  it("×N（同一childの複数配置）は position で区別してマッチ", () => {
    const old = [e("A", 0), e("A", 32)];
    const next = [e("A", 0), e("A", 48)]; // 片方だけ移動
    const { place, remove } = reconcileEdges(old, next);
    expect(remove).toEqual([e("A", 32)]);
    expect(place).toEqual([e("A", 48)]);
  });
});

// ── 尺の childId 解決＋射影（反復2個目の childDur 破損で position が詰まる compose_edge 破損の根治） ──
describe("resolveDurById＋射影（反復配置の childDur 破損に汚染されない）", () => {
  // getComposition が反復の2個目の node.children を空で返す＝childDur が 8→1(BPB) に落ちるケースを模す。
  // 配置(position順)：Aメロ8拍@0(無傷) / Aメロ8拍@8(childDur破損=1) / Bメロ8拍@16。
  const placements = [
    { childId: "A", position: 0, dur: 8 },
    { childId: "A", position: 8, dur: 1 }, // ← 反復2個目＝破損尺
    { childId: "B", position: 16, dur: 8 },
  ];
  it("resolveDurById＝id の尺を無傷配置(最大)に1本化＝破損配置に負けない", () => {
    const m = resolveDurById(placements);
    expect(m.get("A")).toBe(8); // 破損の 1 でなく無傷の 8
    expect(m.get("B")).toBe(8);
  });
  // desired 列（childId）→ 解決尺で射影した辺。破損尺を使わず durById を引く＝射影の正準。
  const edgesFor = (ids: string[], extra: Record<string, number> = {}) => {
    const m = resolveDurById(placements);
    const durOf = (id: string) => extra[id] ?? m.get(id) ?? 4;
    return cardsToEdges(ids.map((id) => ({ childId: id, dur: durOf(id), ord: 0, position: -1 })));
  };
  const e = (childId: string, position: number): Edge => ({ childId, position, ord: 0 });
  it("そのまま[A,A,B]＝Aメロ8拍×2→[0,8]、Bは16から（反復以降が詰まらない）", () => {
    expect(edgesFor(["A", "A", "B"])).toEqual([e("A", 0), e("A", 8), e("B", 16)]);
  });
  it("並べ替え[B,A,A]→[B@0, A@8, A@16]（Bを先頭へ）", () => {
    expect(edgesFor(["B", "A", "A"])).toEqual([e("B", 0), e("A", 8), e("A", 16)]);
  });
  it("削除[A,B]（反復1つ外す）→[A@0, B@8]（詰め直しても8拍刻み）", () => {
    expect(edgesFor(["A", "B"])).toEqual([e("A", 0), e("B", 8)]);
  });
  it("挿入[A,A,C,B]（C=8拍を反復の直後へ）→ Bは24から（重ならない）", () => {
    expect(edgesFor(["A", "A", "C", "B"], { C: 8 })).toEqual([e("A", 0), e("A", 8), e("C", 16), e("B", 24)]);
  });
  it("reconcileEdges＝[A,A,B]→[B,A,A] は全辺を正しく置換（破損尺でも整合）", () => {
    const old = edgesFor(["A", "A", "B"]); // A@0,A@8,B@16
    const next = edgesFor(["B", "A", "A"]); // B@0,A@8,A@16
    const { place, remove } = reconcileEdges(old, next);
    expect(remove).toEqual([e("A", 0), e("B", 16)]); // A@8 は据え置き
    expect(place).toEqual([e("B", 0), e("A", 16)]);
  });
});

// ── 合計尺（曲ヘッダ）＝×N反復を過少カウントしない ──
describe("totalSpanBeats（合計尺・×N反復を取りこぼさない）", () => {
  const card = (childId: string, position: number, dur: number) => ({ childId, position, dur });
  it("8拍セクション ×2＋別8拍＝span 24拍（反復ぶんを合計に入れる）", () => {
    expect(totalSpanBeats([card("A", 0, 8), card("A", 8, 8), card("B", 16, 8)])).toBe(24);
  });
  it("末尾が×Nでも実尺（先頭配置の尺×count）で span＝過少カウントの是正", () => {
    // 2個目の配置の尺が壊れて(node.children畳みで)1拍に出ても、ラン先頭の8拍×2で24拍を返す。
    expect(totalSpanBeats([card("B", 0, 8), card("A", 8, 8), card("A", 16, 1)])).toBe(24);
  });
  it("単発／空／尺0の防御", () => {
    expect(totalSpanBeats([card("A", 0, 32)])).toBe(32);
    expect(totalSpanBeats([])).toBe(0);
    expect(totalSpanBeats([card("A", 0, NaN)])).toBe(0); // NaN尺は0扱い
  });
});

describe("roleOf / roleInfo（役割タグ→ラベル）", () => {
  it("tags の role: を読み、既知は日本語ラベル・未知は生値・無しは undefined", () => {
    expect(roleOf(["prj:曲A", "role:chorus"])).toBe("chorus");
    expect(roleOf(["prj:曲A"])).toBeUndefined();
    expect(roleInfo("chorus")?.label).toBe("サビ");
    expect(roleInfo("chorus")?.color).toBeTruthy();
    expect(roleInfo("weird")).toEqual({ label: "weird" }); // 未知＝生値・無地
    expect(roleInfo(undefined)).toBeUndefined();
  });
});

// ── part 別 MIDI トラック（song 書き出し是正） ──
describe("partTracks（song の part 別トラック）", () => {
  const n = (over: Partial<Note>): Note => ({ pitch: 60, start: 0, dur: 1, ...over });
  it("part ごとにトラックを割り、program はノート単位を尊重（同part内 program 違いは別トラック）", () => {
    const notes: Note[] = [
      n({ part: "melody", program: 0, pitch: 72 }),
      n({ part: "chord", program: 0, pitch: 60 }), // コード楽器1（ピアノ0）
      n({ part: "chord", program: 46, pitch: 64 }), // ハープ46＝同 part でも別トラックへ
      n({ part: "bass", program: 33, pitch: 40 }),
      n({ part: "drums", drum: true, kit: 0, pitch: 36 }),
    ];
    const tracks = partTracks(notes);
    // melody / chord(0) / chord(46) / bass / drums ＝5トラック（chord が program で2分割）
    expect(tracks).toHaveLength(5);
    const chordTracks = tracks.filter((t) => t.name === "Chord");
    expect(chordTracks.map((t) => t.program).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 46]); // program 潰れない
    const bass = tracks.find((t) => t.name === "Bass")!;
    expect(bass.program).toBe(33);
    expect(bass.drum).toBeFalsy();
    const drums = tracks.find((t) => t.name === "Drums")!;
    expect(drums.drum).toBe(true); // ch10
    expect(drums.program).toBeUndefined(); // kit で鳴らす＝program 不要
  });
  it("part 未指定はメロ扱い（防御）／空入力は空", () => {
    expect(partTracks([])).toEqual([]);
    const t = partTracks([n({ pitch: 60 })]);
    expect(t).toHaveLength(1);
    expect(t[0]!.name).toBe("Melody");
  });
});
