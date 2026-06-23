import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PianoRoll } from "../src/components/PianoRoll";

// ピアノロール：ノート表示域の行が黒鍵/白鍵で色分け（.proll-row に black/white クラス）。
describe("PianoRoll 黒鍵/白鍵の行色分け", () => {
  it("行に黒鍵=black・白鍵=white クラスが付く", () => {
    // C4(60)..C#4(61) が含まれる範囲。C=白鍵 / C#=黒鍵。
    const { container } = render(
      <PianoRoll notes={[{ pitch: 60, start: 0, dur: 1 }]} onChange={() => {}} low={60} high={61} />,
    );
    const rows = [...container.querySelectorAll(".proll-row")];
    expect(rows.length).toBeGreaterThan(0);
    // すべての行が black か white のどちらかを持つ（取りこぼし無し）。
    expect(rows.every((r) => r.classList.contains("black") || r.classList.contains("white"))).toBe(true);
    // 黒鍵(C#4=61)の行が black、白鍵(C4=60)の行が white。
    expect(container.querySelector('[role="row"].black')).not.toBeNull();
    expect(container.querySelector('[role="row"].white')).not.toBeNull();
  });
});

describe("PianoRoll 付点（#3）", () => {
  it("付点ONで配置すると音長が1.5倍（四分1拍→1.5拍＝6/8の付点四分）", async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <PianoRoll notes={[]} onChange={onChange} low={60} high={60} beats={4} />,
    );
    await userEvent.click(getByLabelText("dotted")); // 付点 ON
    await userEvent.click(getByLabelText("cell-60-0")); // 既定 noteLen=1拍 を配置
    expect(onChange).toHaveBeenCalledWith([{ pitch: 60, start: 0, dur: 1.5 }]);
  });

  it("付点OFFは従来どおり（1拍）", async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <PianoRoll notes={[]} onChange={onChange} low={60} high={60} beats={4} />,
    );
    await userEvent.click(getByLabelText("cell-60-0"));
    expect(onChange).toHaveBeenCalledWith([{ pitch: 60, start: 0, dur: 1 }]);
  });
});
