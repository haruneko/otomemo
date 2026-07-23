import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// S7（修理#3 決定②／Task2/L3）：「パターンを選ぶ」帯＝候補の出所は生成器→ネタ帳ライブラリ（api.listNeta）。試聴で startPlayback。stub。
const api = vi.hoisted(() => ({ music: vi.fn(), listNeta: vi.fn() }));
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

    // S8（修理#3 決定②＝案1）：「その他」レーン1行＋セルポップオーバーで拡張語彙（b2..#7・2・6／next／vel）を編集。
    // 同 step 排他＝モノフォニック置換（可視レーン配置→同 step の隠れ度数を置換／「その他」配置→可視レーン音を置換）。
    describe("「その他」レーン＋ポップオーバー（S8）", () => {
      it("「その他」レーンは可視6レーン外の度数を持つ step にマーカーを出す（可視度数は出さない）", () => {
        render(<BassStepEditor pattern={EXTENDED} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} />);
        expect(screen.getByLabelText("bass-other-8").getAttribute("aria-pressed")).toBe("true"); // b7＝レーン外
        expect(screen.getByLabelText("bass-other-10").getAttribute("aria-pressed")).toBe("true"); // 6＝レーン外
        expect(screen.getByLabelText("bass-other-0").getAttribute("aria-pressed")).toBe("false"); // R＝可視レーン
        expect(screen.getByLabelText("bass-other-2").getAttribute("aria-pressed")).toBe("false"); // 8＝可視レーン
      });

      it("ポップオーバーで拡張度数を置くと pattern に載る（既定長=8分=2step）", async () => {
        const onChange = vi.fn();
        render(<BassStepEditor pattern={[]} onChange={onChange} steps={16} onStepsChange={vi.fn()} />);
        await userEvent.click(screen.getByLabelText("bass-other-4")); // 「その他」セル→ポップオーバー
        await userEvent.click(screen.getByLabelText("ext-deg-b7"));
        await userEvent.click(screen.getByLabelText("ext-place"));
        expect(onChange).toHaveBeenCalledWith([{ step: 4, degree: "b7", dur: 2 }]);
      });

      it("「その他」配置は同 step の可視レーン音を置換する（モノフォニック・逆方向）", async () => {
        const onChange = vi.fn();
        render(<BassStepEditor pattern={[{ step: 0, degree: "R", dur: 2 }]} onChange={onChange} steps={16} onStepsChange={vi.fn()} />);
        await userEvent.click(screen.getByLabelText("bass-other-0"));
        await userEvent.click(screen.getByLabelText("ext-deg-6"));
        await userEvent.click(screen.getByLabelText("ext-place"));
        const next = onChange.mock.calls[0]![0] as BassStep[];
        expect(next.find((p) => p.step === 0 && p.degree === "6")).toBeTruthy();
        expect(next.find((p) => p.step === 0 && p.degree === "R")).toBeFalsy(); // 可視 R は消える
      });

      it("「その他」配置は他 step の音（可視/隠れ/next）を非破壊に保持する", async () => {
        const onChange = vi.fn();
        render(<BassStepEditor pattern={EXTENDED} onChange={onChange} steps={16} onStepsChange={vi.fn()} />);
        await userEvent.click(screen.getByLabelText("bass-other-4")); // 空 step へ拡張度数
        await userEvent.click(screen.getByLabelText("ext-deg-4"));
        await userEvent.click(screen.getByLabelText("ext-place"));
        const next = onChange.mock.calls[0]![0] as BassStep[];
        expect(next.find((p) => p.step === 4 && p.degree === "4")).toBeTruthy();
        expect(next.find((p) => p.step === 0 && p.degree === "R")).toBeTruthy();
        expect(next.find((p) => p.step === 8 && p.degree === "b7")).toBeTruthy();
        expect(next.find((p) => p.step === 10 && p.degree === "6")).toBeTruthy();
        expect(next.find((p) => p.step === 15 && p.next === true)).toBeTruthy();
      });

      it("vel プリセットを選ぶと step に vel が載る", async () => {
        const onChange = vi.fn();
        render(<BassStepEditor pattern={[]} onChange={onChange} steps={16} onStepsChange={vi.fn()} />);
        await userEvent.click(screen.getByLabelText("bass-other-2"));
        await userEvent.click(screen.getByLabelText("ext-deg-b3"));
        await userEvent.click(screen.getByLabelText("ext-vel-72"));
        await userEvent.click(screen.getByLabelText("ext-place"));
        expect(onChange).toHaveBeenCalledWith([{ step: 2, degree: "b3", dur: 2, vel: 72 }]);
      });

      it("「次を先取り」トグルで next が載る", async () => {
        const onChange = vi.fn();
        render(<BassStepEditor pattern={[]} onChange={onChange} steps={16} onStepsChange={vi.fn()} />);
        await userEvent.click(screen.getByLabelText("bass-other-0"));
        await userEvent.click(screen.getByLabelText("ext-deg-b7"));
        await userEvent.click(screen.getByLabelText("ext-next"));
        await userEvent.click(screen.getByLabelText("ext-place"));
        expect(onChange).toHaveBeenCalledWith([{ step: 0, degree: "b7", dur: 2, next: true }]);
      });

      it("「消す」で その step の拡張度数だけ消える（他 step は保持）", async () => {
        const onChange = vi.fn();
        render(<BassStepEditor pattern={EXTENDED} onChange={onChange} steps={16} onStepsChange={vi.fn()} />);
        await userEvent.click(screen.getByLabelText("bass-other-8")); // b7@8
        await userEvent.click(screen.getByLabelText("ext-remove"));
        const next = onChange.mock.calls[0]![0] as BassStep[];
        expect(next.find((p) => p.step === 8)).toBeFalsy(); // 8 の拡張度数は消える
        expect(next.find((p) => p.step === 10 && p.degree === "6")).toBeTruthy(); // 別 step は残る
        expect(next.find((p) => p.step === 0 && p.degree === "R")).toBeTruthy();
      });

      it("既存の拡張度数を持つ step を開くとポップオーバーが現在値を反映する（度数/next）", async () => {
        const onChange = vi.fn();
        render(<BassStepEditor pattern={EXTENDED} onChange={onChange} steps={16} onStepsChange={vi.fn()} />);
        await userEvent.click(screen.getByLabelText("bass-other-8")); // b7@8（next 無し）
        expect(screen.getByLabelText("ext-deg-b7").getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByLabelText("ext-next").getAttribute("aria-pressed")).toBe("false");
      });
    });
  });
});

