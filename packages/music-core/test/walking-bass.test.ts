// ウォーキングベース JZ-WALK（M3-3d）の受け入れ。**耳未判定**（v3 の規則は耳の言葉から出ているが、
// v3 自体は打ち切られた枝で効いたことは未確認＝計画 §4-1）＝この経路は opt-in（style 名指し）でだけ立つ。
//
// **データ一致は主張しない**（計画 §6-2＝v2 は乱数が sort キー本体なので、乱数を消した時点で列は源流と違う）。
// 受けるのは：
//   gate           ＝W1〜W5・禁則0・変異検査（禁則を注入したら検査が落ちる）
//   byConstruction ＝禁則0は制約で保証される＝**被覆率（制約が候補を削った選択数／選択総数）を数値で出す**
//   diagnostic     ＝回復率・平均音程（**ゲートにしない**＝形の可否は耳）
//   摂動テスト     ＝規則の重みを振ると出力が変わる（§6-4 #9・全ソルバ必須）
//
// **検算側は生成が使う表を import しない**（§6-4 #2）＝コードトーン/スケールはこのファイルのリテラル。
import { describe, it, expect } from "vitest";
import { buildWalkingLine, intervalOk, WALK_RULES_V3, WALK_COMPOUND_SLOT_STEPS, type WalkSegment } from "../src/walkingBass";

const LO = 33, HI = 48;
const W = { lo: LO, hi: HI };

// ── 検算側のリテラル表（教科書＝生成器の表を借りない） ──
const TONES: Record<string, number[]> = { m7: [0, 3, 7, 10], "7": [0, 4, 7, 10], maj7: [0, 4, 7, 11], min: [0, 3, 7], maj: [0, 4, 7] };
const SCALE: Record<string, number[]> = {
  m7: [0, 2, 3, 5, 7, 8, 10], "7": [0, 2, 4, 5, 7, 9, 10], maj7: [0, 2, 4, 5, 7, 9, 11],
  min: [0, 2, 3, 5, 7, 8, 10], maj: [0, 2, 4, 5, 7, 9, 11],
};
const pc = (p: number) => ((p % 12) + 12) % 12;
const seg = (rootPc: number, quality: string, slots: number): WalkSegment =>
  ({ chord: { rootPc, quality, tones: TONES[quality]!, bassPc: null }, slots });

// ケース＝ii-V-I（4拍ずつ）／12小節ブルース風／半小節チェンジ／1拍だけの区間
const CASES: [string, WalkSegment[]][] = [
  ["ii-V-I", [seg(2, "m7", 4), seg(7, "7", 4), seg(0, "maj7", 8)]],
  ["blues", [seg(0, "7", 8), seg(5, "7", 4), seg(0, "7", 4), seg(7, "7", 4), seg(5, "7", 4), seg(0, "7", 8)]],
  ["fast-change", [seg(9, "min", 2), seg(5, "maj", 2), seg(0, "maj", 2), seg(7, "7", 2), seg(9, "min", 2), seg(2, "m7", 2), seg(7, "7", 2), seg(0, "maj7", 2)]],
  ["one-slot", [seg(0, "maj", 1), seg(5, "maj", 1), seg(7, "7", 1), seg(0, "maj", 4)]],
  ["long-6", [seg(1, "m7", 6), seg(6, "7", 6), seg(11, "maj7", 6)]], // 1区間6歩＝回復規則が実際に効く長さ
];

const slotChords = (segs: WalkSegment[]) => segs.flatMap((s) => Array.from({ length: s.slots }, () => s.chord));

