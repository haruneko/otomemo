import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  mapAccents,
  splitFragments,
  moraPiecesOfPron,
  buildReadings,
  extractReadings,
  READING_MAX_TEXTS,
  READING_MAX_CHARS,
  type AccentResult,
} from "../src/accent";

// W-K1 アクセント自動注入の純関数（accent.py 出力 → analyzeLyricFit の accents）。spawn は実機スモークで別途確認。
// 正典＝docs/research/2026-07-15-kariuta-accent-feasibility.md（L3・phrases[].moras 総和＝syllable 数で round-trip）。
//
// ＋ #31 スライス1（design §31-3・⚠オーナー未レビュー）：表記（漢字仮名交じり）から読みを取る経路。
//   これまでは音符に載ったかなを連結して pyopenjtalk に渡していて（accentsFromSyllables）、実測で高低が
//   48.9% 反転し、しかもモーラ総数が一致するため mapAccents が null を返さず**誤りが素通し**していた。
//   ここで縛るのは (1) まとめて1回で解く (2) 語の列が返る (3) 門番2つが誤った高低を止める、の3点。

describe("mapAccents（アクセント句 → accents 整形・fallback ガード）", () => {
  it("句境界に沿って syllables を切り {kana,kernel} を組む", () => {
    // 「きみのなまえをよんだ」＝3句 [きみの(3), なまえを(4), よんだ(3)]
    const syll = ["き", "み", "の", "な", "ま", "え", "を", "よ", "ん", "だ"];
    const r: AccentResult = { text: "", mora_total: 10, phrases: [{ moras: 3, kernel: 3 }, { moras: 4, kernel: 4 }, { moras: 3, kernel: 3 }] };
    const acc = mapAccents(syll, r);
    expect(acc).toEqual([
      { kana: "きみの", kernel: 3 },
      { kana: "なまえを", kernel: 4 },
      { kana: "よんだ", kernel: 3 },
    ]);
  });

  it("モーラ総数が syllable 数と食い違えば null（＝内蔵ヒューリスティックへ fallback）", () => {
    const syll = ["は", "し"]; // 2モーラ
    const r: AccentResult = { text: "", mora_total: 3, phrases: [{ moras: 3, kernel: 1 }] }; // 3≠2
    expect(mapAccents(syll, r)).toBeNull();
  });

  it("error/空 phrases は null", () => {
    expect(mapAccents(["あ"], { text: "", mora_total: 0, phrases: [], error: "boom" })).toBeNull();
    expect(mapAccents(["あ"], { text: "", mora_total: 0, phrases: [] })).toBeNull();
  });
});

// ── #31-3(b) 断片へ割る（accent.py は 1行1文しか受けられないため） ─────────────
describe("splitFragments（表記 → accent.py へ渡す断片）", () => {
  it("改行で割る", () => {
    expect(splitFragments("君の声が\n聞こえて")).toEqual(["君の声が", "聞こえて"]);
  });

  it("穴（＿1個以上）で割る＝穴そのものは渡さない", () => {
    expect(splitFragments("君の＿＿聞こえて")).toEqual(["君の", "聞こえて"]);
    expect(splitFragments("君の＿聞こえて")).toEqual(["君の", "聞こえて"]);
  });

  it("空の断片は送らない（前後の空白・穴だけの行）", () => {
    expect(splitFragments("　＿＿　\n\n君の声")).toEqual(["君の声"]);
    expect(splitFragments("")).toEqual([]);
    expect(splitFragments("＿＿＿")).toEqual([]);
  });

  it("断片に改行は残らない（1行1文の約束を破らない）", () => {
    for (const f of splitFragments("あ\nい\r\nう＿え")) expect(f).not.toMatch(/[\r\n]/);
  });
});

