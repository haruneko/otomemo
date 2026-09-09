// M4 Scope 5＝決定論の番人（計画 §6-3）。JS には PYTHONHASHSEED の対応物が無いので、
// 「別プロセス決定論」の代わりに **禁止呼び出しの走査**を置く。対象＝music-core/src 全体
// （phrase_maker から運ぶ知識の置き場・現状 0 件＝これを維持する）。
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  assertCoverage, assertGate, findNondeterminism, nondeterminismGate,
  NONDETERMINISM_RULES, type ScannedFile,
} from "../src/index";

const SRC = new URL("../src/", import.meta.url).pathname;

function walk(dir: string, out: ScannedFile[] = []): ScannedFile[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".ts")) out.push({ path: p.slice(SRC.length), text: readFileSync(p, "utf8") });
  }
  return out;
}

describe("決定論 grep ゲート（music-core/src 全体）", () => {
  const files = walk(SRC);

  it("走査対象が実在する（空振りで緑になっていない）", () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
    expect(files.some((f) => f.path.startsWith("verify/"))).toBe(true);
  });

  it("禁止呼び出しは 0 件（Math.random / Date.now / new Date / crypto.）", () => {
    const g = nondeterminismGate(files);
    if (!g.pass) console.error(g.problems.join("\n"));
    expect(g.problems).toEqual([]);
    expect(() => assertGate(g)).not.toThrow();
    expect(() => assertCoverage(g, 1)).not.toThrow(); // 全ファイルを実際に読んでいる
  });

  it("番人が自分自身を引っかけない（パターンは断片の連結で組んである）", () => {
    const self = files.filter((f) => f.path === "verify/nondeterminism.ts");
    expect(self).toHaveLength(1);
    expect(findNondeterminism(self)).toEqual([]);
  });
});

describe("陰性対照＝故障を注入すれば必ず捕まる（何でも通す検査ではない）", () => {
  const bad: ScannedFile[] = [
    { path: "fake/a.ts", text: "const r = Math.random();" },
    { path: "fake/b.ts", text: "const t = Date.now();" },
    { path: "fake/c.ts", text: "const d = new Date();" },
    { path: "fake/d.ts", text: "const id = crypto.randomUUID();" },
  ];
  it("4種すべてを行番号つきで検出する", () => {
    const hits = findNondeterminism(bad);
    expect(hits.map((h) => h.rule).sort()).toEqual(["crypto", "date-now", "math-random", "new-date"]);
    expect(hits.every((h) => h.line === 1)).toBe(true);
    expect(NONDETERMINISM_RULES).toHaveLength(4);
  });
  it("ゲートは赤になり、出所と該当行を報告する", () => {
    const g = nondeterminismGate(bad);
    expect(g.pass).toBe(false);
    expect(() => assertGate(g)).toThrow(/fake\/a\.ts:1/);
  });
  it("正しい書き方（seed から作る乱数）は通る", () => {
    const good: ScannedFile[] = [{ path: "fake/ok.ts", text: "const rng = mulberry32(seed + SALT.kick);\n// 実行時刻に依存しない" }];
    expect(findNondeterminism(good)).toEqual([]);
  });
  it("複数行・複数ヒットも取りこぼさない", () => {
    const multi: ScannedFile[] = [{ path: "fake/m.ts", text: "a\nMath.random()\nb\nDate.now()\n" }];
    expect(findNondeterminism(multi).map((h) => h.line)).toEqual([2, 4]);
  });
});
