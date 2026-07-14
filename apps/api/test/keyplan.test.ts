import { describe, it, expect } from "vitest";
import { suggestKeyPlan, MODULATION_CATALOG, type KeyPlan } from "../src/music/keyPlan";
import { genChords, type Frame } from "../src/music/generate";

// WP-C2 調プラン（転調）スライス1。
// 受け入れ：役割列→プラン候補が型カタログ準拠（最終サビ半音上げ等の固定値）／
// transition指定でgen_chords末尾が準備和音化／未指定=bit一致。

type Chord = { root: number; quality: string; start: number; dur: number };
const chordsOf = (r: ReturnType<typeof genChords>): Chord[] => (r.items[0]!.content as { chords: Chord[] }).chords;
const mod12 = (x: number) => ((x % 12) + 12) % 12;
const findPlan = (plans: KeyPlan[], id: string) => plans.find((p) => p.id === id);

const ROLES = ["intro", "verse", "prechorus", "chorus", "verse", "prechorus", "chorus", "bridge", "chorus"] as const;

describe("suggestKeyPlan（調プラン候補）", () => {
  it("必ず『転調しない案』を先頭に含み、全セクションが基準調のまま", () => {
    const plans = suggestKeyPlan([...ROLES], 0, "major", { count: 6 });
    expect(plans.length).toBeGreaterThanOrEqual(2);
    const first = plans[0]!;
    expect(first.id).toBe("no-mod");
    expect(first.transitions).toHaveLength(0);
    expect(first.sections.every((s) => s.key === 0 && s.mode === "major")).toBe(true);
    expect(first.score).toBe(0);
  });

  it("最終サビ半音上げ＝トラックドライバー（型カタログ準拠の固定値）", () => {
    const key = 5; // F基準でも実音で正しく +1
    const plans = suggestKeyPlan([...ROLES], key, "major", { count: 6 });
    const p = findPlan(plans, "half-final")!;
    expect(p).toBeTruthy();
    const lastChorusIdx = ROLES.lastIndexOf("chorus"); // index 8（曲末）
    // 最後のサビだけ半音上げ、他は基準調。
    p.sections.forEach((s, i) => {
      expect(s.key).toBe(i === lastChorusIdx ? mod12(key + 1) : key);
      expect(s.mode).toBe("major");
    });
    const tr = p.transitions.find((t) => t.to === lastChorusIdx)!;
    expect(tr.typeId).toBe("M-HALF-UP");
    expect(tr.semitones).toBe(1);
    expect(tr.prep).toBe("direct"); // 無準備がトラックドライバーの定番
    expect(tr.returnPlan).toBe("R-NONE"); // 上げっぱなし（曲末）
  });

  it("サビ短3度上げ＝J-pop本命（M-MIN3-UP・重み最上位）", () => {
    const plans = suggestKeyPlan([...ROLES], 0, "major", { count: 6 });
    const p = findPlan(plans, "min3-chorus")!;
    expect(p).toBeTruthy();
    // 全サビが +3、境界は M-MIN3-UP。
    ROLES.forEach((r, i) => { if (r === "chorus") expect(p.sections[i]!.key).toBe(3); });
    const up = p.transitions.filter((t) => t.typeId === "M-MIN3-UP");
    expect(up.length).toBeGreaterThan(0);
    up.forEach((t) => { expect(t.semitones).toBe(3); expect(t.effect).toBe("lift"); });
  });

  it("二大頻出（短3度/半音）が転調案の score 上位に並ぶ", () => {
    const plans = suggestKeyPlan([...ROLES], 0, "major", { count: 6 });
    const mods = plans.slice(1); // 先頭は no-mod
    // score 降順で並んでいる。
    for (let i = 1; i < mods.length; i++) expect(mods[i - 1]!.score).toBeGreaterThanOrEqual(mods[i]!.score);
    // 最上位の転調案が二大頻出のどちらか。
    expect(["min3-chorus", "half-final"]).toContain(mods[0]!.id);
  });

  it("同主調交替は長短を反転（M-PARA・mode flip）", () => {
    const plans = suggestKeyPlan([...ROLES], 0, "major", { count: 8 });
    const p = findPlan(plans, "para-chorus");
    expect(p).toBeTruthy();
    ROLES.forEach((r, i) => { if (r === "chorus") { expect(p!.sections[i]!.mode).toBe("minor"); expect(p!.sections[i]!.key).toBe(0); } });
    const flip = p!.transitions.find((t) => t.typeId === "M-PARA");
    expect(flip).toBeTruthy();
  });

  it("役割にサビ/ブリッジが無ければ転調案は出ない（no-mod のみ）", () => {
    const plans = suggestKeyPlan(["verse", "verse"], 0, "major", { count: 6 });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.id).toBe("no-mod");
  });

  it("空の役割列は空配列", () => {
    expect(suggestKeyPlan([], 0, "major")).toEqual([]);
  });

  it("別表記（Aメロ/Bメロ/サビ）を役割へ吸収する", () => {
    const plans = suggestKeyPlan(["A", "B", "サビ"], 0, "major", { count: 6 });
    // サビ→chorus と解釈され短3度上げ案が生じる。
    const p = findPlan(plans, "min3-chorus");
    expect(p).toBeTruthy();
    expect(p!.sections[2]!.role).toBe("chorus");
    expect(p!.sections[2]!.key).toBe(3);
  });

  it("カタログは12型・二大頻出は重み5", () => {
    expect(MODULATION_CATALOG).toHaveLength(12);
    expect(MODULATION_CATALOG.find((m) => m.id === "M-MIN3-UP")!.weight).toBe(5);
    expect(MODULATION_CATALOG.find((m) => m.id === "M-HALF-UP")!.weight).toBe(5);
  });
});

