// M4 Scope 7＝**二重実装の番人**（計画 §6-3）。
// 「api 経路と web 経路の一致」は api に実音化が無いので空振り（R2 面C が撤回）。実効があるのは
// 「**music-core の共有関数が、api からも web からも同じ実装として届いているか**」＝
//   (A) 両アプリの公開面から辿った関数が **同一の実装**（参照が同じ）で、同じ入力に同じ出力を返す
//   (B) どちらのアプリにも music-core が持つ名前の**ローカル再定義が生えていない**（drift の芽を摘む）
// の2つ。ドリフトは「片側が自前実装を持った瞬間」に始まるので、そこを機械で見張る。
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as core from "../src/index";

// リポジトリ根＝このファイルから3つ上（packages/music-core/test → 根）。絶対パスを焼かない。
const ROOT = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
const API_LYRIC = join(ROOT, "apps/api/src/lyric.ts");
const WEB_LYRIC = join(ROOT, "apps/web/src/lyrics.ts");

type Mod = Record<string, unknown>;
const load = (p: string): Promise<Mod> => import(/* @vite-ignore */ p) as Promise<Mod>;

// 両アプリの公開面に**同時に**現れる music-core 由来の関数（＝二重実装が起きたら音に効く面）。
const SHARED = ["splitMora", "isKanaOnly", "flowLyric", "placeMoras", "notesInRange", "phraseStatus"] as const;

describe("(A) 共有関数は api・web から同じ実装として届く", () => {
  it("参照が3者（core / api / web）で同一＝実装は1本だけ", async () => {
    const [api, web] = await Promise.all([load(API_LYRIC), load(WEB_LYRIC)]);
    for (const name of SHARED) {
      expect(typeof api[name], `api ${name}`).toBe("function");
      expect(typeof web[name], `web ${name}`).toBe("function");
      expect(api[name], `api!==web: ${name}`).toBe(web[name]);
      expect(api[name], `api!==core: ${name}`).toBe((core as Mod)[name]);
    }
  });

  it("同じ入力に同じ出力（参照一致に頼らず実際に両側から呼ぶ）", async () => {
    const [api, web] = await Promise.all([load(API_LYRIC), load(WEB_LYRIC)]);
    const notes = [
      { pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 },
      { pitch: 64, start: 2, dur: 1 }, { pitch: 65, start: 3, dur: 1 },
    ];
    const moras = ["あ", "い", "う", "え"];
    const range = { start: 0, beats: 4 };
    const cases: [string, (m: Mod) => unknown][] = [
      ["splitMora", (m) => (m.splitMora as (s: string) => string[])("きゃっとにゃーん")],
      ["isKanaOnly", (m) => [(m.isKanaOnly as (s: string) => boolean)("あめのひは"), (m.isKanaOnly as (s: string) => boolean)("雨の日は")]],
      ["notesInRange", (m) => (m.notesInRange as (n: typeof notes, r: typeof range) => number[])(notes, { start: 1, beats: 2 })],
      ["flowLyric", (m) => (m.flowLyric as (n: typeof notes, mo: string[]) => unknown)(notes, moras)],
      ["placeMoras", (m) => (m.placeMoras as (n: typeof notes, mo: string[], r: typeof range) => unknown)(notes, moras, range)],
      ["phraseStatus", (m) => (m.phraseStatus as (r: typeof range, c: number, n: typeof notes) => unknown)(range, 4, notes)],
    ];
    for (const [name, call] of cases) {
      const a = call(api), w = call(web), c = call(core as Mod);
      expect(w, `web≠api: ${name}`).toEqual(a);
      expect(c, `core≠api: ${name}`).toEqual(a);
    }
  });
});

// ── (B) ローカル再定義の走査 ────────────────────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
export interface Redefinition { file: string; name: string; line: number }
/** music-core が持つ**値**の名前（型は対象外＝Note 等はアプリ側で拡張する設計）を、アプリ側が
 *  ローカルに定義していないか探す。import/re-export はヒットしない（宣言の形だけを見る）。 */
function findRedefinitions(files: readonly string[], names: readonly string[]): Redefinition[] {
  const hits: Redefinition[] = [];
  for (const f of files) {
    const lines = readFileSync(f, "utf8").split("\n");
    for (const name of names) {
      const re = new RegExp(`^\\s*(export\\s+)?(async\\s+)?(function|const|let|var|class)\\s+${name}\\b`);
      lines.forEach((t, i) => { if (re.test(t)) hits.push({ file: f.slice(ROOT.length + 1), name, line: i + 1 }); });
    }
  }
  return hits;
}

describe("(B) アプリ側に music-core の名前のローカル再定義が生えていない", () => {
  const coreValueNames = Object.keys(core).filter((k) => typeof (core as Mod)[k] === "function");
  const appFiles = [...walk(join(ROOT, "apps/api/src")), ...walk(join(ROOT, "apps/web/src"))];

  it("走査対象が実在する（空振りで緑になっていない）", () => {
    expect(coreValueNames.length).toBeGreaterThan(50);
    expect(appFiles.length).toBeGreaterThan(100);
  });

  it("再定義 0 件", () => {
    const hits = findRedefinitions(appFiles, coreValueNames);
    expect(hits.map((h) => `${h.file}:${h.line} ${h.name}`)).toEqual([]);
  });

  it("陰性対照：ローカル再実装を1本置けば必ず捕まる", () => {
    const fake = join(ROOT, "packages/music-core/test/fixtures/fake-redefinition.ts");
    const hits = findRedefinitions([fake], coreValueNames);
    expect(hits.map((h) => h.name).sort()).toEqual(["chordPcs", "splitMora"]);
  });
});
