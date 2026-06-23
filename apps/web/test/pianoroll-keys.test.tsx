import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
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
