import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

let app: FastifyInstance;
beforeEach(async () => {
  app = buildHttp(new Core(openDb(":memory:")));
  await app.ready();
});

describe("http data API", () => {
  it("creates then reads a neta", async () => {
    const c = await app.inject({
      method: "POST",
      url: "/neta",
      payload: { kind: "melody", title: "t", tags: ["a"] },
    });
    expect(c.statusCode).toBe(200);
    const id = c.json().id;
    const g = await app.inject({ method: "GET", url: `/neta/${id}` });
    expect(g.json().tags).toEqual(["a"]);
  });

  it("lists with facet filter", async () => {
    await app.inject({ method: "POST", url: "/neta", payload: { kind: "melody", title: "m" } });
    await app.inject({ method: "POST", url: "/neta", payload: { kind: "lyric", text: "x" } });
    const r = await app.inject({ method: "GET", url: "/neta?kind=melody" });
    expect(r.json().length).toBe(1);
  });

  it("validates input (400)", async () => {
    const r = await app.inject({ method: "POST", url: "/neta", payload: {} });
    expect(r.statusCode).toBe(400);
  });

  it("404 for missing", async () => {
    const r = await app.inject({ method: "GET", url: "/neta/nope" });
    expect(r.statusCode).toBe(404);
  });

  it("composes and reads tree via HTTP", async () => {
    const a = (await app.inject({ method: "POST", url: "/neta", payload: { kind: "song" } })).json();
    const b = (await app.inject({ method: "POST", url: "/neta", payload: { kind: "melody" } })).json();
    await app.inject({ method: "POST", url: "/compose", payload: { parent: a.id, child: b.id } });
    const tree = await app.inject({ method: "GET", url: `/neta/${a.id}/composition` });
    expect(tree.json().children.length).toBe(1);
  });

  it("#20 GET /neta/recommend：library から拍子一致だけを数件返す（生リストを出さない）", async () => {
    const lib = async (kind: string, meter: string) => {
      const n = (await app.inject({ method: "POST", url: "/neta", payload: { kind, meter } })).json();
      await app.inject({ method: "POST", url: `/neta/${n.id}/scope`, payload: { scope: "library" } });
      return n.id;
    };
    const m44 = await lib("melody", "4/4");
    await lib("melody", "3/4"); // 拍子不一致＝除外される
    // project スコープのメロは対象外（library のみ）
    await app.inject({ method: "POST", url: "/neta", payload: { kind: "melody", meter: "4/4" } });
    const r = await app.inject({ method: "GET", url: "/neta/recommend?kind=melody&meter=4/4&top=6" });
    expect(r.statusCode).toBe(200);
    const ids = (r.json() as { id: string }[]).map((x) => x.id);
    expect(ids).toEqual([m44]); // 4/4 の library メロ1件だけ
  });

  it("API JSON は Cache-Control: no-store（モバイルが古い合成ツリーを出し続けない）", async () => {
    const g = await app.inject({ method: "GET", url: "/neta?limit=1" });
    expect(g.headers["cache-control"]).toBe("no-store");
  });

  it("#9 /music/detect_key_chords：コードから調候補(key+mode)を返す", async () => {
    // C-Am-F-G（C major / A minor の素材）。第1候補は C major か A minor。
    const r = await app.inject({
      method: "POST",
      url: "/music/detect_key_chords",
      payload: { chords: ["C", "Am", "F", "G"] },
    });
    expect(r.statusCode).toBe(200);
    const cands = r.json().candidates as { key: number; mode: string }[];
    expect(cands.length).toBeGreaterThan(0);
    expect(cands[0]).toHaveProperty("key");
    expect(cands[0]).toHaveProperty("mode");
    // C major(key0) か その相対 A minor(key9) が上位に来る。
    const top = cands.slice(0, 3).map((c) => `${c.key}:${c.mode}`);
    expect(top.some((t) => t === "0:major" || t === "9:minor")).toBe(true);
  });
});

