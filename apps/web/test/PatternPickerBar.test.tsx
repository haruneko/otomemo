import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatternPickerBar } from "../src/components/PatternPickerBar";

// Task1g（design「### Task1g＝パターン取得を…ライブラリをブラウズ」）＝Task1f の chip→固定4件 body を撤回。
// PatternPickerBar は「⤓ ライブラリから読み込む」二次リンクの器だけ持つ＝クリックで onOpen（pick ダイアログを開く）。
// 「いま：<型>」表示（現在 patternId・（改）は呼び側が付ける）は維持＝選び直し兼用の家。
describe("PatternPickerBar（Task1g 入口リンク）", () => {
  it("リンク＝『ライブラリから読み込む』・aria は pattern-picker / pattern-picker-toggle 維持・pp-link 枠", () => {
    render(<PatternPickerBar onOpen={vi.fn()} />);
    const picker = screen.getByLabelText("pattern-picker");
    expect(picker.classList.contains("pp-link")).toBe(true);
    const toggle = screen.getByLabelText("pattern-picker-toggle");
    expect(toggle.textContent).toContain("ライブラリから読み込む");
  });

  it("nowLabel があれば『いま：<型>』を表示", () => {
    render(<PatternPickerBar onOpen={vi.fn()} nowLabel="CP-POP1（改）" />);
    expect(screen.getByLabelText("pattern-now").textContent).toContain("いま：CP-POP1（改）");
  });

  it("nowLabel が無ければ『いま：』は出ない", () => {
    render(<PatternPickerBar onOpen={vi.fn()} />);
    expect(screen.queryByLabelText("pattern-now")).toBeNull();
  });

  it("クリック＝onOpen 発火（pick ダイアログを開く）＝chip/候補 body は持たない", async () => {
    const onOpen = vi.fn();
    render(<PatternPickerBar onOpen={onOpen} />);
    // 旧 body（chip→候補→カード）は撤去＝出ない。
    expect(screen.queryByLabelText("pattern-genres")).toBeNull();
    expect(screen.queryByLabelText("pattern-fetch")).toBeNull();
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
