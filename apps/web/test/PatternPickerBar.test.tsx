import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatternPickerBar, type PatternCand } from "../src/components/PatternPickerBar";

// Task1f（design「### Task1f」・正典 2026-07-23-pattern-picker-demotion-plan §2案A）
// ＝「パターンを選ぶ」帯を「ライブラリから読み込む」二次リンクへ格下げ。
// 変えるのは見出しの variant（配置/目立ち）＋文言だけ＝候補取得(onFetch)・試聴/適用の body は完全共有・不変（bit 一致）。
const CHIPS = [
  { v: "", label: "おまかせ" },
  { v: "rock", label: "ロック" },
];
const CANDS: PatternCand[] = [
  { key: "k0", name: "CP-POP1", scene: "verse", audition: vi.fn(), apply: vi.fn() },
];

describe("PatternPickerBar variant（Task1f 格下げ）", () => {
  // (d) 退避経路＝variant 既定 "bar"＝現行の帯（見出し「パターンを選ぶ」・aria 不変）。
  it('(d) variant 既定="bar"＝現行帯（「パターンを選ぶ」・pattern-picker-toggle 維持）', () => {
    render(<PatternPickerBar chips={CHIPS} onFetch={async () => []} />);
    const picker = screen.getByLabelText("pattern-picker");
    expect(picker.classList.contains("pp-link")).toBe(false);
    const toggle = screen.getByLabelText("pattern-picker-toggle");
    expect(toggle.textContent).toContain("パターンを選ぶ");
    expect(toggle.textContent).not.toContain("ライブラリから読み込む");
  });

  // (a) 格下げ＝variant="link"＝小リンク・文言「ライブラリから読み込む」・aria は維持。
  it('(a) variant="link"＝小リンク「ライブラリから読み込む」（aria 維持）', () => {
    render(<PatternPickerBar variant="link" chips={CHIPS} onFetch={async () => []} nowLabel="CP-POP1" />);
    const picker = screen.getByLabelText("pattern-picker");
    expect(picker.classList.contains("pp-link")).toBe(true);
    const toggle = screen.getByLabelText("pattern-picker-toggle");
    expect(toggle.textContent).toContain("ライブラリから読み込む");
    expect(toggle.textContent).not.toContain("パターンを選ぶ");
    expect(screen.getByLabelText("pattern-now").textContent).toContain("いま：CP-POP1"); // 「いま：<型>」維持
  });

  // (b) 開くと従来 body（chip→候補取得→カード→▶試聴→適用）が共有で出る＝link でも body 不変。
  it("(b) link 見出し押下→従来 body（chip/候補/▶/読み込む）", async () => {
    const user = userEvent.setup();
    const onFetch = vi.fn(async () => CANDS);
    render(<PatternPickerBar variant="link" chips={CHIPS} onFetch={onFetch} />);
    await user.click(screen.getByLabelText("pattern-picker-toggle"));
    expect(screen.getByLabelText("pattern-genres")).toBeTruthy();
    await user.click(screen.getByLabelText("pattern-fetch"));
    expect(await screen.findByLabelText("pattern-card-0")).toBeTruthy();
    expect(screen.getByLabelText("pattern-audition-0")).toBeTruthy();
    // 適用ボタンは link＝文言「読み込む」だが aria-label は pattern-apply-* を維持（テスト非破壊）。
    const apply = screen.getByLabelText("pattern-apply-0");
    expect(apply.textContent).toBe("読み込む");
  });

  // (c) 適用＝候補の apply（content 置換）を呼ぶ＝ロジック不変。bar 退避では文言「適用」。
  it("(c) 適用クリック＝cand.apply 発火（apply 不変）／bar は文言「適用」", async () => {
    const user = userEvent.setup();
    const apply = vi.fn();
    const cands: PatternCand[] = [{ key: "k0", name: "CP-POP1", audition: vi.fn(), apply }];
    render(<PatternPickerBar variant="bar" chips={CHIPS} onFetch={async () => cands} />);
    await user.click(screen.getByLabelText("pattern-picker-toggle"));
    await user.click(screen.getByLabelText("pattern-fetch"));
    const btn = await screen.findByLabelText("pattern-apply-0");
    expect(btn.textContent).toBe("適用"); // 退避＝現行文言
    await user.click(btn);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
