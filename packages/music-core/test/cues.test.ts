import { describe, it, expect } from "vitest";
import { mergeCues, deriveCues, type Cue, type DerivedCue } from "../src/index";

// ── B. mergeCues（内側優先の上書き規則＝カスケード §2-2） ──
describe("mergeCues＝内側優先の上書き（同 bar は内側が丸ごと勝つ・bar で dedup・安定 sort）", () => {
  it("非衝突は和集合＝bar 昇順に安定 sort", () => {
    const outer: Cue[] = [{ bar: 4, kind: "build" }];
    const inner: Cue[] = [{ bar: 1, kind: "fill" }];
    expect(mergeCues(outer, inner)).toEqual([
      { bar: 1, kind: "fill" },
      { bar: 4, kind: "build" },
    ]);
  });

  it("同 bar 衝突＝内側(inner)が丸ごと勝つ（kind 違いも内側が正）", () => {
    // 衝突例（§2-2）：曲レイヤーが bar6 に build × セクションが bar6 に break → セクションの break が勝つ。
    const outer: Cue[] = [{ bar: 6, kind: "build" }];
    const inner: Cue[] = [{ bar: 6, kind: "break" }];
    expect(mergeCues(outer, inner)).toEqual([{ bar: 6, kind: "break" }]);
  });

  it("intensity/aim を含む丸ごと上書き（フィールドがマージされず内側で置換）", () => {
    const outer: Cue[] = [{ bar: 2, kind: "fill", intensity: 0.9, aim: "up" }];
    const inner: Cue[] = [{ bar: 2, kind: "fill", intensity: 0.3 }];
    expect(mergeCues(outer, inner)).toEqual([{ bar: 2, kind: "fill", intensity: 0.3 }]);
  });

  it("引数省略＝空配列扱い（outer/inner とも省略で []）", () => {
    expect(mergeCues()).toEqual([]);
    expect(mergeCues([{ bar: 0, kind: "fill" }])).toEqual([{ bar: 0, kind: "fill" }]);
  });

  it("outer は当面空＝恒等（曲レイヤー後回しの純規則凍結）", () => {
    const inner: Cue[] = [
      { bar: 3, kind: "fill" },
      { bar: 0, kind: "build" },
    ];
    expect(mergeCues([], inner)).toEqual([
      { bar: 0, kind: "build" },
      { bar: 3, kind: "fill" },
    ]);
  });

  it("決定的＝同一入力で同一出力（副作用なし・入力不変）", () => {
    const outer: Cue[] = [{ bar: 6, kind: "build" }];
    const inner: Cue[] = [{ bar: 6, kind: "break" }];
    const a = mergeCues(outer, inner);
    const b = mergeCues(outer, inner);
    expect(a).toEqual(b);
    // 入力は破壊されない
    expect(outer).toEqual([{ bar: 6, kind: "build" }]);
    expect(inner).toEqual([{ bar: 6, kind: "break" }]);
  });
});

