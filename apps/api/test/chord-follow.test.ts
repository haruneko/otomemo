// コード追従の5ガード（M3-3b・`chordFollow`）＝phrase_maker `bass_rock_riff/chords/chord_follow.py` の移植を
// genBass の第4経路として通す。正典＝docs/design.md §2106 追補 (k)／計画 §5-2 M3。
//
// 受け入れの3分類（計画 §6-4 #1・#8＝M4 で型化済み）：
//   gate           ＝bit 一致（既定 OFF で従来と deepStrictEqual）・②解決しない非整合音 0・変異検査
//   byConstruction ＝⑤リズム不変・①拍頭コードトーン・③区間末の接近音（**被覆率を数値で出す**）
//   diagnostic     ＝写し直した音の数（形の要求はゲートにしない）
//
// **検算側は生成が使う表を import しない**（§6-4 #2）＝このファイルはコードトーン/スケールを
// **リテラルで持つ**（テスト進行に出るクオリティのぶんだけ）。生成器と同じ表を引いたら検算にならない。
import { describe, it, expect } from "vitest";
import { genBass, type DrumsInput } from "../src/music/generate";

type Note = { pitch: number; start: number; dur: number; vel?: number };
type Content = { notes: Note[]; engine?: { version: string }; feel?: unknown };

const FRAME = { bars: 4, meter: "4/4", key: 0 };
// 進行＝m / maj / dom7 / m7（検算表を小さく保つために4クオリティだけ）
const CHORDS = [
  { root: 9, quality: "min", start: 0, dur: 4 },
  { root: 5, quality: "maj", start: 4, dur: 4 },
  { root: 7, quality: "7", start: 8, dur: 4 },
  { root: 2, quality: "m7", start: 12, dur: 4 },
];
const DR: DrumsInput = { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [
  { name: "Kick", midi: 36, hits: [0, 6, 8, 14] }, { name: "Snare", midi: 38, hits: [4, 12] },
] } };

// ── 検算側のリテラル表（生成器の表を借りない＝§6-4 #2） ──────────────────────
//   コードトーン＝教科書どおり。スケール＝源流 `core/chordlib.py` の層B と同じ教科書モード
//   （min→ナチュラルマイナー・maj→メジャー・dom7→ミクソリディアン・m7→ナチュラルマイナー）。
const TONES: Record<string, number[]> = { min: [0, 3, 7], maj: [0, 4, 7], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10] };
const SCALE: Record<string, number[]> = {
  min: [0, 2, 3, 5, 7, 8, 10], maj: [0, 2, 4, 5, 7, 9, 11],
  "7": [0, 2, 4, 5, 7, 9, 10], m7: [0, 2, 3, 5, 7, 8, 10],
};
const chordOf = (t: number) => CHORDS.find((c) => c.start <= t + 1e-9 && t < c.start + c.dur) ?? CHORDS[CHORDS.length - 1]!;
const pcOf = (p: number) => ((p % 12) + 12) % 12;
const isChordTone = (n: Note): boolean => {
  const c = chordOf(n.start);
  return TONES[c.quality]!.some((t) => pcOf(c.root + t) === pcOf(n.pitch));
};
const isInScale = (n: Note): boolean => {
  const c = chordOf(n.start);
  return SCALE[c.quality]!.some((t) => pcOf(c.root + t) === pcOf(n.pitch)) || isChordTone(n);
};
const isBeatHead = (n: Note): boolean => Math.abs(n.start - Math.round(n.start)) < 1e-9;

const gen = (o: object, seed = 42, frame: object = FRAME, chords = CHORDS, drums: DrumsInput | null = DR) =>
  genBass(frame, chords, seed, drums, o);
const content = (o: object, seed = 42, frame: object = FRAME, chords = CHORDS, drums: DrumsInput | null = DR) =>
  gen(o, seed, frame, chords, drums).items[0]!.content as Content;

