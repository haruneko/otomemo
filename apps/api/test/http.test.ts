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