// ── #31-3 pron（発音カタカナ）→ 音符に載るかな片 ────────────────────────────
describe("moraPiecesOfPron（発音 → モーラ片）", () => {
  it("「’」（無声化の印）を落とす", () => {
    expect(moraPiecesOfPron("ク’ツ")).toEqual(["く", "つ"]);
    expect(moraPiecesOfPron("デス’")).toEqual(["で", "す"]);
  });

  it("拗音は1モーラ・長音ーは1モーラ（analyzeMoras と同じ数え方）", () => {
    expect(moraPiecesOfPron("キョー")).toEqual(["きょ", "ー"]);
  });

  it("かな以外（読点など）は落ちる＝モーラを増やさない", () => {
    expect(moraPiecesOfPron("、")).toEqual([]);
  });
});

// ── #31-3(c) 門番2つ＋断片の組み戻し ────────────────────────────────────────
const W = (surface: string, read: string, pron: string, mora_size: number) => ({ surface, read, pron, mora_size, pos: "名詞" });

describe("buildReadings（accent.py の返り → 句ごとの読み・門番つき）", () => {
  it("語の列とモーラ列を組み、モーラは語を指す", () => {
    const r: AccentResult = {
      text: "雨の日", mora_total: 4, hl: [0, 1, 1, 1],
      phrases: [{ moras: 4, kernel: 0 }],
      words: [W("雨", "アメ", "アメ", 2), W("の", "ノ", "ノ", 1), W("日", "ヒ", "ヒ", 1)],
    };
    const [g] = buildReadings(["雨の日"], [r]);
    expect(g!.words).toEqual([
      { surface: "雨", read: "アメ", pron: "アメ", moraCount: 2 },
      { surface: "の", read: "ノ", pron: "ノ", moraCount: 1 },
      { surface: "日", read: "ヒ", pron: "ヒ", moraCount: 1 },
    ]);
    expect(g!.moras).toEqual([
      { kana: "あ", word: 0 }, { kana: "め", word: 0 }, { kana: "の", word: 1 }, { kana: "ひ", word: 2 },
    ]);
    expect(g!.hl).toEqual([0, 1, 1, 1]);
    expect(g!.error).toBeUndefined();
  });

  it("門番1：かな片の数が mora_size と合わない語だけ word=-1（句は捨てない）", () => {
    const r: AccentResult = {
      text: "雨の日", mora_total: 4, hl: [0, 1, 1, 1],
      phrases: [{ moras: 4, kernel: 0 }],
      words: [W("雨", "アメ", "アメ", 5), W("の", "ノ", "ノ", 1), W("日", "ヒ", "ヒ", 1)], // 5≠2
    };
    const [g] = buildReadings(["雨の日"], [r]);
    expect(g!.moras.map((m) => m.word)).toEqual([-1, -1, 1, 2]); // 合わない語だけ対応不明・他の語は生きる
    expect(g!.moras.map((m) => m.kana)).toEqual(["あ", "め", "の", "ひ"]); // 読みは出す
    expect(g!.hl).toEqual([0, 1, 1, 1]);
  });

  it("門番2：hl の長さがモーラ列と合わなければ hl=null（読みは出す・高低は出さない）", () => {
    const r: AccentResult = {
      text: "雨の日", mora_total: 3, hl: [0, 1, 1], // 3≠4
      phrases: [{ moras: 3, kernel: 0 }],
      words: [W("雨", "アメ", "アメ", 2), W("の", "ノ", "ノ", 1), W("日", "ヒ", "ヒ", 1)],
    };
    const [g] = buildReadings(["雨の日"], [r]);
    expect(g!.hl).toBeNull();
    expect(g!.moras.length).toBe(4);
    expect(g!.breaks).toEqual([]); // 高低が信用できない＝アクセント句の切れ目も出さない
  });

  it("門番2：hl が無い・0/1 以外が混ざる場合も hl=null", () => {
    const base = { text: "の", mora_total: 1, phrases: [{ moras: 1, kernel: 0 }], words: [W("の", "ノ", "ノ", 1)] };
    expect(buildReadings(["の"], [{ ...base }])[0]!.hl).toBeNull();
    expect(buildReadings(["の"], [{ ...base, hl: [2] }])[0]!.hl).toBeNull();
  });

  it("1行の解析失敗は その句だけ error＝他の句は生きる", () => {
    const bad: AccentResult = { text: "あ", mora_total: 0, phrases: [], words: [], error: "boom" };
    const ok: AccentResult = {
      text: "の", mora_total: 1, hl: [0], phrases: [{ moras: 1, kernel: 0 }], words: [W("の", "ノ", "ノ", 1)],
    };
    const gs = buildReadings(["あ", "の"], [bad, ok]);
    expect(gs[0]!.error).toBe("boom");
    expect(gs[0]!.hl).toBeNull();
    expect(gs[1]!.error).toBeUndefined();
    expect(gs[1]!.moras).toEqual([{ kana: "の", word: 0 }]);
  });

  it("穴で割れた断片を1句へ組み戻す（word 添字がずれない・切れ目が入る）", () => {
    const a: AccentResult = {
      text: "雨の", mora_total: 3, hl: [0, 1, 1], phrases: [{ moras: 3, kernel: 0 }],
      words: [W("雨", "アメ", "アメ", 2), W("の", "ノ", "ノ", 1)],
    };
    const b: AccentResult = {
      text: "日", mora_total: 1, hl: [0], phrases: [{ moras: 1, kernel: 0 }], words: [W("日", "ヒ", "ヒ", 1)],
    };
    const [g] = buildReadings(["雨の＿＿日"], [a, b]);
    expect(g!.words.map((w) => w.surface)).toEqual(["雨", "の", "日"]);
    expect(g!.moras).toEqual([
      { kana: "あ", word: 0 }, { kana: "め", word: 0 }, { kana: "の", word: 1 }, { kana: "ひ", word: 2 },
    ]);
    expect(g!.hl).toEqual([0, 1, 1, 0]);
    expect(g!.breaks).toContain(3); // 穴＝読みの切れ目
  });

  it("片方の断片で門番が働けば、その句ぜんたいの hl が null", () => {
    const a: AccentResult = {
      text: "雨の", mora_total: 3, hl: [0, 1], phrases: [{ moras: 3, kernel: 0 }], // hl 短い
      words: [W("雨", "アメ", "アメ", 2), W("の", "ノ", "ノ", 1)],
    };
    const b: AccentResult = {
      text: "日", mora_total: 1, hl: [0], phrases: [{ moras: 1, kernel: 0 }], words: [W("日", "ヒ", "ヒ", 1)],
    };
    expect(buildReadings(["雨の＿日"], [a, b])[0]!.hl).toBeNull();
  });

  it("アクセント句の切れ目を breaks に出す（0 と末尾は入れない）", () => {
    const r: AccentResult = {
      text: "雨の日", mora_total: 4, hl: [0, 1, 1, 1],
      phrases: [{ moras: 3, kernel: 0 }, { moras: 1, kernel: 0 }],
      words: [W("雨", "アメ", "アメ", 2), W("の", "ノ", "ノ", 1), W("日", "ヒ", "ヒ", 1)],
    };
    expect(buildReadings(["雨の日"], [r])[0]!.breaks).toEqual([3]);
  });

  it("表記が空・穴だけの句は 断片ゼロ＝空の読み（error にしない）", () => {
    const gs = buildReadings(["", "＿＿"], []);
    expect(gs.length).toBe(2);
    for (const g of gs) {
      expect(g.words).toEqual([]);
      expect(g.moras).toEqual([]);
      expect(g.hl).toBeNull();
      expect(g.error).toBeUndefined();
    }
  });

  it("断片の数と accent.py の返りの数が合わなければ投げる（黙ってずらさない）", () => {
    const r: AccentResult = { text: "の", mora_total: 1, hl: [0], phrases: [{ moras: 1, kernel: 0 }], words: [W("の", "ノ", "ノ", 1)] };
    expect(() => buildReadings(["雨の＿日"], [r])).toThrow(); // 断片2・返り1
  });

  it("上限は定数で1箇所（http の門番と同じものを使う）", () => {
    expect(READING_MAX_TEXTS).toBe(200);
    expect(READING_MAX_CHARS).toBe(20000);
  });
});

