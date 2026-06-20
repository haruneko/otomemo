import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MiniRoll } from "../src/components/MiniRoll";
import type { Neta } from "../src/api";

const mk = (kind: string, content: unknown): Neta => ({
  id: "x",
  kind,
  title: null,
  text: null,
  content,
  key: null,
  mode: null,
  tempo: null,
  meter: null,
  bars: null,
  mood: null,
  tags: [],
  created: "",
  updated: "",
});

describe("MiniRoll (#48)", () => {
  it("renders one rect per melody note", () => {
    const { container } = render(
      <MiniRoll
        neta={mk("melody", {
          notes: [
            { pitch: 60, start: 0, dur: 1 },
            { pitch: 64, start: 1, dur: 1 },
          ],
        })}
      />,
    );
    expect(container.querySelectorAll("rect").length).toBe(2);
  });

  it("renders nothing for non-music kinds", () => {
    const { container } = render(<MiniRoll neta={mk("lyric", null)} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
