import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// S4 applyPattern テスト用＝帯 fetch は Task2/L3 で api.listNeta を叩く（既存テストは帯を開かない＝mock 未使用で無害）。
const api = vi.hoisted(() => ({ music: vi.fn(), listNeta: vi.fn() }));
vi.mock("../src/api", () => ({ api }));

import { ChordPatternEditor } from "../src/components/ChordPatternEditor";
import type { ChordPatternContent } from "../src/music";
import { LONG_PRESS_MS } from "../src/useHoldDrag";

if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === "undefined") {
  (globalThis as { PointerEvent?: unknown }).PointerEvent = class extends MouseEvent {} as unknown;
}

const pat = (over: Partial<ChordPatternContent> = {}): ChordPatternContent => ({
  mode: "strum",
  voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 },
  steps: 16,
  hits: [{ step: 0, dur: 4 }],
  ...over,
});

describe("ChordPatternEditor #29 §9 hold-drag velocity (vertical only)", () => {
  afterEach(() => vi.useRealTimers());

  it("long-press an onset → drag up commits vel=112 (accent detent) on that hit", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    const cell = screen.getByLabelText("hit-0");
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 40 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(cell.className).toContain("lift");
    fireEvent.pointerMove(cell, { clientX: 10, clientY: 20 }); // 上 20px → 100+12=112（accent デテント）
    fireEvent.pointerUp(cell);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [{ step: 0, dur: 4, vel: 112 }] }));
  });

  it("long-press → drag down commits vel=64 (soft detent)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    const cell = screen.getByLabelText("hit-0");
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.pointerMove(cell, { clientX: 10, clientY: 70 }); // 下 60px → 100-36=64（soft デテント）
    fireEvent.pointerUp(cell);
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [{ step: 0, dur: 4, vel: 64 }] }));
  });

  it("drag back to base (100) drops the vel key (bit)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ hits: [{ step: 0, dur: 4, vel: 64 }] })} onChange={onChange} />);
    const cell = screen.getByLabelText("hit-0");
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    // 開始 vel=64、上 60px（dy=-60）→ 64+36=100（普通デテント）→ 確定で vel キー削除。
    fireEvent.pointerMove(cell, { clientX: 10, clientY: -50 });
    fireEvent.pointerUp(cell);
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [{ step: 0, dur: 4 }] }));
    expect("vel" in (onChange.mock.calls[0]![0] as ChordPatternContent).hits[0]!).toBe(false);
  });

  it("horizontal drag is ignored (subdivision belongs to arp axis)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    const cell = screen.getByLabelText("hit-0");
    fireEvent.pointerDown(cell, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.pointerMove(cell, { clientX: 10 + 88, clientY: 10 }); // 横だけ動かしても vel は 100（普通）
    fireEvent.pointerUp(cell);
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [{ step: 0, dur: 4 }] })); // vel なし＝普通
  });

  it("long-press on a non-onset (empty) cell is a no-op", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    const empty = screen.getByLabelText("hit-8");
    fireEvent.pointerDown(empty, { clientX: 10, clientY: 10 });
    act(() => void vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(empty.className).not.toContain("lift");
    fireEvent.pointerUp(empty);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("tap places a new hit (place grammar unchanged)", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ hits: [] })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("hit-4"));
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [{ step: 4, dur: 4 }] }));
  });

  it("tap on an onset head deletes it (delete grammar unchanged)", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("hit-0"));
    expect(onChange).toHaveBeenCalledWith(pat({ hits: [] }));
  });
});

