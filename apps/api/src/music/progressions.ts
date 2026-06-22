// 名前付き進行DB（C基準の度数列＝worker progressions.py のミラー。当面は重複を許容＝設計「フォークリフトしない」）。
// degree は C基準のピッチクラス（C調では degree==root）。名前あて・説明の参照に使う。
import { type Degree } from "./theory";

export type NamedProgression = { name: string; aliases: string[]; degrees: Degree[] };

export const NAMED_PROGRESSIONS: NamedProgression[] = [
  {
    name: "丸の内",
    aliases: ["丸サ", "JtToU", "Just the Two of Us"],
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