describe("http auth gate (#36)", () => {
  it("blocks without token when CM_TOKEN is set, allows with it", async () => {
    const prev = process.env.CM_TOKEN;
    process.env.CM_TOKEN = "secret";
    try {
      const gated = buildHttp(new Core(openDb(":memory:")));
      await gated.ready();
      const no = await gated.inject({ method: "GET", url: "/neta" });
      expect(no.statusCode).toBe(401);
      const yes = await gated.inject({
        method: "GET",
        url: "/neta",
        headers: { "x-cm-token": "secret" },
      });
      expect(yes.statusCode).toBe(200);
    } finally {
      if (prev === undefined) delete process.env.CM_TOKEN;
      else process.env.CM_TOKEN = prev;
    }
  });

  it("POST /music/:op は TS 生成/分析に委譲（worker dispatch の委譲先・S2）", async () => {
    const ch = await app.inject({ method: "POST", url: "/music/gen_chords", payload: { frame: { bars: 4, meter: "4/4" } } });
    expect(ch.statusCode).toBe(200);
    const chords = ch.json().items[0].content.chords;
    expect(chords.length).toBe(4);
    expect(chords[0].root).toBe(0); // T始まり
    const fit = await app.inject({ method: "POST", url: "/music/analyze_fit", payload: { melody: [{ pitch: 60, start: 0, dur: 1 }], chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } });
    expect(fit.json()).toHaveProperty("score");
    const bad = await app.inject({ method: "POST", url: "/music/nope", payload: {} });
    expect(bad.statusCode).toBe(404);
    // dogfood P1: melody を {notes} で渡しても 500 でなく動く（生成物をそのまま検証に回せる）
    const wrapped = await app.inject({ method: "POST", url: "/music/analyze_fit", payload: { melody: { notes: [{ pitch: 60, start: 0, dur: 1 }] }, chords: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } } });
    expect(wrapped.statusCode).toBe(200);
    expect(wrapped.json()).toHaveProperty("score");
    // dogfood P3: コード名文字列で受ける（"FM7" 等・root 0-11 手入力不要）
    const named = await app.inject({ method: "POST", url: "/music/identify_progression", payload: { chords: ["FM7", "E7", "Am7", "Gm7", "C7"], key: 0 } });
    expect(named.json()[0].name).toBe("丸の内");
  });

  it("POST /gen/section は生成→ネタ化→合成を1コールで（dogfood P4）", async () => {
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { frame: { bars: 4, mood: "切ない" }, parts: ["chord_progression", "melody", "bass", "rhythm"], seed: 7 } });
    expect(r.statusCode).toBe(200);
    const { section, composition } = r.json();
    expect(section.kind).toBe("section");
    expect(composition.children.length).toBe(4); // 4パートが section に compose 済
    const kinds = composition.children.map((c: any) => c.node.neta.kind).sort();
    expect(kinds).toEqual(["bass", "chord_progression", "melody", "rhythm"]);
  });

  it("POST /gen/section は素直な part名(chords/drums)も受ける＋tags尊重（df2-B）", async () => {
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { parts: ["chords", "drums"], frame: { bars: 2 }, tags: ["dogfood2"] } });
    const { section, composition } = r.json();
    const kinds = composition.children.map((c: any) => c.node.neta.kind).sort();
    expect(kinds).toEqual(["chord_progression", "rhythm"]); // chords→chord_progression, drums→rhythm
    expect(section.tags).toContain("dogfood2"); // 呼び出し側 tags を尊重
  });

  it("GET /health はトークン不要で jobs 統計を返す（S4）", async () => {
    const prev = process.env.CM_TOKEN;
    process.env.CM_TOKEN = "secret";
    try {
      const gated = buildHttp(new Core(openDb(":memory:")));
      await gated.ready();
      const r = await gated.inject({ method: "GET", url: "/health" }); // トークン無しでも通る
      expect(r.statusCode).toBe(200);
      expect(r.json().ok).toBe(true);
      expect(r.json().jobs).toHaveProperty("queued");
    } finally {
      if (prev === undefined) delete process.env.CM_TOKEN;
      else process.env.CM_TOKEN = prev;
    }
  });

  it("GET /neta は scope で出し分け（project既定/library/all）＋copy", async () => {
    await app.inject({ method: "POST", url: "/neta", payload: { kind: "melody", title: "作業" } });
    const lib = (await app.inject({ method: "POST", url: "/neta", payload: { kind: "chord_progression", title: "取込", scope: "library" } })).json();
    expect((await app.inject({ method: "GET", url: "/neta" })).json().length).toBe(1); // 既定project
    expect((await app.inject({ method: "GET", url: "/neta?scope=library" })).json().length).toBe(1);
    expect((await app.inject({ method: "GET", url: "/neta?scope=all" })).json().length).toBe(2);
    // 無効scopeは素通しせず既定(project)へ（旧: 無検証キャストで where scope='garbage' になっていた）
    expect((await app.inject({ method: "GET", url: "/neta?scope=garbage" })).json().length).toBe(1);
    // copy: library→project
    const copy = await app.inject({ method: "POST", url: `/neta/${lib.id}/copy` });
    expect(copy.statusCode).toBe(200);
    expect(copy.json().scope).toBe("project");
    expect((await app.inject({ method: "GET", url: "/neta" })).json().length).toBe(2); // copyがproject側に増えた
  });

  it("links then unlinks a relation via HTTP (#102 S3 承認適用)", async () => {
    const a = (await app.inject({ method: "POST", url: "/neta", payload: { kind: "melody", title: "a" } })).json();
    const b = (await app.inject({ method: "POST", url: "/neta", payload: { kind: "melody", title: "b" } })).json();
    const ln = await app.inject({ method: "POST", url: "/relation", payload: { from: a.id, to: b.id, type: "ref" } });
    expect(ln.statusCode).toBe(200);
    let rel = (await app.inject({ method: "GET", url: `/neta/${a.id}/relations` })).json();
    expect(rel.length).toBe(1);
    const un = await app.inject({ method: "POST", url: "/relation/remove", payload: { from: a.id, to: b.id, type: "ref" } });
    expect(un.statusCode).toBe(200);
    rel = (await app.inject({ method: "GET", url: `/neta/${a.id}/relations` })).json();
    expect(rel.length).toBe(0);
  });

  it("realized_from は双方向で見える＝メロ側は骨格へ・骨格側はメロへ辿れる（design #20 見える化）", async () => {
    const skel = (await app.inject({ method: "POST", url: "/neta", payload: { kind: "skeleton", title: "骨格" } })).json();
    const mel = (await app.inject({ method: "POST", url: "/neta", payload: { kind: "melody", title: "吹いたメロ" } })).json();
    // realized_from は「メロ→骨格」向きに張る（api 実装済みの向き）。
    await app.inject({ method: "POST", url: "/relation", payload: { from: mel.id, to: skel.id, type: "realized_from" } });
    // メロ側＝outgoing で骨格が見える（「← 元の骨格」）。
    const fromMel = (await app.inject({ method: "GET", url: `/neta/${mel.id}/relations` })).json();
    expect(fromMel).toContainEqual(expect.objectContaining({ type: "realized_from", neta: expect.objectContaining({ id: skel.id }) }));
    // 骨格側＝逆引きでメロが見える（「→ 吹いたメロ」）。逆向き結線が無いと空になる回帰ガード。
    const fromSkel = (await app.inject({ method: "GET", url: `/neta/${skel.id}/relations` })).json();
    expect(fromSkel).toContainEqual(expect.objectContaining({ type: "realized_from", neta: expect.objectContaining({ id: mel.id }) }));
  });

  // 初回ロード軽量化：一覧(GET /neta)は巨大content(study/analysis 等)を content:null に落とす。
  // 全文は開いた時に GET /neta/:id で取る。小さい music content(一覧のMiniRoll/試聴で使う)は残す。
  it("GET /neta omits heavy content but /neta/:id returns full content", async () => {
    const heavy = { blob: "x".repeat(40000) }; // 40KB > 32KB 閾値
    const study = (
      await app.inject({ method: "POST", url: "/neta", payload: { kind: "study", title: "big", content: heavy } })
    ).json();
    const small = { notes: [{ pitch: 60, start: 0, dur: 1 }] };
    const mel = (
      await app.inject({ method: "POST", url: "/neta", payload: { kind: "melody", title: "mel", content: small } })
    ).json();

    const list = (await app.inject({ method: "GET", url: "/neta" })).json() as { id: string; content: unknown }[];
    const listStudy = list.find((n) => n.id === study.id)!;
    const listMel = list.find((n) => n.id === mel.id)!;
    expect(listStudy.content).toBeNull(); // 重いので一覧では落とす
    expect(listMel.content).toEqual(small); // 軽いメロは一覧でも残す

    // 全文は個別取得で復元できる（エディタはこちらで開く）。
    const full = (await app.inject({ method: "GET", url: `/neta/${study.id}` })).json();
    expect(full.content).toEqual(heavy);
  });
});

