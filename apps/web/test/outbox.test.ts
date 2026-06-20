import { describe, it, expect, vi, beforeEach } from "vitest";
import { queueNeta, outboxCount, flushOutbox } from "../src/outbox";

const { createNeta } = vi.hoisted(() => ({ createNeta: vi.fn() }));
vi.mock("../src/api", () => ({ api: { createNeta } }));

beforeEach(() => {
  localStorage.clear();
  createNeta.mockReset();
});

describe("outbox (offline capture)", () => {
  it("queues and flushes sent items", async () => {
    queueNeta({ kind: "lyric", text: "夜" });
    expect(outboxCount()).toBe(1);
    createNeta.mockResolvedValue({});
    expect(await flushOutbox()).toBe(1);
    expect(outboxCount()).toBe(0);
  });

  it("keeps items that fail to send", async () => {
    queueNeta({ kind: "lyric", text: "a" });
    createNeta.mockRejectedValue(new Error("offline"));
    expect(await flushOutbox()).toBe(0);
    expect(outboxCount()).toBe(1);
  });
});