// ── B. deriveCues（並びからの導出＝カスケード §2-3） ──
describe("deriveCues＝越境 land 導出＋保存land破棄＋範囲外無視", () => {
  it("先頭セクション＝land なし（前セクションが無い）", () => {
    const secs = [{ cues: [{ bar: 3, kind: "fill" as const }], bars: 4 }];
    expect(deriveCues(secs, 0)).toEqual([{ bar: 3, kind: "fill" }]);
  });

  it("前セクション最終小節(bars-1)の fill ＝越境＝当該 bar0 に land 導出（裁定4）", () => {
    const secs = [
      { cues: [{ bar: 3, kind: "fill" as const }], bars: 4 }, // bar3 == bars-1 ＝越境
      { cues: [], bars: 4 },
    ];
    expect(deriveCues(secs, 1)).toEqual([{ bar: 0, kind: "land" }]);
  });

  it("前セクションの fill が bars-2 以下＝内部着地＝land を導出しない", () => {
    const secs = [
      { cues: [{ bar: 2, kind: "fill" as const }], bars: 4 }, // bar2 <= bars-2 ＝内部着地
      { cues: [], bars: 4 },
    ];
    expect(deriveCues(secs, 1)).toEqual([]);
  });

  it("自前 bar0 cue が land に勝つ（own が内側＝§2-3 の (d)）", () => {
    const secs = [
      { cues: [{ bar: 3, kind: "fill" as const }], bars: 4 }, // 越境 → land@bar0 を導出
      { cues: [{ bar: 0, kind: "build" as const }], bars: 4 }, // 自前 bar0 が勝つ
    ];
    expect(deriveCues(secs, 1)).toEqual([{ bar: 0, kind: "build" }]);
  });

  it("保存された kind:land は捨てる（§1-1 書き込みガード＝読み側1箇所）", () => {
    // content は z.unknown() 素通しゆえ update_neta で land を書けてしまう＝deriveCues が破棄。
    const secs = [
      { cues: [{ bar: 1, kind: "land" }, { bar: 2, kind: "fill" }] as Cue[], bars: 4 },
    ];
    expect(deriveCues(secs, 0)).toEqual([{ bar: 2, kind: "fill" }]);
  });

  it("範囲外 cue（bar >= bars）は無視（フォーム改訂で bars が縮んでも腐らない）", () => {
    const secs = [{ cues: [{ bar: 5, kind: "fill" as const }, { bar: 1, kind: "build" as const }], bars: 4 }];
    expect(deriveCues(secs, 0)).toEqual([{ bar: 1, kind: "build" }]);
  });

  it("前セクションの範囲外 fill（bar>=prev.bars）は越境判定に使わない（clean 後に判定）", () => {
    const secs = [
      { cues: [{ bar: 7, kind: "fill" as const }], bars: 4 }, // bar7 >= 4 ＝範囲外＝無視
      { cues: [], bars: 4 },
    ];
    expect(deriveCues(secs, 1)).toEqual([]);
  });

  it("越境 land ＋ 自前の他小節 cue は共存（land@0 と own@2 が bar 順に並ぶ）", () => {
    const secs = [
      { cues: [{ bar: 3, kind: "fill" as const }], bars: 4 }, // 越境 → land@0
      { cues: [{ bar: 2, kind: "fill" as const }], bars: 4 },
    ];
    expect(deriveCues(secs, 1)).toEqual([
      { bar: 0, kind: "land" },
      { bar: 2, kind: "fill" },
    ]);
  });

  it("cues 省略のセクション＝空扱い（undefined 取り回しで落ちない）", () => {
    const secs = [{ bars: 4 }, { bars: 4 }];
    expect(deriveCues(secs, 0)).toEqual([]);
    expect(deriveCues(secs, 1)).toEqual([]);
  });

  it("決定的＝同一入力で同一出力・入力不変", () => {
    const secs = [
      { cues: [{ bar: 3, kind: "fill" as const }], bars: 4 },
      { cues: [{ bar: 0, kind: "build" as const }], bars: 4 },
    ];
    const a = deriveCues(secs, 1);
    const b = deriveCues(secs, 1);
    expect(a).toEqual(b);
    expect(secs[0]!.cues).toEqual([{ bar: 3, kind: "fill" }]); // 破壊なし
  });
});

// ── C. Cue 型スナップショット凍結（神化回避の機械判定＝設計 §6-C／M0 §6⑦） ──
// 「楽器が増えても Cue のフィールド集合は1バイトも動かない」。keyof Required<Cue> で駆動＝
// フィールドを足す/消すと**コンパイルエラー**（機械判定①）＋インラインスナップショット差分（機械判定②）。
describe("Cue 型スナップショット凍結（楽器追加でフィールド差分ゼロ）", () => {
  it("Cue のフィールド集合が凍結値と一致", () => {
    const CUE_FIELDS: Record<keyof Required<Cue>, true> = {
      bar: true,
      kind: true,
      intensity: true,
      aim: true,
    };
    expect(Object.keys(CUE_FIELDS).sort()).toMatchInlineSnapshot(`
      [
        "aim",
        "bar",
        "intensity",
        "kind",
      ]
    `);
  });

  it("CueKind の許容値が凍結値と一致（land は含まない＝導出専用）", () => {
    const KINDS: Record<Cue["kind"], true> = { fill: true, build: true, break: true };
    expect(Object.keys(KINDS).sort()).toMatchInlineSnapshot(`
      [
        "break",
        "build",
        "fill",
      ]
    `);
  });

  it("DerivedCue は land を追加で受ける（保存 Cue には無い）", () => {
    const land: DerivedCue = { bar: 0, kind: "land" };
    expect(land.kind).toBe("land");
  });
});
