import { describe, it, expect, beforeEach } from "vitest";
import { loadColors, saveColors, DEFAULT_COLORS } from "../src/theme";

beforeEach(() => localStorage.clear());

describe("theme colors", () => {
  it("returns defaults when nothing saved", () => {
    expect(loadColors()).toEqual(DEFAULT_COLORS);
  });

  it("persists overrides and merges with defaults", () => {
    saveColors({ ...DEFAULT_COLORS, melody: "#000000" });
    expect(loadColors().melody).toBe("#000000");
    expect(loadColors().rhythm).toBe(DEFAULT_COLORS.rhythm);
  });
});