// 奏法UIスライスB／Fable UX監査①（案イ）：響きゾーン第4行＝奏法は**読み取り専用サマリ**（編集は MetaPanel 一本）
// ＋ギター解決時のみ「ストロークの速さ」(strumMs・段ラベル＝速さ)。データ値 mode:"strum" は不変。
describe("ChordPatternEditor 奏法行（スライスB・監査①＝読み取り専用サマリ）", () => {
  it("style 無し（既存ネタ）＝サマリ『鍵盤』・ストロークの速さ行は非表示・編集segは無い", () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("voicing-style-summary").textContent).toContain("鍵盤");
    expect(screen.queryByLabelText("style-auto")).toBeNull(); // 編集seg は格下げ＝存在しない
    expect(screen.queryByLabelText("style-guitar")).toBeNull();
    expect(screen.queryByLabelText("strum-ms")).toBeNull(); // 鍵盤＝ストロークの速さ無し
  });

  it("奏法サマリは読み取り専用＝表示だけ（style を書く手段は CP エディタに無い）", () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    const summary = screen.getByLabelText("voicing-style-summary");
    expect(summary.tagName).toBe("SPAN"); // ボタンでない＝タップ不可
    expect(screen.queryByRole("button", { name: /style-/ })).toBeNull();
  });

  it("明示 guitar＝サマリ『ギター』・『ストロークの速さ』が現れ、strum-1=速い は strumMs8 を書く（値は不変）", async () => {
    const onChange = vi.fn();
    const guitarPat = pat({ voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, style: "guitar" } });
    render(<ChordPatternEditor pattern={guitarPat} onChange={onChange} />);
    expect(screen.getByLabelText("voicing-style-summary").textContent).toContain("ギター");
    expect(screen.getByLabelText("strum-ms")).toBeTruthy();
    expect(screen.getByLabelText("strum-1").textContent).toBe("速い"); // 弱→速い（強弱でなく速さ）
    await userEvent.click(screen.getByLabelText("strum-1"));
    expect(onChange).toHaveBeenCalledWith(pat({ voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, style: "guitar", strumMs: 8 } }));
  });

  it("ストロークの速さの段ラベルは速さ＝OFF/速い/ふつう/ゆっくり（0/8/14/25ms）", () => {
    const guitarPat = pat({ voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, style: "guitar" } });
    render(<ChordPatternEditor pattern={guitarPat} onChange={vi.fn()} />);
    expect(["strum-0", "strum-1", "strum-2", "strum-3"].map((l) => screen.getByLabelText(l).textContent)).toEqual(["OFF", "速い", "ふつう", "ゆっくり"]);
  });

  it("style:'auto'＝サマリに『（音色から）』／ギター音色でストロークの速さ表示・非ギター音色なら非表示", () => {
    const autoPat = pat({ voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, style: "auto" } });
    const { rerender } = render(<ChordPatternEditor pattern={autoPat} onChange={vi.fn()} program={25} />);
    expect(screen.getByLabelText("voicing-style-summary").textContent).toContain("ギター（音色から）");
    expect(screen.getByLabelText("strum-ms")).toBeTruthy(); // auto→guitar（program 25）
    rerender(<ChordPatternEditor pattern={autoPat} onChange={vi.fn()} program={0} />);
    expect(screen.getByLabelText("voicing-style-summary").textContent).toContain("鍵盤（音色から）");
    expect(screen.queryByLabelText("strum-ms")).toBeNull(); // auto→keyboard（ピアノ）
  });
});

// Fable UX監査②⑥：語彙統一（ストラム→ストローク・データ値 mode:"strum" 不変）＋左手ラベル短縮（折返し解消）。
describe("ChordPatternEditor 語彙/折返し（監査②⑥）", () => {
  it("打ち方＝『ストローク』表示（ストラムから改名）・押すと mode:'strum' を書く（値は不変）", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ mode: "arp" })} onChange={onChange} />);
    const seg = screen.getByLabelText("mode");
    expect(seg.textContent).toContain("ストローク");
    expect(seg.textContent).not.toContain("ストラム");
    await userEvent.click(within(seg).getByText("ストローク"));
    expect(onChange).toHaveBeenCalledWith(pat({ mode: "strum" })); // データ値は strum のまま
  });

  it("左手ラベルは短縮＝OFF/ルート/+5度/8va（オクターブ・ルート＋5度は折れ元＝改名）", () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-root5").textContent).toBe("+5度");
    expect(screen.getByLabelText("lh-oct").textContent).toBe("8va");
  });
});

