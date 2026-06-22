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

  it("GET /neta は scope で出し分け（project既定/library/all）＋copy", async () => {
    await app.inject({ method: "POST", url: "/neta", payload: { kind: "melody", title: "作業" } });
    const lib = (await app.inject({ method: "POST", url: "/neta", payload: { kind: "chord_progression", title: "取込", scope: "library" } })).json();
    expect((await app.inject({ method: "GET", url: "/neta" })).json().length).toBe(1); // 既定project
    expect((await app.inject({ method: "GET", url: "/neta?scope=library" })).json().length).toBe(1);
    expect((await app.inject({ method: "GET", url: "/neta?scope=all" })).json().length).toBe(2);
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
});