// S7（修理#3 決定②④／Task2/L3）：「パターンを選ぶ」帯＝相対ビート型の入口をベースの家へ。
// 出所＝listNeta を kind:"bass" scope:"library" で引く→相対 content のみ採用（mode!=="relative" は番兵で捨てる）→適用/（改）/compound 非表示。
describe("BassStepEditor パターンを選ぶ帯（S7）", () => {
  afterEach(() => vi.clearAllMocks());

  // 相対 content の library ネタ（scope:"library"）を patternId 付きで返すヘルパ。
  const relNeta = (id: string, pat: BassStep[] = [{ step: 0, degree: "R", dur: 4 }], tags: string[] = []) => ({
    id, kind: "bass", title: id, text: null, scope: "library" as const, tags, key: 0, mode: null, tempo: null, meter: null, bars: null, mood: null, created: "", updated: "",
    content: { mode: "relative", steps: 16, pattern: pat, patternId: id },
  });

  it("リンク→ダイアログ＝listNeta を kind:'bass' scope:'all' で引く（生成器は叩かない）", async () => {
    api.listNeta.mockResolvedValue([relNeta("RK-8ROOT")]);
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} keyPc={0} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await screen.findByLabelText("import-card-0");
    expect(api.music).not.toHaveBeenCalled();
    const q = api.listNeta.mock.calls[0]![0] as { kind: string; scope: string };
    expect(q.kind).toBe("bass");
    expect(q.scope).toBe("all"); // library（工場出荷）＋project（自作）を一括＝ライブラリを見せる
  });

  it("ジャンル絞り＝select で genre タグ一致だけ残す", async () => {
    api.listNeta.mockResolvedValue([relNeta("RK-8ROOT", undefined, ["genre:rock"]), relNeta("BL-WHOLE", undefined, ["genre:ballad"])]);
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} keyPc={0} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await screen.findByLabelText("import-card-1");
    await userEvent.selectOptions(screen.getByLabelText("import-genre"), "rock");
    expect(screen.getByLabelText("import-card-0").textContent).toContain("RK-8ROOT");
    expect(screen.queryByLabelText("import-card-1")).toBeNull(); // ballad が消え1件
  });

  it("複数の相対ネタがそれぞれカードに並ぶ", async () => {
    api.listNeta.mockResolvedValue([relNeta("RK-8ROOT"), relNeta("BL-WHOLE")]);
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} keyPc={0} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await screen.findByLabelText("import-card-0");
    expect(screen.getByLabelText("import-card-1")).toBeTruthy();
    expect(screen.queryByLabelText("import-card-2")).toBeNull();
  });

  it("番兵＝mode!=='relative'（絶対 notes ネタ）候補は捨てる", async () => {
    // 絶対 notes ネタ（相対エディタに混入する事故の口）は除外され相対だけ残る。
    api.listNeta.mockResolvedValue([
      { id: "abs", kind: "bass", title: "abs", text: null, scope: "library" as const, tags: [], key: 0, mode: null, tempo: null, meter: null, bars: null, mood: null, created: "", updated: "", content: { notes: [{ pitch: 40, start: 0, dur: 1 }] } },
      relNeta("RK-8ROOT"),
    ]);
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} keyPc={0} meter="4/4" />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await screen.findByLabelText("import-card-0");
    expect(screen.getByLabelText("import-card-0").textContent).toContain("RK-8ROOT");
    expect(screen.queryByLabelText("import-card-1")).toBeNull(); // 絶対は捨てられ相対1件のみ
  });

  it("タップ＝onApplyPattern に pattern/steps/patternId を渡す", async () => {
    const pat: BassStep[] = [{ step: 0, degree: "R", dur: 4 }, { step: 8, degree: "5", dur: 4 }];
    api.listNeta.mockResolvedValue([relNeta("RK-8ROOT", pat)]);
    const onApplyPattern = vi.fn();
    render(<BassStepEditor pattern={[]} onChange={vi.fn()} steps={16} onStepsChange={vi.fn()} keyPc={0} meter="4/4" onApplyPattern={onApplyPattern} />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await userEvent.click(await screen.findByLabelText("import-pick-0"));
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