describe("gate＝W1〜W5（源流 walking の機械不変条件・v1/v2/v3 で同一）", () => {
  for (const [name, segs] of CASES) {
    it(`${name}：W1 区間頭はルート／W2 チェンジ直前は次ルートの±2／W3 連打なし／W4 スケール整合／W5 音域`, () => {
      const { pitches, report } = buildWalkingLine(segs, W, 42);
      const chords = slotChords(segs);
      expect(pitches.length).toBe(chords.length);

      // W1（独立に数え直す＝report を信じない）
      let i = 0, w1ok = 0, w1total = 0;
      for (const s of segs) { w1total++; if (pc(pitches[i]!) === pc(s.chord.rootPc)) w1ok++; i += s.slots; }
      expect(w1ok / w1total).toBe(1);
      expect(report.w1).toEqual({ ok: w1ok, total: w1total }); // 生成器の自己申告も一致（嘘の report を許さない）

      // W2＝区間の最後の音が、次の区間の頭（＝次ルート）へ ±2 で入る。
      //   **1歩しかない区間は対象外**＝源流も `if L == 1: continue` で接近音を置かない（頭＝ルートで終わる）。
      let j = 0, w2ok = 0, w2total = 0;
      for (let si = 0; si < segs.length - 1; si++) {
        j += segs[si]!.slots;
        if (segs[si]!.slots < 2) continue;
        if (segs[si]!.chord.rootPc === segs[si + 1]!.chord.rootPc) continue; // 同じコードの続き＝チェンジでない
        w2total++;
        if (Math.abs(pitches[j - 1]! - pitches[j]!) <= 2) w2ok++;
      }
      if (w2total > 0) expect(w2ok / w2total).toBe(1);
      expect(report.w2.ok).toBe(report.w2.total); // 生成器の自己申告も 100%（嘘の report を許さない）

      // W3＝同音の連打なし
      for (let k = 1; k < pitches.length; k++) expect(pitches[k], `repeat@${k}`).not.toBe(pitches[k - 1]);

      // W4＝そのコードのスケール内 or 次のコードトーンへ ±2 で解決
      let w4bad = 0;
      pitches.forEach((p, k) => {
        const ch = chords[k]!;
        const inScale = SCALE[ch.quality]!.some((t) => pc(ch.rootPc + t) === pc(p)) || TONES[ch.quality]!.some((t) => pc(ch.rootPc + t) === pc(p));
        if (inScale) return;
        const nxt = pitches[k + 1], nch = chords[k + 1];
        if (nxt !== undefined && nch && Math.abs(p - nxt) <= 2 && TONES[nch.quality]!.some((t) => pc(nch.rootPc + t) === pc(nxt))) return;
        w4bad++;
      });
      expect(w4bad).toBe(0);

      // W5＝音域内
      for (const p of pitches) { expect(p).toBeGreaterThanOrEqual(LO); expect(p).toBeLessThanOrEqual(HI); }
    });
  }
});

describe("byConstruction＝禁則0（制約で保証される）＋**被覆率を数値で出す**（§6-4 の 3・7）", () => {
  for (const [name, segs] of CASES) {
    it(`${name}：禁則音程（トライトーン6・長7度11・オクターブ超）が 0／制約の被覆率 > 0`, () => {
      const { pitches, report } = buildWalkingLine(segs, W, 42);
      let hits = 0, transitions = 0;
      for (let k = 1; k < pitches.length; k++) {
        const ad = Math.abs(pitches[k]! - pitches[k - 1]!);
        transitions++;
        if (ad === 6 || ad === 11 || ad > 12) hits++;
      }
      expect(transitions).toBeGreaterThanOrEqual(6); // 分母が空でない＝この検査は空虚でない
      expect(hits).toBe(0);
      expect(report.forbidden).toEqual({ hits: 0, transitions });
      expect(report.constrained.total).toBeGreaterThan(0);
    });
  }

  it("**被覆率の実測値を固定**（後から抜き打ちで検算できる形に・0 のケースも隠さない）", () => {
    const cov = Object.fromEntries(CASES.map(([n, s]) => {
      const r = buildWalkingLine(s, W, 42).report;
      return [n, `${r.constrained.applied}/${r.constrained.total}`];
    }));
    expect(cov).toEqual({
      "ii-V-I": "5/16",       // 16回の選択のうち5回、規則が候補を削った
      blues: "20/32",
      "fast-change": "10/16",
      "one-slot": "0/7",      // ⚠ **0**＝このケースの「禁則0」は規則のおかげではない（たまたま出なかっただけ）
      "long-6": "4/18",
    });
    // 全体では効いている（＝制約が空虚でない）。ただし個別ケースでは 0 があり得る、と数値で示している。
    const total = CASES.reduce((a, [, s]) => a + buildWalkingLine(s, W, 42).report.constrained.applied, 0);
    expect(total).toBe(39);
  });
});

