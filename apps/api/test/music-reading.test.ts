// #31 スライス1（design §31-3(d)・⚠オーナー未レビュー）：画面から叩く読み取りの口 `POST /music/reading`。
//
// ここで縛る一番のことは **失敗の返し分け**。`/music/:op` は switch 全体を1つの try/catch で包み、
// 投げられたものを全部 400 にする（http.ts の末尾）。読み取りの機械側が転んだのを 400 で返すと、
// 画面は「入力が変」と区別できず「読みが取れませんでした」の規則が効かない。
// ＝この case は **自分の中で 502 を返し、外へ throw しない**。
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { READING_MAX_TEXTS, READING_MAX_CHARS } from "../src/accent";

let app: FastifyInstance;
beforeEach(async () => {
  app = buildHttp(new Core(openDb(":memory:")));
  await app.ready();
});

const post = (payload: unknown) => app.inject({ method: "POST", url: "/music/reading", payload: payload as object });

describe("POST /music/reading（入力の門番＝400）", () => {
  it("texts が無い / 配列でない / 文字列でない要素 は 400", async () => {
    expect((await post({})).statusCode).toBe(400);
    expect((await post({ texts: "雨" })).statusCode).toBe(400);
    expect((await post({ texts: ["雨", 3] })).statusCode).toBe(400);
  });

  it("件数の上限を超えたら 400", async () => {
    const r = await post({ texts: Array.from({ length: READING_MAX_TEXTS + 1 }, () => "雨") });
    expect(r.statusCode).toBe(400);
  });

  it("合計の字数の上限を超えたら 400", async () => {
    const r = await post({ texts: ["雨".repeat(READING_MAX_CHARS + 1)] });
    expect(r.statusCode).toBe(400);
  });

  it("上限ちょうどは通す（400 にしない）", async () => {
    const r = await post({ texts: Array.from({ length: READING_MAX_TEXTS }, () => "") }); // 空表記＝Python を呼ばない
    expect(r.statusCode).toBe(200);
    expect(r.json().results.length).toBe(READING_MAX_TEXTS);
  });
});

describe("POST /music/reading（機械側の失敗＝502・400 と混ぜない）", () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.CM_ACCENT_PY; process.env.CM_ACCENT_PY = "/nonexistent/python"; });
  afterEach(() => { if (saved === undefined) delete process.env.CM_ACCENT_PY; else process.env.CM_ACCENT_PY = saved; });

  it("Python が起こせなければ 502（入力は正しいので 400 ではない）", async () => {
    const r = await post({ texts: ["雨の日"] });
    expect(r.statusCode).toBe(502);
    expect(typeof r.json().error).toBe("string");
  }, 30_000);
});

const REPO = resolve(import.meta.dirname, "../../..");
const HAS_VENV = existsSync(process.env.CM_ACCENT_PY ?? join(REPO, "apps/audio/.venv/bin/python"));
const py = HAS_VENV ? describe : describe.skip;

py("POST /music/reading（実機・正常系）", () => {
  it("複数の表記を1回で解き、句の順に返す", async () => {
    const r = await post({ texts: ["今日は雨の日は靴が濡れる", "君の声が聞こえて", ""] });
    expect(r.statusCode).toBe(200);
    const { results } = r.json() as { results: { moras: { kana: string }[]; hl: number[] | null; error?: string }[] };
    expect(results.length).toBe(3);
    expect(results[0]!.moras.length).toBe(14);
    expect(results[1]!.moras.map((m) => m.kana).join("")).toBe("きみのこえがきこえて");
    expect(results[2]!.moras).toEqual([]); // 空の表記は Python を呼ばずに空で返す
  }, 30_000);
});