// S3：左手行（keyboard 解決時のみ）＋D/Uストリップ（guitar 解決時のみ）＝モックB準拠。
describe("ChordPatternEditor S3 左手行＋D/Uストリップ", () => {
  const guitarPat = (over: Partial<ChordPatternContent> = {}) =>
    pat({ voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, style: "guitar" }, ...over });

  it("keyboard 解決（style無し）＝左手行が出る・D/Uストリップは出ない", () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-mode")).toBeTruthy();
    expect(screen.queryByLabelText("du-strip")).toBeNull();
  });
  it("guitar 解決＝D/Uストリップが出る・左手行は出ない", () => {
    render(<ChordPatternEditor pattern={guitarPat()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("du-strip")).toBeTruthy();
    expect(screen.queryByLabelText("lh-mode")).toBeNull();
  });
  it("auto×ギター音色（program25）でも D/Uストリップ・左手行なし", () => {
    const autoPat = pat({ voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, style: "auto" } });
    render(<ChordPatternEditor pattern={autoPat} onChange={vi.fn()} program={25} />);
    expect(screen.getByLabelText("du-strip")).toBeTruthy();
    expect(screen.queryByLabelText("lh-mode")).toBeNull();
  });

  it("左手 ルートを押すと lh:{mode:root} を書く", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-root"));
    expect(onChange).toHaveBeenCalledWith(pat({ lh: { mode: "root" } }));
  });
  it("左手 OFF で lh キー削除（bit）", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ lh: { mode: "root" } })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-off"));
    const arg = onChange.mock.calls[0]![0] as ChordPatternContent;
    expect("lh" in arg).toBe(false);
  });
  it("lh 無し＝OFF が選択・root で置くと root が選択（seg 表示）", () => {
    const { rerender } = render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-off").className).toContain("on");
    rerender(<ChordPatternEditor pattern={pat({ lh: { mode: "root5" } })} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-root5").className).toContain("on");
  });
  it("custom＝『自分で』seg 選択＋パッド展開（Task1：型表示は廃止）", () => {
    render(<ChordPatternEditor pattern={pat({ lh: { mode: "custom", hits: [] } })} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-custom").className).toContain("on");
    expect(screen.getByLabelText("lh-pad")).toBeTruthy();
    for (const l of ["lh-off", "lh-root", "lh-root5", "lh-oct"]) expect(screen.getByLabelText(l).className).not.toContain("on");
  });

  it("D/Uストリップ：dir 無し hit は自動既定を薄表示（表拍D・裏U）", () => {
    render(<ChordPatternEditor pattern={guitarPat({ hits: [{ step: 0, dur: 2 }, { step: 2, dur: 2 }] })} onChange={vi.fn()} />);
    const d0 = screen.getByLabelText("dir-0"); // 表拍→D
    const d2 = screen.getByLabelText("dir-2"); // 裏→U
    expect(d0.textContent).toBe("D");
    expect(d0.className).toContain("auto"); // 未明示=薄
    expect(d2.textContent).toBe("U");
  });
  it("D/Uストリップ タップ＝dir を明示反転（自動D→明示U）", async () => {
    const onChange = vi.fn();
    const gp = guitarPat({ hits: [{ step: 0, dur: 2 }] });
    render(<ChordPatternEditor pattern={gp} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("dir-0"));
    expect(onChange).toHaveBeenCalledWith({ ...gp, hits: [{ step: 0, dur: 2, dir: "U" }] });
  });
  it("guitar 解決の新規打点は dir=自動既定を書く（裏拍→U）", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={guitarPat({ hits: [] })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("hit-2")); // 裏拍→U・既定len=4
    const arg = onChange.mock.calls[0]![0] as ChordPatternContent;
    expect(arg.hits).toEqual([{ step: 2, dur: 4, dir: "U" }]);
  });
  it("keyboard 解決の新規打点は dir を書かない（bit）", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ hits: [] })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("hit-2"));
    const arg = onChange.mock.calls[0]![0] as ChordPatternContent;
    expect(arg.hits[0]!).toEqual({ step: 2, dur: 4 }); // dir 無し
  });
});