describe("gate＝変異検査（出力に故障を注入＝§6-4 の 6）", () => {
  it("禁則音程（トライトーン）を注入すると禁則0の検査が落ちる", () => {
    const { pitches } = buildWalkingLine(CASES[0]![1], W, 42);
    const ns = [...pitches];
    ns[3] = ns[2]! + 6 <= HI ? ns[2]! + 6 : ns[2]! - 6; // トライトーン跳躍を作る
    const hits = ns.slice(1).filter((p, k) => { const ad = Math.abs(p - ns[k]!); return ad === 6 || ad === 11 || ad > 12; }).length;
    expect(hits).toBeGreaterThan(0);
  });

  it("区間頭をルートでない音にすると W1 が落ちる", () => {
    const segs = CASES[0]![1];
    const { pitches } = buildWalkingLine(segs, W, 42);
    const ns = [...pitches];
    ns[0] = ns[0]! + 1;
    let i = 0, ok = 0, total = 0;
    for (const s of segs) { total++; if (pc(ns[i]!) === pc(s.chord.rootPc)) ok++; i += s.slots; }
    expect(ok / total).toBeLessThan(1);
  });

  it("同音を連打させると W3 が落ちる", () => {
    const { pitches } = buildWalkingLine(CASES[1]![1], W, 42);
    const ns = [...pitches];
    ns[5] = ns[4]!;
    expect(ns.slice(1).some((p, k) => p === ns[k]!)).toBe(true);
  });
});

describe("摂動テスト＝規則の重みを振ると出力が変わる（§6-4 の 9・全ソルバ必須）", () => {
  // 「どのケースでも変わる」ではなく「**どこかのケースで変わる**」＝規則が出力に効いている、が主張。
  const differsSomewhere = (rules: Partial<typeof WALK_RULES_V3>): string[] =>
    CASES.filter(([, segs]) =>
      JSON.stringify(buildWalkingLine(segs, W, 42, { ...WALK_RULES_V3, ...rules }).pitches)
      !== JSON.stringify(buildWalkingLine(segs, W, 42).pitches)).map(([n]) => n);

  it("禁則集合を空にすると線が変わる（禁則規則が本当に効いている）", () => {
    expect(differsSomewhere({ forbidden: [] })).toEqual(["ii-V-I", "blues", "long-6"]);
  });

  it("跳躍のしきい値を振ると線が変わる（回復規則の発動点）", () => {
    expect(differsSomewhere({ leapTrigger: 3 }).length).toBeGreaterThan(0);
    expect(differsSomewhere({ leapTrigger: 12 }).length).toBeGreaterThan(0);
  });

  it("回復の幅（順次の上限・逆行の上限）を振ると線が変わる", () => {
    expect(differsSomewhere({ recoverStep: 4 }).length).toBeGreaterThan(0);
    expect(differsSomewhere({ contraryMax: 8 }).length).toBeGreaterThan(0);
  });

  it("⚠ 短7度の抑制だけは、この窓（[33,48]）では出力に出ない＝**効いていないと正直に書く**", () => {
    // 規則そのものは `intervalOk` の単体テストで効いている。しかし線の上では、短7度が唯一の合法候補になる
    // 場面が otomemo の狭い窓（16半音）では起きなかった（336 進行を機械的に振って 0 件・探索は開発時のみ）。
    // 「摂動テストに通った」と書けないので、通っていないことを固定する。
    expect(differsSomewhere({ suppressM7: false })).toEqual([]);
  });
});

