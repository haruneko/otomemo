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

  // 監査（横断/堅牢性）：不正 content 由来の NaN で <rect> が NaN 属性になり／描画が落ちて一覧全体を巻き込む事故を防ぐ。
  it("不正な数値(NaN)を含むノートを描画しても落ちず、NaN属性の rect を出さない", () => {
    const bad = {
      notes: [
        { pitch: 60, start: 0, dur: 1 }, // 正常
        { pitch: NaN, start: 0, dur: 1 }, // pitch NaN
        { pitch: 62, start: NaN, dur: 1 }, // start NaN
        { pitch: 64, start: 0, dur: NaN }, // dur NaN
      ],
    };
    const { container } = render(<MiniRoll neta={mk("melody", bad)} />);
    const rects = [...container.querySelectorAll("rect")];
    // 正常な1音だけ描かれる
    expect(rects.length).toBe(1);
    for (const r of rects) {
      for (const attr of ["x", "y", "width", "height"]) {
        expect(r.getAttribute(attr)).not.toContain("NaN");
      }
    }
  });

  it("全ノートが不正なら何も描かない（null）", () => {
    const { container } = render(
      <MiniRoll neta={mk("melody", { notes: [{ pitch: NaN, start: NaN, dur: NaN }] })} />,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});
