import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomeHub } from "../src/components/HomeHub";
import type { Neta } from "../src/api";

let seq = 0;
const mk = (over: Partial<Neta> = {}): Neta => ({
  id: `n${seq++}`,
  kind: "melody",
  title: "曲A",
  text: null,
  content: null,
  key: null,
  mode: null,
  tempo: null,
  meter: null,
  bars: null,
  mood: null,
  tags: [],
  created: "2026-07-14",
  updated: "2026-07-14",
  ...over,
});

describe("HomeHub (#5 次の一手ハブ)", () => {
  it("items が空なら従来の空文言＋曲を組むだけ（ハブは出さない）", () => {
    render(<HomeHub items={[]} onOpen={vi.fn()} onCreateSong={vi.fn()} />);
    expect(screen.getByText(/ネタを選ぶとここで編集できます/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "＋曲を組む" })).toBeInTheDocument();
    expect(screen.queryByLabelText("home-hub")).toBeNull();
  });

  it("最終更新のネタを『つづき』に出し、タップで onOpen する", async () => {
    const older = mk({ title: "古い", updated: "2026-07-10" });
    const newer = mk({ title: "最新メロ", updated: "2026-07-14" });
    const onOpen = vi.fn();
    render(<HomeHub items={[older, newer]} onOpen={onOpen} onCreateSong={vi.fn()} />);

    const resume = screen.getByLabelText("home-hub-resume");
    expect(within(resume).getByText("最新メロ")).toBeInTheDocument();
    await userEvent.click(resume);
    expect(onOpen).toHaveBeenCalledWith(newer);
  });

  it("残りは『最近の更新』ミニリストに出し、タップで onOpen する", async () => {
    const a = mk({ title: "AAA", updated: "2026-07-14" });
    const b = mk({ title: "BBB", updated: "2026-07-12" });
    const c = mk({ title: "CCC", updated: "2026-07-11" });
    const onOpen = vi.fn();
    render(<HomeHub items={[a, b, c]} onOpen={onOpen} onCreateSong={vi.fn()} />);

    // 先頭(AAA)はつづき、残り(BBB/CCC)が最近リスト
    expect(screen.getByText("最近の更新")).toBeInTheDocument();
    await userEvent.click(screen.getByText("CCC"));
    expect(onOpen).toHaveBeenCalledWith(c);
  });

  it("最近リストは最大6件（つづき1件＋残り6件まで）", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      mk({ title: `T${i}`, updated: `2026-07-${10 + i}` }),
    );
    render(<HomeHub items={items} onOpen={vi.fn()} onCreateSong={vi.fn()} />);
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem").length).toBe(6);
  });

  it("activeProject があれば器名の見出しを出す", () => {
    render(
      <HomeHub items={[mk()]} activeProject="夏の器" onOpen={vi.fn()} onCreateSong={vi.fn()} />,
    );
    expect(within(screen.getByLabelText("home-hub-project")).getByText("夏の器")).toBeInTheDocument();
  });

  it("ショートカット＝曲を組む/メロは既存コールバックを呼ぶ", async () => {
    const onCreateSong = vi.fn();
    const onCreateMelody = vi.fn();
    render(
      <HomeHub
        items={[mk()]}
        onOpen={vi.fn()}
        onCreateSong={onCreateSong}
        onCreateMelody={onCreateMelody}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "＋曲を組む" }));
    expect(onCreateSong).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "＋メロ" }));
    expect(onCreateMelody).toHaveBeenCalled();
  });

  it("onCreateMelody 未指定なら ＋メロ は出さない", () => {
    render(<HomeHub items={[mk()]} onOpen={vi.fn()} onCreateSong={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "＋メロ" })).toBeNull();
  });
});
