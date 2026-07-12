import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";
import { RelationsPanel } from "../src/components/RelationsPanel";

// realized_from の見える化（design #20）：メロ側は「← 元の骨格」、骨格側は「→ 吹いたメロ」を
// 相手の kind から判定して表示・タップで相手を開く。RelationsPanel は NetaDialog が rels を流す薄い表示。
const mk = (id: string, kind: string, title: string): Neta => ({
  id, kind, title, text: null, content: null, key: null, mode: null, meter: null,
  tempo: null, bars: null, mood: null, tags: [], created: "", updated: "",
});

describe("RelationsPanel realized_from（骨格⇄表面メロの双方向導線）", () => {
  it("メロを開くと「← 元の骨格」へ辿れる（相手=skeleton）", async () => {
    const onOpen = vi.fn();
    render(<RelationsPanel rels={[{ type: "realized_from", neta: mk("sk1", "skeleton", "骨格A") }]} onOpenNeta={onOpen} />);
    const btn = screen.getByLabelText("relation-realized_from-sk1");
    expect(btn).toHaveTextContent("← 元の骨格");
    await userEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "sk1" }));
  });

  it("骨格を開くと「→ 作ったメロ」へ辿れる（相手=melody・逆引き由来／語彙刷新 2026-07-13）", async () => {
    const onOpen = vi.fn();
    render(<RelationsPanel rels={[{ type: "realized_from", neta: mk("mel1", "melody", "作ったメロ") }]} onOpenNeta={onOpen} />);
    const btn = screen.getByLabelText("relation-realized_from-mel1");
    expect(btn).toHaveTextContent("→ 作ったメロ");
    await userEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "mel1" }));
  });

  it("関連が無ければ何も描かない", () => {
    const { container } = render(<RelationsPanel rels={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
