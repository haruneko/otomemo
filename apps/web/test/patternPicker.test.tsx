import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

// 修理#1「パターンを選ぶ ▸」帯（正典＝docs/research/2026-07-22-performance-editing-architecture-audit.md 推奨差分1）：
//  ・既定閉＝開かなければ candidate 機構は非活性（chip/候補が DOM に出ない）
//  ・開く→ジャンルchip→候補を出す→カード→適用＝content 置換（patternId が刻まれ program/kit メタは保持）
//  ・適用は onChange 経由＝useEditHistory の Undo で1操作で戻る
const api = vi.hoisted(() => ({ music: vi.fn() }));
vi.mock("../src/api", () => ({ api }));

// startPlayback は試聴でしか呼ばれない（このテストは試聴しない）が、import 解決のため軽く stub。
vi.mock("../src/playback", () => ({ startPlayback: vi.fn(async () => null) }));

import { ChordPatternEditor } from "../src/components/ChordPatternEditor";
import { RhythmEditor } from "../src/components/RhythmEditor";
import { useEditHistory } from "../src/history";
import type { ChordPatternContent, RhythmContent } from "../src/music";

if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === "undefined") {
  (globalThis as { PointerEvent?: unknown }).PointerEvent = class extends MouseEvent {} as unknown;
}

const chordCand: ChordPatternContent = {
  mode: "strum",
  voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, style: "guitar", strumMs: 14 },
  steps: 16,
  hits: [{ step: 0, dur: 2, dir: "D" }],
  patternId: "GT-FOLK8",
};

const drumCand = {
  rhythm: {
    steps: 16, bars: 1, beatsPerStep: 0.25,
    lanes: [{ name: "Kick", midi: 36, hits: [0, 4, 8, 12], vel: 115 }],
    patternId: "four.rock",
  } as RhythmContent,
};

describe("ChordPatternEditor 「パターンを選ぶ ▸」帯（修理#1）", () => {
  beforeEach(() => vi.clearAllMocks());

  const pat0: ChordPatternContent = {
    mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 },
    steps: 16, hits: [{ step: 0, dur: 4 }], program: 25,
  };

  it("既定閉＝トグルは在るがジャンルchip/候補は出ていない（開くまで既存挙動不変）", () => {
    render(<ChordPatternEditor pattern={pat0} onChange={vi.fn()} meter="4/4" tempo={120} keyPc={0} />);
    expect(screen.getByLabelText("pattern-picker-toggle")).toBeTruthy();
    expect(screen.queryByLabelText("pattern-genres")).toBeNull();
    expect(screen.queryByLabelText("pattern-fetch")).toBeNull();
  });

  it("patternId があれば見出しに『いま：<型名>』を表示（選び直し兼用の家）", () => {
    render(<ChordPatternEditor pattern={{ ...pat0, patternId: "PB-WHOLE" }} onChange={vi.fn()} meter="4/4" />);
    expect(screen.getByLabelText("pattern-now").textContent).toContain("PB-WHOLE");
  });

  it("開く→候補を出す→適用＝候補 content で置換（patternId 刻む・program 保持）／Undo で戻る", async () => {
    api.music.mockResolvedValue({ items: [{ content: chordCand, label: "GT-FOLK8 フォーク定番（D-DU-UDU・万能）" }] });
    const user = userEvent.setup();

    function Harness() {
      const [pat, setPat] = useState<ChordPatternContent>(pat0);
      const hist = useEditHistory(pat, setPat, { resetKey: "x" });
      return (
        <>
          <ChordPatternEditor pattern={pat} onChange={setPat} meter="4/4" tempo={120} keyPc={0} program={25} />
          <button aria-label="undo" onClick={hist.undo}>undo</button>
          <span aria-label="pid">{pat.patternId ?? "none"}</span>
          <span aria-label="prog">{pat.program ?? "none"}</span>
        </>
      );
    }
    render(<Harness />);

    await user.click(screen.getByLabelText("pattern-picker-toggle"));
    expect(screen.getByLabelText("pattern-genres")).toBeTruthy();
    await user.click(screen.getByLabelText("pattern-fetch"));
    // カードが出る（型名＋場面）。
    const card = await screen.findByLabelText("pattern-card-0");
    expect(card.textContent).toContain("GT-FOLK8");
    // フレーム（key/meter/tempo/bars）＋pattern（おまかせ）＋variety:4 を送っている。
    const body = api.music.mock.calls[0]![1] as { pattern: string; variety: number; frame: { bars: number } };
    expect(body.variety).toBe(4);
    expect(body.pattern).toBe("omakase"); // 既定 chip＝おまかせ
    expect(body.frame.bars).toBe(1); // steps16 / 16

    await user.click(screen.getByLabelText("pattern-apply-0"));
    expect(screen.getByLabelText("pid").textContent).toBe("GT-FOLK8"); // patternId 刻まれた
    expect(screen.getByLabelText("prog").textContent).toBe("25"); // program 保持

    await user.click(screen.getByLabelText("undo"));
    expect(screen.getByLabelText("pid").textContent).toBe("none"); // 適用前へ戻る
  });

  it("ジャンルchip を選ぶと pattern にそのジャンルが載る", async () => {
    api.music.mockResolvedValue({ items: [] });
    const user = userEvent.setup();
    render(<ChordPatternEditor pattern={pat0} onChange={vi.fn()} meter="4/4" tempo={120} keyPc={0} />);
    await user.click(screen.getByLabelText("pattern-picker-toggle"));
    await user.click(screen.getByLabelText("pgenre-rock"));
    await user.click(screen.getByLabelText("pattern-fetch"));
    const body = api.music.mock.calls[0]![1] as { pattern: string };
    expect(body.pattern).toBe("rock");
  });
});