describe("決定論（RNG を消した＝計画 §6-2 の (0)）", () => {
  it("同じ入力・同じ seed なら毎回同じ列（RNG・時刻を消費しない）", () => {
    for (const [, segs] of CASES) {
      const a = buildWalkingLine(segs, W, 42).pitches;
      for (let i = 0; i < 5; i++) expect(buildWalkingLine(segs, W, 42).pitches).toEqual(a);
    }
  });

  it("seed は**弧の向き**にだけ効く（偶奇で変わる・同じ偶奇なら同じ）", () => {
    const even = buildWalkingLine(CASES[1]![1], W, 2).pitches;
    const even2 = buildWalkingLine(CASES[1]![1], W, 100).pitches;
    const odd = buildWalkingLine(CASES[1]![1], W, 3).pitches;
    expect(even2).toEqual(even);
    expect(odd).not.toEqual(even);
  });
});

describe("diagnostic＝回復率・平均音程（**ゲートにしない**＝形の可否は耳・§6-4 #1）", () => {
  it("数値が出る（合否は言わない）", () => {
    for (const [name, segs] of CASES) {
      const r = buildWalkingLine(segs, W, 42).report;
      expect(r.avgInterval).toBeGreaterThan(0);
      expect(r.recovery.total).toBeGreaterThanOrEqual(0);
      if (r.recovery.total > 0) expect(r.recovery.ok / r.recovery.total).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.avgInterval), name).toBe(true);
    }
  });

  it("緩和ラダーの記録が残る（窓が狭い時にどれだけ規則を降りたかが見える）", () => {
    const r = buildWalkingLine(CASES[1]![1], W, 42).report;
    expect(r.relaxed.length).toBeGreaterThan(0);
    expect(Math.max(...r.relaxed)).toBeLessThanOrEqual(3);
  });
});

describe("v3 の規則そのもの（源流 walking_v3._interval_ok の移植）", () => {
  it("トライトーン・長7度・オクターブ超・連打は不可／短7度は既定で抑制", () => {
    expect(intervalOk(40, null, 46, WALK_RULES_V3)).toBe(false); // 6
    expect(intervalOk(40, null, 51, WALK_RULES_V3)).toBe(false); // 11
    expect(intervalOk(40, null, 53, WALK_RULES_V3)).toBe(false); // 13
    expect(intervalOk(40, null, 40, WALK_RULES_V3)).toBe(false); // 連打
    expect(intervalOk(40, null, 50, WALK_RULES_V3)).toBe(false); // 10（短7度・抑制）
    expect(intervalOk(40, null, 50, WALK_RULES_V3, true)).toBe(true); // 最後の手段では許す
    expect(intervalOk(40, null, 45, WALK_RULES_V3)).toBe(true);  // 4度＝可
  });

  it("跳躍のあとは順次か小さな逆行だけ（同方向の連続跳躍は禁止）", () => {
    // 直前が +7 の跳躍：次は ±2 まで、または逆方向に 4 まで
    expect(intervalOk(47, 7, 49, WALK_RULES_V3)).toBe(true);   // +2 順次
    expect(intervalOk(47, 7, 44, WALK_RULES_V3)).toBe(true);   // -3 逆行
    expect(intervalOk(47, 7, 42, WALK_RULES_V3)).toBe(false);  // -5 逆行だが大きすぎ
    expect(intervalOk(40, 7, 45, WALK_RULES_V3)).toBe(false);  // +5 同方向の連続跳躍
  });
});

describe("6/8 のスロット（源流 core/parts.py:388 _COMPOUND_SLOT_STEPS）", () => {
  it("(0,2,6,8)＝付点四分2つ＋各へのピックアップ8分＝1小節4歩", () => {
    expect(WALK_COMPOUND_SLOT_STEPS).toEqual([0, 2, 6, 8]);
  });
});
