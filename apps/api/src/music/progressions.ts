// 名前付き進行DB（C基準の度数列＝worker progressions.py のミラー。当面は重複を許容＝設計「フォークリフトしない」）。
// degree は C基準のピッチクラス（C調では degree==root）。名前あて・説明の参照に使う。
import { type Degree } from "./theory";
import { meterInfo } from "./meter";

export type NamedProgression = { name: string; aliases: string[]; degrees: Degree[] };

export const NAMED_PROGRESSIONS: NamedProgression[] = [
  {
    name: "丸の内",
    aliases: ["丸サ", "JtToU", "Just the Two of Us", "marunouchi", "justthetwoofus", "jtou"],
    degrees: [
      { degree: 5, quality: "maj7" }, { degree: 4, quality: "7" }, { degree: 9, quality: "m7" },
      { degree: 7, quality: "m7" }, { degree: 0, quality: "7" },
    ], // FM7-E7-Am7-Gm7-C7
  },
  {
    name: "カノン",
    aliases: ["パッヘルベル", "Canon"],
    degrees: [
      { degree: 0, quality: "" }, { degree: 7, quality: "" }, { degree: 9, quality: "m" }, { degree: 4, quality: "m" },
      { degree: 5, quality: "" }, { degree: 0, quality: "" }, { degree: 5, quality: "" }, { degree: 7, quality: "" },
    ], // C-G-Am-Em-F-C-F-G
  },
  {
    name: "小室",
    aliases: ["6451"],
    degrees: [
      { degree: 9, quality: "m" }, { degree: 5, quality: "" }, { degree: 7, quality: "" }, { degree: 0, quality: "" },
    ], // Am-F-G-C
  },
  {
    name: "王道",
    aliases: ["4536"],
    degrees: [
      { degree: 5, quality: "maj7" }, { degree: 7, quality: "7" }, { degree: 4, quality: "m7" }, { degree: 9, quality: "m7" },
    ], // FM7-G7-Em7-Am7
  },
  {
    name: "アクシス",
    aliases: ["axis", "1564", "ポップパンク", "I-V-vi-IV"],
    degrees: [
      { degree: 0, quality: "" }, { degree: 7, quality: "" }, { degree: 9, quality: "m" }, { degree: 5, quality: "" },
    ], // C-G-Am-F（洋楽4コード定番。2026-07-08 追加＝GのI-V-vi-IVが小室に誤同定される監査ケースの解消）
  },
  {
    name: "エオリアン",
    aliases: ["aeolian", "民族調", "i-bVI-bVII"],
    degrees: [
      { degree: 0, quality: "m" }, { degree: 8, quality: "" }, { degree: 10, quality: "" },
    ], // Am-F-G（短調エオリアン循環＝ボカロ民族調/SURFACE studyで頻出の核進行。2026-07-08 追加）
  },
  {
    name: "ツーファイブ",
    aliases: ["2-5-1", "251", "ii-V-I"],
    degrees: [
      { degree: 2, quality: "m7" }, { degree: 7, quality: "7" }, { degree: 0, quality: "maj7" },
    ], // Dm7-G7-CM7
  },
  {
    name: "ブルース",
    aliases: ["12小節ブルース", "blues"],
    degrees: [
      { degree: 0, quality: "7" }, { degree: 0, quality: "7" }, { degree: 0, quality: "7" }, { degree: 0, quality: "7" },
      { degree: 5, quality: "7" }, { degree: 5, quality: "7" }, { degree: 0, quality: "7" }, { degree: 0, quality: "7" },
      { degree: 7, quality: "7" }, { degree: 5, quality: "7" }, { degree: 0, quality: "7" }, { degree: 7, quality: "7" },
    ],
  },
];

// 照合用に正規化：小文字化・空白/区切り/「進行」除去（worker progressions._norm_query の移植）。
function normQuery(s: string): string {
  let t = (s ?? "").toLowerCase();
  for (const junk of [" ", "　", "進行", "・", "—", "-", "ー", "the", "of"]) t = t.split(junk).join("");
  return t;
}

/** 名前（別名可・表記揺れ可）から進行を引く。見つからねば null。 */
export function findNamedProgression(name: string): NamedProgression | null {
  const q = normQuery(name);
  if (!q) return null;
  for (const entry of NAMED_PROGRESSIONS) {
    for (const alias of [entry.name, ...entry.aliases]) {
      const a = normQuery(alias);
      if (!a) continue;
      // a==q / a in q（「丸の内進行で」） / 短い別名は q in a を3文字以上のときだけ（"ii"/"12"誤マッチ防止）。
      if (a === q || q.includes(a) || (q.length >= 3 && a.includes(q))) return entry;
    }
  }
  return null;
}

export const listNamedProgressions = (): string[] => NAMED_PROGRESSIONS.map((p) => p.name);

/** 名前付き進行を realize（1コード=1小節）＝度数表は C基準、key で実音へ移調。未知は items:[]。 */
export function genNamedProgression(
  name: string,
  frame?: { meter?: string; key?: number } | null,
): { items: { kind: string; content: unknown; label: string }[]; edges: never[] } {
  const entry = findNamedProgression(name);
  if (!entry) return { items: [], edges: [] };
  const bpb = meterInfo(frame?.meter).beatsPerBar;
  const key = ((Math.trunc(frame?.key ?? 0) % 12) + 12) % 12;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const chords = entry.degrees.map((d, i) => ({
    root: (d.degree + key) % 12,
    quality: d.quality,
    start: r3(i * bpb),
    dur: r3(bpb),
  }));
  return {
    items: [{ kind: "chord_progression", content: { chords }, label: `${entry.name}進行`.slice(0, 24) }],
    edges: [],
  };
}