describe("RhythmEditor 「パターンを選ぶ ▸」帯（修理#1・seed 違い→dedupe）", () => {
  beforeEach(() => vi.clearAllMocks());

  const rhythm0: RhythmContent = { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }], kit: 8 };

  it("既定閉＝chip/候補は出ていない", () => {
    render(<RhythmEditor rhythm={rhythm0} onChange={vi.fn()} meter="4/4" tempo={120} />);
    expect(screen.getByLabelText("pattern-picker-toggle")).toBeTruthy();
    expect(screen.queryByLabelText("pattern-genres")).toBeNull();
  });

  it("開く→候補を出す→適用＝rhythm 置換（patternId 刻む・kit 保持）／Undo で戻る", async () => {
    api.music.mockResolvedValue({ items: [{ content: drumCand }] }); // 4 seed とも同じ→dedupe で1件
    const user = userEvent.setup();

    function Harness() {
      const [r, setR] = useState<RhythmContent>(rhythm0);
      const hist = useEditHistory(r, setR, { resetKey: "x" });
      return (
        <>
          <RhythmEditor rhythm={r} onChange={setR} meter="4/4" tempo={120} />
          <button aria-label="undo" onClick={hist.undo}>undo</button>
          <span aria-label="pid">{r.patternId ?? "none"}</span>
          <span aria-label="kit">{r.kit ?? "none"}</span>
        </>
      );
    }
    render(<Harness />);

    await user.click(screen.getByLabelText("pattern-picker-toggle"));
    await user.click(screen.getByLabelText("pattern-fetch"));
    const card = await screen.findByLabelText("pattern-card-0");
    expect(card.textContent).toContain("four.rock");
    // gen_drums を 4 回（seed 違い）呼ぶ。
    expect(api.music.mock.calls.length).toBe(4);
    expect(api.music.mock.calls.every((c) => c[0] === "gen_drums")).toBe(true);
    // 同一 content×4 → dedupe で候補は1件。
    expect(screen.queryByLabelText("pattern-card-1")).toBeNull();

    await user.click(screen.getByLabelText("pattern-apply-0"));
    expect(screen.getByLabelText("pid").textContent).toBe("four.rock");
    expect(screen.getByLabelText("kit").textContent).toBe("8"); // kit 保持

    await user.click(screen.getByLabelText("undo"));
    expect(screen.getByLabelText("pid").textContent).toBe("none");
  });

  it("ジャンル chip＝ドラムの genre（jpop/rock/dance/ballad/funk＋おまかせ）", async () => {
    render(<RhythmEditor rhythm={rhythm0} onChange={vi.fn()} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    for (const g of ["omakase", "jpop", "rock", "dance", "ballad", "funk"]) {
      expect(screen.getByLabelText(`pgenre-${g}`)).toBeTruthy();
    }
  });
});
