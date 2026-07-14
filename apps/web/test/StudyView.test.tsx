import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudyView } from "../src/components/StudyView";
import type { Neta } from "../src/api";

// #12 研究本文の prose を Chat と同じ ReactMarkdown+remarkGfm でレンダリング＝生の ###/** を整形。
function studyNeta(prose: string): Neta {
  return {
    id: "s1",
    kind: "study",
    title: "研究: テスト",
    content: {
      topic: "テスト",
      members: [],
      songs: [],
      common: [],
      stats: { songs: 0, keys: {}, modes: {} },
      prose,
    },
  } as unknown as Neta;
}

describe("StudyView prose markdown (#12)", () => {
  it("### 見出しが h3、** が strong にレンダリングされる（生表示でない）", async () => {
    const { container } = render(
      <StudyView neta={studyNeta("### 手癖の要点\n**Aメロ**は跳躍が多い")} onClose={() => {}} />,
    );
    // 既定は畳み＝トグルを開く
    await userEvent.click(screen.getByLabelText("toggle-prose"));
    // ReactMarkdown が見出し/強調を要素化＝生の "###" / "**" は本文テキストに残らない
    const h3 = await screen.findByRole("heading", { level: 3 });
    expect(h3.textContent).toContain("手癖の要点");
    expect(container.querySelector(".study-prose.chat-md strong")?.textContent).toBe("Aメロ");
    expect(container.querySelector(".study-prose")?.textContent).not.toContain("###");
    expect(container.querySelector(".study-prose")?.textContent).not.toContain("**");
  });
});
