import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KindTiles } from "../src/components/KindTiles";

// 監査#9：0件ゴーストのツールチップは実態に合わせて分岐する。
// capturable な kind（melody 等）は「作れば…現れる」／capturable=false（reference/analysis/study）は
// 作成タイルが無い＝「取込・解析で増えると現れる」でないと嘘になる。
describe("KindTiles zero-ghost tooltip（監査#9）", () => {
  it("uses 『作れば…』for capturable zero kinds and 『取込・解析で…』for non-capturable ones", () => {
    render(
      <KindTiles
        entries={[]}
        kindFilter=""
        setKindFilter={() => {}}
        variant="grid"
        zeroKinds={["melody", "reference"]}
      />,
    );
    // capturable：作成タイルがある＝作れば現れる
    expect(screen.getByLabelText("kind-zero-melody")).toHaveAttribute(
      "title",
      expect.stringContaining("作れば"),
    );
    // capturable=false：作成タイルが無い＝取込・解析で増えると現れる（「作れば」は含まない）
    const ref = screen.getByLabelText("kind-zero-reference");
    expect(ref).toHaveAttribute("title", expect.stringContaining("取込・解析で増えると現れる"));
    expect(ref.getAttribute("title")).not.toContain("作れば");
  });
});
