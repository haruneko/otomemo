import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetaPanel, perfKeyOf, perfPatch, perfOptionsFor, type PerfState } from "../src/components/MetaPanel";

// 奏法UIスライスA：chord_pattern の時だけ音色の直下に「奏法」二段（音色→奏法）。写像できる項目だけ露出。
const base = (over: Partial<Parameters<typeof MetaPanel>[0]> = {}): Parameters<typeof MetaPanel>[0] => ({
  flags: { collapsible: false, showKey: true, showMeta: true, isChord: false, isContainer: false, isMelody: false, isBass: false, isChordPat: false, isMusic: true, isThemeable: false, hasChords: false, showFeel: false },
  keyPc: 0, mode: "major", meter: "4/4", tempo: 120, program: 25, tags: "", mood: "",
  setKey: vi.fn(), setMode: vi.fn(), setMeter: vi.fn(), setTempo: vi.fn(), setProgram: vi.fn(), setTags: vi.fn(), setMood: vi.fn(),
  onDetectKey: vi.fn(), onExtendLen: vi.fn(), onToggleSchedule: vi.fn(), schedId: null,
  ...over,
});

const perf = (over: Partial<PerfState> = {}): PerfState => ({ style: undefined, strumMs: undefined, mode: "strum", program: 25, set: vi.fn(), ...over });

describe("MetaPanel 奏法 二段（スライスA）", () => {
  it("chord_pattern の時だけ『奏法』select が音色の下に条件出現", () => {
    // melody（perf 無し）＝出ない
    render(<MetaPanel {...base({ flags: { ...base().flags, isChordPat: false, isMelody: true } })} />);
    expect(screen.queryByLabelText("performance")).toBeNull();
  });

  it("chord_pattern＋perf＝select が出る（ギター音色は4択・既定はおまかせ auto）", () => {
    render(<MetaPanel {...base({ flags: { ...base().flags, isChordPat: true } })} perf={perf({ program: 25 })} />);
    const sel = screen.getByLabelText("performance") as HTMLSelectElement;
    expect(sel).toBeTruthy();
    expect(sel.value).toBe("auto"); // style 無し→おまかせ
    expect(sel.querySelectorAll("option").length).toBe(4); // ギター系＝おまかせ/ストローク/アルペジオ/鍵盤風
  });

  it("非ギター音色（program 0）は2択（おまかせ/アルペジオ＝写像できるものだけ）", () => {
    render(<MetaPanel {...base({ program: 0, flags: { ...base().flags, isChordPat: true } })} perf={perf({ program: 0 })} />);
    const sel = screen.getByLabelText("performance") as HTMLSelectElement;
    expect(sel.querySelectorAll("option").length).toBe(2);
  });

  it("ストロークを選ぶと set(style:guitar, mode:strum, strumMs:14)", () => {
    const set = vi.fn();
    render(<MetaPanel {...base({ flags: { ...base().flags, isChordPat: true } })} perf={perf({ program: 25, set })} />);
    fireEvent.change(screen.getByLabelText("performance"), { target: { value: "stroke" } });
    expect(set).toHaveBeenCalledWith({ style: "guitar", mode: "strum", strumMs: 14 });
  });

  it("アルペジオを選ぶと mode:arp（style は auto）", () => {
    const set = vi.fn();
    render(<MetaPanel {...base({ flags: { ...base().flags, isChordPat: true } })} perf={perf({ program: 25, set })} />);
    fireEvent.change(screen.getByLabelText("performance"), { target: { value: "arp" } });
    expect(set).toHaveBeenCalledWith({ style: "auto", mode: "arp" });
  });
});

describe("MetaPanel 奏法 純関数（写像の要）", () => {
  it("perfKeyOf：mode:arp 最優先→arp／guitar→stroke／keyboard→keyboard／他→auto", () => {
    expect(perfKeyOf("guitar", "arp")).toBe("arp");
    expect(perfKeyOf("guitar", "strum")).toBe("stroke");
    expect(perfKeyOf("keyboard", "strum")).toBe("keyboard");
    expect(perfKeyOf("auto", "strum")).toBe("auto");
    expect(perfKeyOf(undefined, "strum")).toBe("auto");
  });
  it("perfPatch：各キー→ content パッチ", () => {
    expect(perfPatch("stroke")).toEqual({ style: "guitar", mode: "strum", strumMs: 14 });
    expect(perfPatch("arp")).toEqual({ style: "auto", mode: "arp" });
    expect(perfPatch("keyboard")).toEqual({ style: "keyboard", mode: "strum" });
    expect(perfPatch("auto")).toEqual({ style: "auto", mode: "strum" });
  });
  it("perfOptionsFor：ギター系4択・他2択", () => {
    expect(perfOptionsFor(25).map((o) => o.key)).toEqual(["auto", "stroke", "arp", "keyboard"]);
    expect(perfOptionsFor(0).map((o) => o.key)).toEqual(["auto", "arp"]);
  });
});