// 骨格層の一級化（design #20 S2）：HTTP /music 経路に gen_skeleton と gen_melody(skeletonNetaId) を露出。
describe("skeleton music routes (#20 S2)", () => {
  it("POST /music/gen_skeleton＝骨格候補（items[].content=SkeletonContent）", async () => {
    const r = await app.inject({ method: "POST", url: "/music/gen_skeleton", payload: { frame: { key: 0, meter: "4/4", bars: 4 }, seed: 1 } });
    expect(r.statusCode).toBe(200);
    const item = r.json().items[0];
    expect(item.kind).toBe("skeleton");
    expect(Array.isArray(item.content.tones)).toBe(true);
    expect(item.content.bars).toBe(4);
  });

  it("POST /music/gen_melody（skeletonNetaId）＝骨格注入＋id エコー", async () => {
    const skel = (await app.inject({
      method: "POST",
      url: "/neta",
      payload: { kind: "skeleton", content: { bars: 2, tones: [{ start: 0, pitch: 64 }, { start: 4, pitch: 67 }] } },
    })).json();
    const r = await app.inject({ method: "POST", url: "/music/gen_melody", payload: { frame: { key: 0, meter: "4/4", bars: 2 }, seed: 3, skeletonNetaId: skel.id } });
    expect(r.statusCode).toBe(200);
    expect(r.json().skeletonNetaId).toBe(skel.id);
    expect(r.json().items[0].kind).toBe("melody");
  });

  it("非skeleton の id は 400", async () => {
    const mel = (await app.inject({ method: "POST", url: "/neta", payload: { kind: "melody" } })).json();
    const r = await app.inject({ method: "POST", url: "/music/gen_melody", payload: { frame: { key: 0, meter: "4/4", bars: 2 }, skeletonNetaId: mel.id } });
    expect(r.statusCode).toBe(400);
  });
});
