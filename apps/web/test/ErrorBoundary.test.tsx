import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

// React が投げた子のエラーを console.error に出すので、テスト中は黙らせる（ノイズ抑制）。
const spy = vi.spyOn(console, "error").mockImplementation(() => {});
afterEach(() => spy.mockClear());

function Boom(): never {
  throw new Error("boom");
}

describe("ErrorBoundary (堅牢性)", () => {
  it("子が throw したら fallback を出す（一覧を巻き込まない）", () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary fallback={<span>だめでした</span>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(getByText("だめでした")).toBeTruthy();
    expect(queryByText("boom")).toBeNull();
  });

  it("正常な子はそのまま描画する", () => {
    const { getByText } = render(
      <ErrorBoundary fallback={<span>だめでした</span>}>
        <span>元気</span>
      </ErrorBoundary>,
    );
    expect(getByText("元気")).toBeTruthy();
  });
});
