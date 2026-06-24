// Repository 層の共有ユーティリティ（#6 神クラス分解）。各 repo が import して使う。
import type Database from "better-sqlite3";

export type Db = Database.Database;

export const now = (): string => new Date().toISOString();

// DB の JSON 列は外部書込/部分書込で壊れうる。1行の壊れ JSON で getter/一覧全体が throw するのを防ぐ
// ＝壊れたら null＋warn（無音にしない・design 決定4／reaper.ts と同方針）。
export function parseJsonColumn(s: unknown, col: string): unknown {
  if (s == null) return null;
  try {
    return JSON.parse(s as string);
  } catch {
    console.warn(`[repo] malformed JSON in column "${col}" — treated as null`);
    return null;
  }
}
