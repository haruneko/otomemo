import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
