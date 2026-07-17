import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// F1 共有チップ／フックの単体（設計2026-07-17）。グローバルストア（audio.ts）を差し替えて、
// 「音源読込中…」＞「楽器準備中…」の優先順位・両 false で null（何も描かない）を固定する。
const { isSfLoading, isSfPreparing } = vi.hoisted(() => ({
  isSfLoading: vi.fn(() => false),
  isSfPreparing: vi.fn(() => false),
}));
vi.mock("../src/audio", () => ({
  isSfLoading,
  isSfPreparing,
  // subscribe は no-op（getSnapshot＝is* を毎描画で読む＝各テストで戻り値を差し替えれば反映される）。
  subscribeSfLoading: () => () => {},
  subscribeSfPreparing: () => () => {},
}));

import { PrepStatus } from "../src/usePrepPending";

describe("PrepStatus / usePrepPending（F1 共有チップ）", () => {
  beforeEach(() => {
    isSfLoading.mockReturnValue(false);
    isSfPreparing.mockReturnValue(false);
  });

  it("SF2 ロード中は「音源読込中…」を出す", () => {
    isSfLoading.mockReturnValue(true);
    render(<PrepStatus />);
    expect(screen.getByLabelText("prep-status")).toHaveTextContent("音源読込中…");
  });

  it("sampler 準備中は「楽器準備中…」を出す", () => {
    isSfPreparing.mockReturnValue(true);
    render(<PrepStatus />);
    expect(screen.getByLabelText("prep-status")).toHaveTextContent("楽器準備中…");
  });

  it("両方 true なら SF2 ロード優先（音源読込中…＞楽器準備中…）", () => {
    isSfLoading.mockReturnValue(true);
    isSfPreparing.mockReturnValue(true);
    render(<PrepStatus />);
    expect(screen.getByLabelText("prep-status")).toHaveTextContent("音源読込中…");
  });

  it("両方 false なら何も描かない（従来 markup 不変）", () => {
    const { container } = render(<PrepStatus />);
    expect(screen.queryByLabelText("prep-status")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