// Task1（2026-07-23）：左手 custom パッド（度数レーン R/3/5/8 × steps・ポリフォニック）。
// BassStepEditor をモデルにしつつ**同 step 排他を外す**＝同 step 複数レーン ON 可（ピアノ左手）。
describe("ChordPatternEditor Task1 左手 custom パッド", () => {
  const custom = (hits: { step: number; deg?: string; dur: number; vel?: number }[] = []) =>
    pat({ lh: { mode: "custom", hits } });

  it("『自分で』seg で lh:{mode:custom} を書く／選択でハイライト", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-custom"));
    expect(onChange).toHaveBeenCalledWith(pat({ lh: { mode: "custom", hits: [] } }));
    rerender(<ChordPatternEditor pattern={custom()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-custom").className).toContain("on");
  });

  it("パッドは keyboard×custom のときだけ表示（preset/ギター解決は非表示）", () => {
    const { rerender } = render(<ChordPatternEditor pattern={custom()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-pad")).toBeTruthy();
    rerender(<ChordPatternEditor pattern={pat({ lh: { mode: "root" } })} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("lh-pad")).toBeNull(); // preset＝パッド無し
    rerender(
      <ChordPatternEditor
        pattern={pat({ voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, style: "guitar" }, lh: { mode: "custom", hits: [] } })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("lh-pad")).toBeNull(); // guitar 解決＝左手行ごと無し
  });

  it("空セルタップ＝新規 hit（deg=lane・dur=長さツール既定=4）", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={custom()} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-pad-3-8"));
    const arg = onChange.mock.calls[0]![0] as ChordPatternContent;
    expect(arg.lh!.hits).toEqual([{ step: 8, deg: "3", dur: 4 }]);
  });

  it("同 step 複数レーン ON（ポリフォニー）＝lh.hits に同 step 別 deg が複数入る", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={custom([{ step: 0, deg: "R", dur: 4 }])} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-pad-5-0")); // 同 step0 に 5度を足す（R は消えない）
    const arg = onChange.mock.calls[0]![0] as ChordPatternContent;
    expect(arg.lh!.hits).toEqual([{ step: 0, deg: "R", dur: 4 }, { step: 0, deg: "5", dur: 4 }]);
  });

  it("セルタップ＝その (lane×step) の hit だけ remove（同 step 他レーンは非破壊）", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={custom([{ step: 0, deg: "R", dur: 4 }, { step: 0, deg: "5", dur: 4 }])} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-pad-5-0")); // 5度だけ消す
    const arg = onChange.mock.calls[0]![0] as ChordPatternContent;
    expect(arg.lh!.hits).toEqual([{ step: 0, deg: "R", dur: 4 }]);
  });

  it("R レーン＝deg 省略 hit（辞書由来）も ON として点灯（deg??R）", () => {
    render(<ChordPatternEditor pattern={custom([{ step: 4, dur: 4 }])} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-pad-R-4").getAttribute("aria-pressed")).toBe("true");
  });

  it("custom→preset は hits を非破壊保持・preset→custom で復元", async () => {
    const onChange = vi.fn();
    const authored = custom([{ step: 0, deg: "R", dur: 4 }]);
    const { rerender } = render(<ChordPatternEditor pattern={authored} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-root")); // custom→preset（hits 保持）
    expect(onChange).toHaveBeenLastCalledWith(pat({ lh: { mode: "root", hits: [{ step: 0, deg: "R", dur: 4 }] } }));
    onChange.mockClear();
    rerender(<ChordPatternEditor pattern={pat({ lh: { mode: "root", hits: [{ step: 0, deg: "R", dur: 4 }] } })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-custom")); // preset→custom で復元
    expect(onChange).toHaveBeenLastCalledWith(pat({ lh: { mode: "custom", hits: [{ step: 0, deg: "R", dur: 4 }] } }));
  });

  it("hits 無しネタの preset 選択は clean（{mode:root}＝bit一致・hits キー生えない）", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-root"));
    expect(onChange).toHaveBeenCalledWith(pat({ lh: { mode: "root" } }));
    expect("hits" in (onChange.mock.calls[0]![0] as ChordPatternContent).lh!).toBe(false);
  });
});

// S4（修理#3 決定③④）：showPicker ゲート（管弦への型誤適用を断つ）＋patternEdited（改）表示。
describe("ChordPatternEditor S4 帯ゲート＋（改）フラグ", () => {
  it("showPicker 未指定＝帯を描画（既定 true＝従来どおり＝bit一致）", () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("pattern-picker")).toBeTruthy();
  });

  it("showPicker=false＝帯なし（section_inst＝コード楽器型の誤適用を断つ）", () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} showPicker={false} />);
    expect(screen.queryByLabelText("pattern-picker")).toBeNull();
  });

  it("patternId 有りネタの手編集→patternEdited:true 付与（来歴 patternId は保持）", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ patternId: "GT-FOLK8" })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("hit-4")); // hits 変更＝手編集
    expect(onChange).toHaveBeenCalledWith(
      pat({ patternId: "GT-FOLK8", hits: [{ step: 0, dur: 4 }, { step: 4, dur: 4 }], patternEdited: true }),
    );
  });

  it("帯 nowLabel＝patternEdited で「<型>（改）」表示", () => {
    render(<ChordPatternEditor pattern={pat({ patternId: "GT-FOLK8", patternEdited: true })} onChange={vi.fn()} />);
    expect(screen.getByLabelText("pattern-now").textContent).toContain("GT-FOLK8（改）");
  });

  it("patternId 無しネタの手編集→patternEdited が生えない（bit一致）", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("hit-4"));
    const arg = onChange.mock.calls[0]![0] as ChordPatternContent;
    expect("patternEdited" in arg).toBe(false);
  });

  it("voicing 変更（響き）でも patternId 有りなら（改）付与", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ patternId: "GT-FOLK8" })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("top-inc")); // トップ＝voicing 変更
    const arg = onChange.mock.calls[0]![0] as ChordPatternContent;
    expect(arg.patternEdited).toBe(true);
    expect(arg.patternId).toBe("GT-FOLK8");
  });

  it("applyPattern（候補 content で置換）で patternEdited が消える／program は付与しない", async () => {
    const onChange = vi.fn();
    vi.mocked(api.listNeta).mockResolvedValue([
      { id: "cp1", kind: "chord_pattern", title: "GT-FOLK8 弾き語り", text: null, scope: "library", tags: ["scene:verse"], key: 0, mode: null, tempo: null, meter: null, bars: null, mood: null, created: "", updated: "",
        content: pat({ patternId: "GT-FOLK8", hits: [{ step: 0, dur: 8 }] }) },
    ]);
    render(<ChordPatternEditor pattern={pat({ patternId: "GT-FOLK8", patternEdited: true })} onChange={onChange} keyPc={0} />);
    await userEvent.click(screen.getByLabelText("pattern-picker-toggle"));
    await userEvent.click(screen.getByLabelText("pattern-fetch"));
    await userEvent.click(await screen.findByLabelText("pattern-apply-0"));
    const arg = onChange.mock.calls[0]![0] as ChordPatternContent;
    expect("patternEdited" in arg).toBe(false); // 候補 content に無い＝自然消滅
    expect("program" in arg).toBe(false); // 現ネタ program 無し＝メタ継承なし＝（改）と無関係
    expect(arg.patternId).toBe("GT-FOLK8");
  });
});