describe("gate＝既定は 1bit も変わらない（新ノブの鉄則・計画 §6-3 の定型）", () => {
  const variants: [string, object][] = [
    ["section 無し", {}],
    ["section 有り cues 無し", { style: "RK-8ROOT" }],
    ["approach ノブ有り", { approach: 0.8 }],
    ["kickLock 有り", { kickLock: 0.7 }],
    ["anchorLock 有り", { anchorLock: true }],
  ];
  for (const [name, base] of variants) {
    it(`${name}：chordFollow 未指定＝従来 genBass と完全一致`, () => {
      const before = content(base);
      const after = content({ ...base, chordFollow: false });
      expect(after).toEqual(before);
      // anchorLock は別経路なので engine を刻む（3a）。chordFollow 由来のキーが生えないことをここでは見る。
      if (!("anchorLock" in base)) expect("engine" in after).toBe(false);
    });
  }

  it("section/cues の4本立て（cues-cascade の定型）でも未指定なら不変", () => {
    const f1 = { ...FRAME, section: { role: "chorus" } };
    const f2 = { ...FRAME, section: { role: "chorus", cues: [{ kind: "kime", bar: 1 }] } };
    for (const f of [FRAME, f1, f2]) {
      expect(content({}, 7, f)).toEqual(content({ chordFollow: false }, 7, f));
    }
    expect(content({ respondToCues: false }, 7, f2)).toEqual(content({ chordFollow: false, respondToCues: false }, 7, f2));
  });

  it("経路が立たない時は黙って落とさず **meta.warnings** で言う（落ち先で言い分ける）", () => {
    // 通知は meta.warnings（2026-08-29 裁定）＝web/MCP が読む唯一の口。独自キーは無言になる。
    const warns = (r: unknown) => ((r as { meta?: { warnings?: string[] } }).meta?.warnings ?? []);
    const noCh = warns(gen({ chordFollow: true }, 42, FRAME, [], DR));
    expect(noCh.join("|")).toMatch(/コードが無い/);
    const six = warns(gen({ chordFollow: true }, 42, { bars: 2, meter: "6/8", key: 0 }));
    expect(six.join("|")).toMatch(/複合拍子/);
    expect(noCh.join("|")).not.toEqual(six.join("|")); // 落ち先を言い分けている（同じ文言で誤魔化さない）
    // 立ったときは何も言わない＝「立たなかった」と嘘をつかない
    expect(warns(gen({ chordFollow: true }))).toEqual([]);
    // 独自キーは生やさない（web が読まない場所に通知を置かない）
    expect("chordFollowFallback" in (gen({ chordFollow: true }, 42, FRAME, [], DR) as object)).toBe(false);
  });

  it("骨格が明示したベース音は書き換えず、そう告げる（道具が作者を上書きしない）", () => {
    const skeleton = { bars: 4, bass: [{ start: 0, pitch: 45 }, { start: 2, pitch: 45 }] } as never; // 明示点2つ＝区間 [0,2)
    const r = gen({ chordFollow: true, skeleton });
    const ns = (r.items[0]!.content as Content).notes;
    expect(ns.find((n) => Math.abs(n.start) < 1e-9)!.pitch).toBe(45); // 人が書いた音がそのまま残る
    expect(((r as { meta?: { warnings?: string[] } }).meta?.warnings ?? []).join("|")).toMatch(/骨格で明示したベース音/);
  });

  it("新経路を使ったときだけ engine が刻まれる（M0契約 §2）", () => {
    expect(content({ chordFollow: true }).engine?.version).toMatch(/^pm-/);
    expect("engine" in content({})).toBe(false);
  });
});

describe("byConstruction＝5ガード（**被覆率を数値で出す**・計画 §6-4 の 7）", () => {
  it("⑤リズム崩壊の禁止：onset と音価は 1つも動かない（写すのは音高だけ）", () => {
    for (const base of [{}, { style: "RK-8ROOT" }, { anchorLock: true }]) {
      const off = content(base).notes;
      const on = content({ ...base, chordFollow: true }).notes;
      expect(on.length).toBe(off.length);
      expect(on.map((n) => [n.start, n.dur])).toEqual(off.map((n) => [n.start, n.dur]));
      expect(on.map((n) => n.pitch)).not.toEqual(off.map((n) => n.pitch)); // 音高は実際に動いている＝空虚でない
    }
  });

  it("①拍頭はすべてコードトーン（被覆率＝判定できた拍頭／全拍頭）", () => {
    const notes = content({ chordFollow: true, style: "CP-WALK" }).notes;
    const heads = notes.filter(isBeatHead);
    const hit = heads.filter(isChordTone);
    expect(heads.length).toBeGreaterThan(8);          // 分母が空でない（空虚な合格を防ぐ）
    expect(hit.length / heads.length).toBe(1);        // 被覆率 1.0＝全拍頭がコードトーン
    // 陰性対照＝OFF のときは拍頭がコードトーンでない音が実在する（この検査が働く余地がある）
    const offHeads = content({ style: "CP-WALK" }).notes.filter(isBeatHead);
    expect(offHeads.some((n) => !isChordTone(n))).toBe(true);
  });

  it("②解決しない非整合音 0（スケール外は次の音へ半音で解決する接近音だけ）", () => {
    for (const base of [{ style: "CP-WALK" }, { style: "CP-CHROMA" }, { anchorLock: true }, {}]) {
      const notes = content({ ...base, chordFollow: true }).notes;
      let checked = 0, bad = 0;
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i]!;
        checked++;
        if (isInScale(n)) continue;
        const nxt = notes[i + 1];
        if (nxt && Math.abs(n.pitch - nxt.pitch) === 1) continue; // 解決する半音経過音＝説明がつく
        bad++;
      }
      expect(checked).toBeGreaterThan(4);
      expect(bad, JSON.stringify(base)).toBe(0);
    }
  });

  it("④音域窓 [33,48] の内側・start 昇順・重なり無し", () => {
    const notes = content({ chordFollow: true, style: "CP-OCT8" }).notes;
    for (const n of notes) {
      expect(n.pitch).toBeGreaterThanOrEqual(33);
      expect(n.pitch).toBeLessThanOrEqual(48);
      expect(n.dur).toBeGreaterThan(0);
    }
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i]!.start).toBeGreaterThanOrEqual(notes[i - 1]!.start);
      expect(notes[i - 1]!.start + notes[i - 1]!.dur).toBeLessThanOrEqual(notes[i]!.start + 1e-6);
    }
  });

  it("錨（anchorLock）は写し直さない＝構造的契約が上位（キック step のルートが残る）", () => {
    const anchor = content({ anchorLock: true }).notes;
    const both = content({ anchorLock: true, chordFollow: true }).notes;
    // ドラムのキック（step 0,6,8,14＝拍で 0,1.5,2,3.5）の onset は音高まで含めて不変
    const kickBeats = [0, 1.5, 2, 3.5];
    let matched = 0;
    for (const kb of kickBeats) {
      for (let bar = 0; bar < 4; bar++) {
        const t = bar * 4 + kb;
        const a = anchor.find((n) => Math.abs(n.start - t) < 1e-9);
        const b = both.find((n) => Math.abs(n.start - t) < 1e-9);
        if (!a || !b) continue;
        expect(b.pitch, `kick@${t}`).toBe(a.pitch);
        matched++;
      }
    }
    expect(matched).toBeGreaterThanOrEqual(12); // 被覆＝実際に何点も突き合わせた
  });
});

