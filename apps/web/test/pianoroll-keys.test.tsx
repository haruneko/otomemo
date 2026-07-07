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

// P0-a：調内音ハイライト＝keyRoot 指定で行に tonic/in-scale/out-scale が付く（「外し音を避ける」足場）。
describe("PianoRoll 調内音ハイライト", () => {
  const rowFor = (container: HTMLElement, pitch: number) =>
    [...container.querySelectorAll('[role="row"]')].find((r) => !!r.querySelector(`[aria-label="cell-${pitch}-0"]`));
  it("C majorで C=tonic / E=in-scale / C#=out-scale", () => {
    // C4(60)..C5(72) を見せる。key=C(0) major。
    const { container } = render(
      <PianoRoll notes={[]} onChange={() => {}} low={60} high={72} beats={4} keyRoot={0} keyMode="major" />,
    );
    expect(rowFor(container, 60)?.classList.contains("tonic")).toBe(true);   // C=主音
    expect(rowFor(container, 64)?.classList.contains("in-scale")).toBe(true); // E=調内
    expect(rowFor(container, 61)?.classList.contains("out-scale")).toBe(true);// C#=調外
  });
  it("A minorで A=tonic / C=in-scale / C#=out-scale（自然的短音階）", () => {
    const { container } = render(
      <PianoRoll notes={[]} onChange={() => {}} low={57} high={69} beats={4} keyRoot={9} keyMode="minor" />,
    );
    expect(rowFor(container, 57)?.classList.contains("tonic")).toBe(true);    // A=主音
    expect(rowFor(container, 60)?.classList.contains("in-scale")).toBe(true); // C=調内
    expect(rowFor(container, 61)?.classList.contains("out-scale")).toBe(true);// C#=調外
  });
  it("keyRoot 未指定なら無着色（従来どおり＝後退ゼロ）", () => {
    const { container } = render(
      <PianoRoll notes={[]} onChange={() => {}} low={60} high={64} beats={4} />,
    );
    expect(container.querySelector('[role="row"].tonic')).toBeNull();
    expect(container.querySelector('[role="row"].in-scale')).toBeNull();
    expect(container.querySelector('[role="row"].out-scale')).toBeNull();
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