// ── 実機（pyopenjtalk）＝venv が無い環境ではスキップ ────────────────────────
const REPO = resolve(import.meta.dirname, "../../..");
const HAS_VENV = existsSync(process.env.CM_ACCENT_PY ?? join(REPO, "apps/audio/.venv/bin/python"));
const py = HAS_VENV ? describe : describe.skip;

py("extractReadings（実機・pyopenjtalk）", () => {
  it("表記（漢字仮名交じり）から正しい読みが出る＝「今日は雨の日は靴が濡れる」は14モーラ", async () => {
    const [g] = await extractReadings(["今日は雨の日は靴が濡れる"]);
    expect(g!.error).toBeUndefined();
    expect(g!.moras.length).toBe(14); // かな専用の splitMora は 12 と数える（漢字が1字1音に化ける）
    expect(g!.moras.map((m) => m.kana).join("")).toBe("きょーわあめのひわくつがぬれる");
    expect(g!.words.map((w) => w.surface)).toEqual(["今日", "は", "雨", "の", "日", "は", "靴", "が", "濡れる"]);
    expect(g!.words.map((w) => w.read)).toContain("キョウ"); // 読み＝ふりがな用（は→ハ）
    expect(g!.words.map((w) => w.pron)).toContain("ワ");     // 発音＝音符に載る側（は→ワ）
    expect(g!.words.some((w) => w.pron.includes("’"))).toBe(false); // 無声化の印は落とす
    expect(g!.hl!.length).toBe(14);
  }, 30_000);

  it("複数句をまとめて1回で解く（1句ずつ spawn していたら成立しない速さ）", async () => {
    const texts = Array.from({ length: 40 }, (_, i) => `${"あいうえお"[i % 5]}の街を歩いた${i}`);
    const t0 = Date.now();
    const gs = await extractReadings(texts);
    const ms = Date.now() - t0;
    expect(gs.length).toBe(40);
    for (const g of gs) expect(g.moras.length).toBeGreaterThan(0);
    // 実測（2026-07-29）：まとめて1回 0.13秒／1句ずつ40回 3.21秒。1件あたりの起動代が 0.08秒なので
    // 1句ずつなら 3秒は下回らない。ここを 1.5秒で切れば「まとめて渡している」ことが縛れる。
    expect(ms).toBeLessThan(1500);
  }, 30_000);

  it("穴と改行で割れた表記も1句に組み戻る", async () => {
    const [g] = await extractReadings(["雨の日は\n靴が＿＿濡れる"]);
    expect(g!.error).toBeUndefined();
    expect(g!.moras.map((m) => m.kana).join("")).toBe("あめのひわくつがぬれる");
    expect(g!.breaks).toContain(5); // 改行の位置（あめのひわ＝5モーラ）
    expect(g!.breaks).toContain(8); // 穴の位置（＋くつが＝3モーラ）
  }, 30_000);

  it("読みが取れない環境では投げる（呼び側が 502 に落とすため・黙って空を返さない）", async () => {
    const saved = process.env.CM_ACCENT_PY;
    process.env.CM_ACCENT_PY = "/nonexistent/python";
    try {
      await expect(extractReadings(["雨"])).rejects.toThrow();
    } finally {
      if (saved === undefined) delete process.env.CM_ACCENT_PY; else process.env.CM_ACCENT_PY = saved;
    }
  }, 30_000);
});

describe("splitFragments：改行の扱い（断片に改行を残さない＝accent.py は1行1文で読む）", () => {
  it("単独の \\r（旧Mac改行）も行の切れ目として扱う", () => {
    expect(splitFragments("雨の日は\rくつが濡れる")).toEqual(["雨の日は", "くつが濡れる"]);
  });

  it("\\n・\\r\\n・\\r が混ざっても断片に改行が1つも残らない", () => {
    const frags = splitFragments("あ\nい\r\nう\rえ");
    expect(frags).toEqual(["あ", "い", "う", "え"]);
    expect(frags.every((f) => !/[\r\n]/.test(f))).toBe(true);
  });
});
