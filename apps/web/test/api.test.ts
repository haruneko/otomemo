import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../src/api";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ url, method: init?.method ?? "GET", body: init?.body }),
      text: async () => "",
    })),
  );
});

describe("api client", () => {
  it("createNeta POSTs JSON", async () => {
    const r = (await api.createNeta({ kind: "melody", title: "t" })) as unknown as {
      method: string;
      body: string;
    };
    expect(r.method).toBe("POST");
    expect(JSON.parse(r.body)).toEqual({ kind: "melody", title: "t" });
  });

  it("listNeta builds a faceted query string", async () => {
    const r = (await api.listNeta({ kind: "melody", tags: ["a", "b"] })) as unknown as {
      url: string;
    };
    expect(r.url).toContain("/neta?");
    expect(r.url).toContain("kind=melody");
    expect(decodeURIComponent(r.url)).toContain("tags=a,b");
  });
});
