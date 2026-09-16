// オーナー自作の6拍子を型として追加（2026-09-16 裁定「足す」・原文＝docs/backlog.md 2026-09-13）。
// 契約：POST /music/gen_drums で style=型ID を指定すると、原文どおりのスネア/バスドラ打点が返る。
import { describe, it, expect } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

// 原文（1文字＝8分・2小節）。これを 12格子/小節（16分基底）へ写す＝8分 i 番目は step 2i。
const SD = ".x..x. ..x...";
const BD = "x..x.. x...x.";
const toSteps = (s: string) => [...s.replace(/ /g, "")].flatMap((c, i) => (c === "x" ? [i * 2] : []));

describe("オーナー自作の6拍子（owner.six8）", () => {
  it("POST /music/gen_drums style=owner.six8 → 原文どおりの2小節（snare/kick のみ）", async () => {
    const app = buildHttp(new Core(openDb(":memory:")));
    await app.ready();
    const r = await app.inject({ method: "POST", url: "/music/gen_drums", payload: { frame: { meter: "6/8", bars: 2, tempo: 100 }, seed: 1, style: "owner.six8" } });
    expect(r.statusCode).toBe(200);
    const rh = r.json().items[0].content.rhythm as { steps: number; bars: number; patternId: string; lanes: { name: string; midi: number; hits: number[] }[] };
    expect(rh.patternId).toBe("owner.six8");
    expect(rh.bars).toBe(2);
    expect(rh.steps).toBe(24);
    expect(rh.lanes.map((l) => l.midi).sort()).toEqual([36, 38]); // 他レーンは足していない
    expect(rh.lanes.find((l) => l.midi === 38)!.hits).toEqual(toSteps(SD)); // [2,8,16]
    expect(rh.lanes.find((l) => l.midi === 36)!.hits).toEqual(toSteps(BD)); // [0,6,12,20]
    await app.close();
  });
});
