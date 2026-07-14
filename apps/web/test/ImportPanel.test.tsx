import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createJob } = vi.hoisted(() => ({ createJob: vi.fn() }));
vi.mock("../src/api", () => ({ api: { createJob } }));

import { ImportPanel } from "../src/components/ImportPanel";

function renderPanel() {
  const setImportOpen = vi.fn();
  const reload = vi.fn().mockResolvedValue(undefined);
  render(
    <ImportPanel importOpen={true} setImportOpen={setImportOpen} reload={reload} projectTags={[]} />,
  );
  return { setImportOpen, reload };
}

beforeEach(() => {
  createJob.mockReset();
});

describe("ImportPanel URL analyze feedback（監査#7）", () => {
  // 失敗時は無通知だと「押しても何も起きない」に見える＝パネル内に文言で知らせる（alert不可）。
  it("shows an in-panel message when the URL analyze job fails to start", async () => {
    createJob.mockRejectedValue(new Error("boom"));
    const { setImportOpen } = renderPanel();
    await userEvent.type(screen.getByLabelText("analyze-url"), "https://example.com/x{enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("解析を開始できませんでした");
    expect(setImportOpen).not.toHaveBeenCalled(); // 失敗＝パネルは閉じない
  });

  // 成功時はメッセージを出さず、入力クリア＋パネルを閉じる（従来挙動を維持）。
  it("does not show the error and closes on success", async () => {
    createJob.mockResolvedValue({ id: "j1" });
    const { setImportOpen } = renderPanel();
    await userEvent.type(screen.getByLabelText("analyze-url"), "https://example.com/x{enter}");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(setImportOpen).toHaveBeenCalledWith(false);
  });

  // 再入力でエラーは消える（次の試行を邪魔しない）。
  it("clears the error message on further typing", async () => {
    createJob.mockRejectedValue(new Error("boom"));
    renderPanel();
    const input = screen.getByLabelText("analyze-url");
    await userEvent.type(input, "https://bad{enter}");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.type(input, "y");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ImportPanel URL client-side validation（実機監査A4）", () => {
  // 不正URL（htp://x のようなスキーム誤字等）は送信前にクライアントで弾く＝無言でジョブ化させない。
  it.each(["htp://x", "ただの文字列", "example.com/no-scheme"])(
    "rejects invalid URL %s without calling createJob",
    async (bad) => {
      const { setImportOpen } = renderPanel();
      const input = screen.getByLabelText("analyze-url");
      await userEvent.type(input, `${bad}{enter}`);
      expect(await screen.findByRole("alert")).toHaveTextContent("URLの形式が正しくありません");
      expect(createJob).not.toHaveBeenCalled();
      expect(setImportOpen).not.toHaveBeenCalled(); // パネルは閉じない
      expect(input).toHaveValue(bad); // 入力は保持される
    },
  );

  // 正しい https:// URL は従来通り送信される（クライアント検証で誤ってブロックしない）。
  it("still submits a well-formed https URL", async () => {
    createJob.mockResolvedValue({ id: "j1" });
    const { setImportOpen } = renderPanel();
    await userEvent.type(screen.getByLabelText("analyze-url"), "https://example.com/x{enter}");
    expect(createJob).toHaveBeenCalledWith({
      intent: "audio_analyze",
      params: { url: "https://example.com/x" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(setImportOpen).toHaveBeenCalledWith(false);
  });
});
