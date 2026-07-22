import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// S7（修理#3 決定②）：「パターンを選ぶ」帯＝api.music("gen_bass",…) を叩く／試聴で startPlayback。stub。
const api = vi.hoisted(() => ({ music: vi.fn() }));
vi.mock("../src/api", () => ({ api }));
vi.mock("../src/playback", () => ({ startPlayback: vi.fn(async () => null) }));

import { BassStepEditor } from "../src/components/BassStepEditor";
import type { BassStep } from "../src/music";

describe("BassStepEditor (#bass S2 度数レーン×ステップ)", () => {
  it("tapping a lane cell places that degree with selected length (既定8分=2step)", async () => {
    const onChange = vi.fn();
    render(<BassStepEditor pattern={[]} onChange={onChange} steps={16} onStepsChange={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("bass-3-0")); // 3度レーンの step0
    expect(onChange).toHaveBeenCalledWith([{ step: 0, degree: "3", dur: 2 }]);
  });

  it("tapping an active cell removes it", async () => {
    const onChange = vi.fn();
    render(<BassStepEditor pattern={[{ step: 0, degree: "R", dur: 2 }]} onChange={onChange} steps={16} onStepsChange={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("bass-R-0"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("is monophonic: placing in another lane at the same step replaces", async () => {
    const onChange = vi.fn();
    render(<BassStepEditor pattern={[{ step: 0, degree: "R", dur: 2 }]} onChange={onChange} steps={16} onStepsChange={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("bass-5-0")); // 同 step0 に 5度
    expect(onChange).toHaveBeenCalledWith([{ step: 0, degree: "5", dur: 2 }]); // R は消える
  });

  it("length tool changes the placed duration", async () => {
    const onChange = vi.fn();
    render(<BassStepEditor pattern={[]} onChange={onChange} steps={16} onStepsChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "4" })); // 4分=4step
    await userEvent.click(screen.getByLabelText("bass-R-0"));
    expect(onChange).toHaveBeenCalledWith([{ step: 0, degree: "R", dur: 4 }]);
  });

  // 修理#2（2026-07-22）：genBass の style 相対が吐く拡張語彙（2/6/クロマチック/next）を**開いて編集できる**。
  // 現行6レーンUIは維持＝拡張度数は grid に現れないが pattern には**非破壊で保持**（フル度数編集は次スライス）。
  describe("拡張語彙（修理#2・H2）", () => {
    const EXTENDED: BassStep[] = [
      { step: 0, degree: "R", dur: 1 },
      { step: 2, degree: "8", dur: 1 },
      { step: 8, degree: "b7", dur: 1 }, // クロマチック（レーン外）
      { step: 10, degree: "6", dur: 1 }, // 追加度数（レーン外）
      { step: 15, degree: "R", dur: 1, next: true }, // next 付き
    ];

    it("拡張語彙込みの pattern をクラッシュせず開ける・可視レーン（R/8）は表示・レーン外は grid に出ない", () => {
      render(<BassStepEditor pattern={EXTENDED} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} />);
      expect(screen.getByLabelText("bass-R-0").getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByLabelText("bass-8-2").getAttribute("aria-pressed")).toBe("true");
      // レーン外度数（b7/6）は grid にレーンが無い＝該当ボタンが存在しない（描画クラッシュしない）。
      expect(screen.queryByLabelText("bass-b7-8")).toBeNull();
      expect(screen.queryByLabelText("bass-6-10")).toBeNull();
    });

    it("可視レーンの編集はレーン外度数（b7/6/next）を非破壊に保持する", async () => {
      const onChange = vi.fn();
      render(<BassStepEditor pattern={EXTENDED} onChange={onChange} steps={16} onStepsChange={vi.fn()} />);
      await userEvent.click(screen.getByLabelText("bass-R-4")); // 空セルへ配置
      const next = onChange.mock.calls[0]![0] as BassStep[];
      expect(next.find((p) => p.step === 4 && p.degree === "R")).toBeTruthy();
      expect(next.find((p) => p.step === 8 && p.degree === "b7")).toBeTruthy(); // 隠れ度数は残る
      expect(next.find((p) => p.step === 10 && p.degree === "6")).toBeTruthy();
      expect(next.find((p) => p.step === 15 && p.next === true)).toBeTruthy();
    });

    it("同 step の隠れ度数はモノフォニック置換（他 step の隠れ度数は保持）", async () => {
      const onChange = vi.fn();
      render(<BassStepEditor pattern={EXTENDED} onChange={onChange} steps={16} onStepsChange={vi.fn()} />);
      await userEvent.click(screen.getByLabelText("bass-R-8")); // 隠れ b7@8 のある step へ R を置く
      const next = onChange.mock.calls[0]![0] as BassStep[];
      expect(next.find((p) => p.step === 8 && p.degree === "R")).toBeTruthy();
      expect(next.find((p) => p.step === 8 && p.degree === "b7")).toBeFalsy(); // 同 step は置換
      expect(next.find((p) => p.step === 10 && p.degree === "6")).toBeTruthy(); // 別 step は保持
    });
  });
});

// S7（修理#3 決定②④）：「パターンを選ぶ」帯＝相対ビート型の入口をベースの家へ。
// seed×4 並列 gen_bass(relative:true・style 必須)→mode!=="relative" 番兵→patternId dedupe→最大4件→適用/（改）/compound 非表示。
describe("BassStepEditor パターンを選ぶ帯（S7）", () => {
  afterEach(() => vi.clearAllMocks());

  // 相対 content 候補を patternId 付きで返すヘルパ。
  const relItem = (id: string, pat: BassStep[] = [{ step: 0, degree: "R", dur: 4 }]) => ({
    kind: "bass", content: { mode: "relative", steps: 16, pattern: pat, patternId: id },
  });

  it("帯 fetch＝seed×4 並列で gen_bass を relative:true＋style 必須で呼ぶ（おまかせも style を必ず付ける）", async () => {
    api.music.mockResolvedValue({ items: [relItem("RK-8ROOT")] });
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} keyPc={0} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await userEvent.click(screen.getByLabelText("pattern-fetch")); // おまかせ（先頭 chip・v:""）で候補
    expect(api.music).toHaveBeenCalledTimes(4);
    for (const call of api.music.mock.calls) {
      expect(call[0]).toBe("gen_bass");
      const body = call[1] as { relative?: boolean; style?: string };
      expect(body.relative).toBe(true);
      expect(typeof body.style).toBe("string");
      expect(body.style!.length).toBeGreaterThan(0); // relative は style 必須＝おまかせも決定的にジャンルを付ける
    }
  });

  it("dedupe＝同 patternId は1件に畳む（4件→2件）", async () => {
    // seed 偶奇で2種の型を返す＝4呼び出し→2ユニーク。
    api.music.mockImplementation(async (_m: string, body: { seed: number }) =>
      ({ items: [body.seed % 2 === 0 ? relItem("RK-8ROOT") : relItem("BL-WHOLE")] }));
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} keyPc={0} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await userEvent.click(screen.getByLabelText("pattern-fetch"));
    await screen.findByLabelText("pattern-card-0");
    expect(screen.getByLabelText("pattern-card-0")).toBeTruthy();
    expect(screen.getByLabelText("pattern-card-1")).toBeTruthy();
    expect(screen.queryByLabelText("pattern-card-2")).toBeNull(); // 2ユニークのみ
  });

  it("番兵＝mode!=='relative'（絶対フォールバック）候補は捨てる", async () => {
    // 1つ目は絶対 notes（relativeFallback）／2つ目以降は相対。絶対は除外され相対だけ残る。
    api.music.mockImplementation(async (_m: string, body: { seed: number }) =>
      body.seed % 4 === 0
        ? { items: [{ kind: "bass", content: { notes: [{ pitch: 40, start: 0, dur: 1 }] } }] } // 絶対＝番兵で除外
        : { items: [relItem("RK-8ROOT")] });
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} keyPc={0} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await userEvent.click(screen.getByLabelText("pattern-fetch"));
    await screen.findByLabelText("pattern-card-0");
    // 相対 RK-8ROOT が1件だけ（絶対候補は捨てられ、相対は同 patternId で dedupe）。
    expect(screen.getByLabelText("pattern-card-0").textContent).toContain("RK-8ROOT");
    expect(screen.queryByLabelText("pattern-card-1")).toBeNull();
  });

  it("適用＝onApplyPattern に pattern/steps/patternId を渡す", async () => {
    const pat: BassStep[] = [{ step: 0, degree: "R", dur: 4 }, { step: 8, degree: "5", dur: 4 }];
    api.music.mockResolvedValue({ items: [relItem("RK-8ROOT", pat)] });
    const onApplyPattern = vi.fn();
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} keyPc={0} meter="4/4" onApplyPattern={onApplyPattern} />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await userEvent.click(screen.getByLabelText("pattern-fetch"));
    await userEvent.click(await screen.findByLabelText("pattern-apply-0"));
    expect(onApplyPattern).toHaveBeenCalledWith({ pattern: pat, steps: 16, patternId: "RK-8ROOT" });
  });

  it("帯見出し＝patternEdited 有りで「いま：<型>（改）」／無しは型名のみ", () => {
    const { rerender } = render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} patternId="RK-8ROOT" />);
    expect(screen.getByLabelText("pattern-now").textContent).toBe("いま：RK-8ROOT");
    rerender(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} patternId="RK-8ROOT" patternEdited />);
    expect(screen.getByLabelText("pattern-now").textContent).toBe("いま：RK-8ROOT（改）");
  });

  it("patternId 無しネタは「いま：」帯見出しが出ない", () => {
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} />);
    expect(screen.queryByLabelText("pattern-now")).toBeNull();
  });

  it("compound meter（6/8）は帯ごと非表示", () => {
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={12} onStepsChange={vi.fn()} meter="6/8" />);
    expect(screen.queryByLabelText("pattern-picker")).toBeNull();
  });
});
