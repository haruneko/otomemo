import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { NoriRow, humanizeSegOf } from "../src/components/NoriRow";
import type { Feel } from "../src/music";

afterEach(cleanup);

// #29 P1-4：ノリ行 UI＝跳ね（swing スライダー）＋人間味（OFF/弱/中/強＝0/0.15/0.25/0.35）。
// 両0＝onChange(undefined)＝feel キー削除（無指定 bit 一致へ復帰）。
describe("#29 P1-4 NoriRow（跳ね＋人間味）", () => {
  it("humanizeSegOf：4段写像＝0/0.15/0.25/0.35＋中間値は最寄り段", () => {
    expect(humanizeSegOf(0)).toBe(0);
    expect(humanizeSegOf(0.15)).toBe(1);
    expect(humanizeSegOf(0.25)).toBe(2);
    expect(humanizeSegOf(0.35)).toBe(3);
    expect(humanizeSegOf(0.2)).toBe(2); // 0.2＝浮動小数で 0.25 側がわずかに近い→中
    expect(humanizeSegOf(0.3)).toBe(2); // 0.3→|0.3-0.25|<|0.3-0.35|→中
    expect(humanizeSegOf(0.5)).toBe(3); // 上限外→強
  });

  it("人間味 中（0.25）タップ＝onChange({humanize:0.25})・seed 既定1・swing 保持", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(<NoriRow feel={{ swing: 0.4 }} onChange={onChange} />);
    fireEvent.click(getByLabelText("nori-humanize-mid"));
    expect(onChange).toHaveBeenCalledWith({ swing: 0.4, humanize: 0.25, seed: 1, swingUnit: undefined });
  });

  it("人間味 強＝0.35", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(<NoriRow feel={undefined} onChange={onChange} />);
    fireEvent.click(getByLabelText("nori-humanize-strong"));
    expect(onChange).toHaveBeenCalledWith({ swing: 0, humanize: 0.35, seed: 1, swingUnit: undefined });
  });

  it("跳ねスライダー＝swing を反映（0.05刻み）", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(<NoriRow feel={{ humanize: 0.25 }} onChange={onChange} />);
    fireEvent.change(getByLabelText("nori-swing"), { target: { value: "0.5" } });
    expect(onChange).toHaveBeenCalledWith({ swing: 0.5, humanize: 0.25, seed: 1, swingUnit: undefined });
  });

  it("両0（人間味 OFF・swing 0）＝onChange(undefined)＝feel キー削除", () => {
    const onChange = vi.fn();
    const feel: Feel = { swing: 0, humanize: 0.25, seed: 3 };
    const { getByLabelText } = render(<NoriRow feel={feel} onChange={onChange} />);
    fireEvent.click(getByLabelText("nori-humanize-off")); // humanize→0・swing すでに0
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("seed/swingUnit は保存値を保持（UI では触らない）", () => {
    const onChange = vi.fn();
    const feel: Feel = { swing: 0.3, humanize: 0.15, seed: 42, swingUnit: "sixteenth" };
    const { getByLabelText } = render(<NoriRow feel={feel} onChange={onChange} />);
    fireEvent.click(getByLabelText("nori-humanize-strong"));
    expect(onChange).toHaveBeenCalledWith({ swing: 0.3, humanize: 0.35, seed: 42, swingUnit: "sixteenth" });
  });

  it("既存 feel の中間値＝最寄り段が点灯（aria-pressed）", () => {
    const { getByLabelText } = render(<NoriRow feel={{ humanize: 0.25 }} onChange={() => {}} />);
    expect(getByLabelText("nori-humanize-mid").getAttribute("aria-pressed")).toBe("true");
    expect(getByLabelText("nori-humanize-off").getAttribute("aria-pressed")).toBe("false");
  });
});
