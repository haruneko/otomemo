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
