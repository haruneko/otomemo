import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

// 修理#1「パターンを選ぶ ▸」帯（正典＝docs/research/2026-07-22-performance-editing-architecture-audit.md 推奨差分1）：
//  ・既定閉＝開かなければ candidate 機構は非活性（chip/候補が DOM に出ない）
//  ・開く→ジャンルchip→候補を出す→カード→適用＝content 置換（patternId が刻まれ program/kit メタは保持）
//  ・適用は onChange 経由＝useEditHistory の Undo で1操作で戻る
// Task2/L3：候補の出所は生成器→ネタ帳ライブラリ（api.listNeta）＝帯 fetch は listNeta を叩く（契約＝PatternCand は不変）。
const api = vi.hoisted(() => ({ music: vi.fn(), listNeta: vi.fn() }));
vi.mock("../src/api", () => ({ api }));

// ライブラリネタ（scope:"library"）を候補として返すヘルパ＝content をそのまま帯 audition/apply へ載せる。
const libNeta = (id: string, kind: string, content: unknown, title: string) => ({
  id, kind, title, text: null, content, key: 0, mode: null, tempo: null, meter: null, bars: null, mood: null,
  scope: "library" as const, tags: [], created: "", updated: "",
});

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
    api.listNeta.mockResolvedValue([libNeta("cp1", "chord_pattern", chordCand, "GT-FOLK8 フォーク定番")]);
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
    // 出所＝listNeta を chord_pattern・scope:"library" で引く（既定 chip＝おまかせ＝genre タグ無し）。
    const q = api.listNeta.mock.calls[0]![0] as Record<string, unknown>;
    expect(q.kind).toBe("chord_pattern");
    expect(q.scope).toBe("library");
    expect(q).not.toHaveProperty("tags"); // おまかせ

    await user.click(screen.getByLabelText("pattern-apply-0"));
    expect(screen.getByLabelText("pid").textContent).toBe("GT-FOLK8"); // patternId 刻まれた
    expect(screen.getByLabelText("prog").textContent).toBe("25"); // program 保持

    await user.click(screen.getByLabelText("undo"));
    expect(screen.getByLabelText("pid").textContent).toBe("none"); // 適用前へ戻る
  });

  it("ジャンルchip を選ぶと listNeta の tags に genre:<g> が載る", async () => {
    api.listNeta.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<ChordPatternEditor pattern={pat0} onChange={vi.fn()} meter="4/4" tempo={120} keyPc={0} />);
    await user.click(screen.getByLabelText("pattern-picker-toggle"));
    await user.click(screen.getByLabelText("pgenre-rock"));
    await user.click(screen.getByLabelText("pattern-fetch"));
    const q = api.listNeta.mock.calls[0]![0] as { tags?: string[] };
    expect(q.tags).toEqual(["genre:rock"]);
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
    api.listNeta.mockResolvedValue([libNeta("r1", "rhythm", drumCand, "four.rock")]);
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
    // 出所＝listNeta を rhythm・scope:"library" で1回引く（生成器 gen_drums は叩かない）。
    expect(api.listNeta.mock.calls.length).toBe(1);
    expect(api.music).not.toHaveBeenCalled();
    const q = api.listNeta.mock.calls[0]![0] as { kind: string; scope: string };
    expect(q.kind).toBe("rhythm");
    expect(q.scope).toBe("library");
    expect(screen.queryByLabelText("pattern-card-1")).toBeNull(); // 候補1件のみ

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