describe("genChords transition opt（境界の準備和音化）", () => {
  const frame: Frame = { key: 0, mode: "major", bars: 4, meter: "4/4" };

  it("未指定＝bit一致（従来の進行のまま）", () => {
    const a = chordsOf(genChords(frame, 7));
    const b = chordsOf(genChords(frame, 7, undefined, {}));
    expect(b).toEqual(a);
  });

  it("secondary_dominant＝末尾が次調のV7（牽引）に差替・他は不変", () => {
    const base = chordsOf(genChords(frame, 7));
    const withTr = chordsOf(genChords(frame, 7, undefined, { transition: { prep: "secondary_dominant", toKey: 3, toMode: "major" } }));
    expect(withTr.length).toBe(base.length);
    // 末尾以外は不変。
    for (let i = 0; i < base.length - 1; i++) expect(withTr[i]).toEqual(base[i]);
    const tail = withTr[withTr.length - 1]!;
    // 転調先 E♭(=3) の V7 ＝ B♭(=10) 7。
    expect(tail.root).toBe(mod12(3 + 7));
    expect(tail.quality).toBe("7");
    // start/dur は保持。
    expect(tail.start).toBe(base[base.length - 1]!.start);
    expect(tail.dur).toBe(base[base.length - 1]!.dur);
  });

  it("pivot＝末尾が両調共通のダイアトニック和音に差替", () => {
    const base = chordsOf(genChords(frame, 3));
    const withTr = chordsOf(genChords(frame, 3, undefined, { transition: { prep: "pivot", toKey: 7, toMode: "major" } }));
    const tail = withTr[withTr.length - 1]!;
    // C major(0) と G major(7) の共通和音のはず＝両調のダイアトニック三和音に含まれる root。
    const cDia = new Set([0, 2, 4, 5, 7, 9, 11]);
    const gDia = new Set([7, 9, 11, 0, 2, 4, 6]);
    expect(cDia.has(tail.root) && gDia.has(tail.root)).toBe(true);
    // 差替なので末尾以外は不変。
    for (let i = 0; i < base.length - 1; i++) expect(withTr[i]).toEqual(base[i]);
  });
});