describe("gate＝変異検査（出力に故障を注入して、落ちる不変条件が在ることを見る・§6-4 の 6）", () => {
  const notes = () => content({ chordFollow: true, style: "CP-WALK" }).notes.map((n) => ({ ...n }));

  it("(m2) 拍頭の音を1半音ずらす → ①コードトーンの不変条件が落ちる", () => {
    const ns = notes();
    const i = ns.findIndex(isBeatHead);
    expect(i).toBeGreaterThanOrEqual(0);
    ns[i]!.pitch += 1;
    expect(ns.filter(isBeatHead).every(isChordTone)).toBe(false);
  });

  it("(m4) 区間末の接近音を潰す（解決しない非整合音に差し替え） → ②の不変条件が落ちる", () => {
    const ns = notes();
    // コード区間の最後の onset を、そのコードのスケール外・隣と半音でない音へ
    const seg = CHORDS[1]!;
    let last = -1;
    ns.forEach((n, i) => { if (n.start >= seg.start - 1e-9 && n.start < seg.start + seg.dur - 1e-9) last = i; });
    expect(last).toBeGreaterThanOrEqual(0);
    const bad = [...Array(16).keys()].map((k) => 33 + k).find((p) => {
      const t = { ...ns[last]!, pitch: p };
      const nxt = ns[last + 1];
      return !isInScale(t) && (!nxt || Math.abs(p - nxt.pitch) !== 1);
    });
    expect(bad).toBeDefined();
    ns[last]!.pitch = bad!;
    const unresolved = ns.filter((n, i) => !isInScale(n) && !(ns[i + 1] && Math.abs(n.pitch - ns[i + 1]!.pitch) === 1));
    expect(unresolved.length).toBeGreaterThan(0);
  });

  it("(m5) seed を無視した実装かどうか＝chordFollow 経路は**意図的に RNG を消費しない**", () => {
    // 「seed を変えても同じ」を素直に主張する（源流も決定的＝計画 §6-1）。ただし seed を読む所（既定 fig 経路の
    // 型選抜）まで死んでいないことを対照で見る＝「seed 無視でも同じ」という嘘を書かないため。
    const a = content({ chordFollow: true, style: "CP-WALK" }, 1).notes;
    const b = content({ chordFollow: true, style: "CP-WALK" }, 999).notes;
    expect(b).toEqual(a);                                        // 型を名指しした経路＝決定的
    const c = content({ chordFollow: true }, 1).notes;            // style 未指定＝既定 fig 経路（seed を読む）
    const d = content({ chordFollow: true }, 999).notes;
    expect(d).not.toEqual(c);                                    // fig 経路は seed で変わる＝seed が死んでいない
  });
});

describe("approach ノブとの排他（上位互換＝二重に接近音を作らない・design 追補 (k)）", () => {
  it("chordFollow ON の間は approach の値を振っても出音が変わらない", () => {
    const a = content({ chordFollow: true, approach: 0 }).notes;
    const b = content({ chordFollow: true, approach: 1 }).notes;
    expect(b).toEqual(a);
    // 陰性対照＝OFF なら approach は効く（排他の主張が空虚でない）
    expect(content({ approach: 1 }).notes).not.toEqual(content({ approach: 0 }).notes);
  });
});

describe("diagnostic＝写し直しの量（形の要求はゲートにしない・§6-4 #1）", () => {
  it("何音が動いたかを数値で出す（0 なら経路が空回りしている印）", () => {
    const off = content({ style: "CP-WALK" }).notes;
    const on = content({ chordFollow: true, style: "CP-WALK" }).notes;
    const moved = on.filter((n, i) => n.pitch !== off[i]!.pitch).length;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(on.length);
  });
});
