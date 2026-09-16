// 繰り返しに変奏の層（design.md 追補 (k-7)）の api テストが共有する条件＝真因調査と同じ 63条件（3進行×7ドラム×3seed・4小節）。
import { genDrums, type DrumsInput } from "../../src/music/generate";

export type Note = { pitch: number; start: number; dur: number };
export type Chord = { root: number; quality: string; start: number; dur: number };
export const BF = { meter: "4/4", bars: 4, key: 0 };
export const prog = (xs: [number, string][]): Chord[] => xs.map(([root, quality], i) => ({ root, quality, start: i * 4, dur: 4 }));
export const PROGS: Record<string, Chord[]> = {
  "王道 IV-V-iii-vi": prog([[5, ""], [7, ""], [4, "m"], [9, "m"]]),
  "ロック i-bVII-bVI-bVII": prog([[9, "m"], [7, ""], [5, ""], [7, ""]]),
  "vi-IV-I-V": prog([[9, "m"], [5, ""], [0, ""], [7, ""]]),
};
export const DRUM_STYLES = ["beat8.basic", "beat16.ghost", "beat8.syncopated", "four.rock", "halftime.basic", "beat16.basic", "dbeat.basic"];
export const SEEDS = [7, 21, 42];
export const drumsOf = (style: string): DrumsInput => genDrums(BF, 1, { style }).items[0]!.content as DrumsInput;
export const CONDS = Object.entries(PROGS).flatMap(([pn, cs]) => DRUM_STYLES.flatMap((ds) => SEEDS.map((seed) => ({ name: `${pn}/${ds}/seed${seed}`, cs, drums: drumsOf(ds), seed }))));
