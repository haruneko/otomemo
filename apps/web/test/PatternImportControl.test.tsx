import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

// Task1j（design「### Task1j＝パターン取込の共通化…」）：3エディタが各自持っていた入口ボタン＋importOpen＋dialog を
// 集約する共通コンポーネント PatternImportControl の TDD：
//  (a) 入口＝library アイコン付きボタン（「ライブラリから読み込む」）＋「いま：<型>」。
//  (d) onPick→onApply(content)＋閉／onPreview→onAudition(content)／onClose(✕/背景)→onClose 注入（＝各エディタの
//      applyPattern/auditionPattern/ppPlay.stop を素通し＝bit一致）。
const api = vi.hoisted(() => ({ listNeta: vi.fn() }));
vi.mock("../src/api", () => ({ api }));
vi.mock("../src/components/MiniRoll", () => ({ MiniRoll: () => <div data-testid="mini-roll" /> }));

import { PatternImportControl } from "../src/components/PatternImportControl";

const neta = (over: Partial<Neta> = {}): Neta => ({
  id: "n1", kind: "chord_pattern", title: "GT-FOLK8", text: null,
  content: { patternId: "GT-FOLK8", hits: [{ step: 0, dur: 4 }] }, key: 0, mode: null, tempo: null, meter: null,
  bars: null, mood: null, scope: "library", tags: [], created: "", updated: "", ...over,
});

describe("Task1j PatternImportControl（共通化＝入口ボタン＋dialog）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("(a) 入口＝library アイコン付きボタン＋『ライブラリから読み込む』＋『いま：<型>』", () => {
    render(<PatternImportControl kind="chord_pattern" fallbackName="コード楽器" nowLabel="GT-FOLK8（改）" onApply={vi.fn()} onAudition={vi.fn()} />);
    const btn = screen.getByLabelText("pattern-picker-toggle");
    expect(btn.tagName).toBe("BUTTON"); // リンクでなくボタン
    expect(btn.querySelector("svg")).toBeTruthy(); // Icon name="library"（SVG）
    expect(btn.textContent).toContain("ライブラリから読み込む");
    expect(screen.getByLabelText("pattern-now").textContent).toContain("いま：GT-FOLK8（改）");
    expect(screen.getByLabelText("pattern-picker").classList.contains("pp-link")).toBe(true);
  });

  it("nowLabel 無しなら『いま：』は出ない・既定はダイアログ閉", () => {
    render(<PatternImportControl kind="rhythm" fallbackName="おまかせ" onApply={vi.fn()} onAudition={vi.fn()} />);
    expect(screen.queryByLabelText("pattern-now")).toBeNull();
    expect(screen.queryByLabelText("pattern-import")).toBeNull();
  });

  it("(d) ボタン押下でダイアログが開き listNeta を {kind, scope:'all'} で引く", async () => {
    api.listNeta.mockResolvedValue([neta()]);
    render(<PatternImportControl kind="chord_pattern" fallbackName="コード楽器" onApply={vi.fn()} onAudition={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    expect(screen.getByLabelText("pattern-import")).toBeTruthy();
    const q = api.listNeta.mock.calls[0]![0] as { kind: string; scope: string };
    expect(q.kind).toBe("chord_pattern");
    expect(q.scope).toBe("all");
  });

  it("(d) タップ＝onApply(content) を注入呼び＋ダイアログを閉じる（onPick→onApply）", async () => {
    api.listNeta.mockResolvedValue([neta()]);
    const onApply = vi.fn();
    render(<PatternImportControl kind="chord_pattern" fallbackName="コード楽器" onApply={onApply} onAudition={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await userEvent.click(await screen.findByLabelText("import-pick-0"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).toEqual({ patternId: "GT-FOLK8", hits: [{ step: 0, dur: 4 }] }); // neta.content 素通し
    expect(screen.queryByLabelText("pattern-import")).toBeNull(); // 採用で閉じる
  });

  it("(d) ▶＝onAudition(content) を注入呼び（onPreview→onAudition・閉じない）", async () => {
    api.listNeta.mockResolvedValue([neta()]);
    const onAudition = vi.fn();
    render(<PatternImportControl kind="chord_pattern" fallbackName="コード楽器" onApply={vi.fn()} onAudition={onAudition} />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await userEvent.click(await screen.findByLabelText("import-preview-0"));
    expect(onAudition).toHaveBeenCalledTimes(1);
    expect(onAudition.mock.calls[0]![0]).toEqual({ patternId: "GT-FOLK8", hits: [{ step: 0, dur: 4 }] });
    expect(screen.getByLabelText("pattern-import")).toBeTruthy(); // 試聴では閉じない
  });

  it("(d) ✕で onClose 注入（ppPlay.stop）を呼び＋閉じる", async () => {
    api.listNeta.mockResolvedValue([neta()]);
    const onClose = vi.fn();
    render(<PatternImportControl kind="chord_pattern" fallbackName="コード楽器" onApply={vi.fn()} onAudition={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await screen.findByLabelText("import-card-0");
    await userEvent.click(screen.getByLabelText("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("pattern-import")).toBeNull();
  });

  it("contentFilter/activeProject をダイアログへ下ろす（母集団の追加フィルタ）", async () => {
    api.listNeta.mockResolvedValue([
      neta({ id: "rel", kind: "bass", title: "REL", content: { mode: "relative", pattern: [] } }),
      neta({ id: "abs", kind: "bass", title: "ABS", content: { notes: [] } }),
    ]);
    render(<PatternImportControl kind="bass" fallbackName="おまかせ" onApply={vi.fn()} onAudition={vi.fn()} contentFilter={(n) => (n.content as { mode?: string } | null)?.mode === "relative"} />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await screen.findByLabelText("import-card-0");
    expect(screen.getByLabelText("import-card-0").textContent).toContain("REL");
    expect(screen.queryByLabelText("import-card-1")).toBeNull(); // 絶対は番兵で捨てられる
  });
});
