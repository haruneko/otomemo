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
    await userEvent.click(screen.getByLabelText("voicing-toggle")); // Task1c：響きは折りたたみ＝展開して打ち方へ
    const seg = screen.getByLabelText("mode");
    expect(seg.textContent).toContain("ストローク");
    expect(seg.textContent).not.toContain("ストラム");
    await userEvent.click(within(seg).getByText("ストローク"));
    expect(onChange).toHaveBeenCalledWith(pat({ mode: "strum" })); // データ値は strum のまま
  });

  it("左手注入ボタンのラベルは短縮＝ルート/+5度/8va（オクターブ・ルート＋5度は折れ元＝改名）", () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-root5").textContent).toBe("+5度");
    expect(screen.getByLabelText("lh-oct").textContent).toBe("8va");
  });
});

// S3：左手行（keyboard 解決時のみ）＋D/Uストリップ（guitar 解決時のみ）＝モックB準拠。
describe("ChordPatternEditor S3 左手行＋D/Uストリップ", () => {
  const guitarPat = (over: Partial<ChordPatternContent> = {}) =>
    pat({ voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, style: "guitar" }, ...over });

  it("keyboard 解決（style無し）＝左手パッドが常時出る・D/Uストリップは出ない（Task1b：seg廃止）", () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-pad")).toBeTruthy();
    expect(screen.queryByLabelText("du-strip")).toBeNull();
  });
  it("guitar 解決＝D/Uストリップが出る・左手パッドは出ない", () => {
    render(<ChordPatternEditor pattern={guitarPat()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("du-strip")).toBeTruthy();
    expect(screen.queryByLabelText("lh-pad")).toBeNull();
    expect(screen.queryByLabelText("lh-inject")).toBeNull();
  });
  it("auto×ギター音色（program25）でも D/Uストリップ・左手パッドなし", () => {
    const autoPat = pat({ voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, style: "auto" } });
    render(<ChordPatternEditor pattern={autoPat} onChange={vi.fn()} program={25} />);
    expect(screen.getByLabelText("du-strip")).toBeTruthy();
    expect(screen.queryByLabelText("lh-pad")).toBeNull();
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
});

// Task1b（2026-07-23）：左手を「両手一体ビュー」で常時表示。seg（OFF/…/自分で）廃止＝注入ボタン＋常時パッド。
// preset ネタは materialize 表示（触るまで content 不変＝bit一致）・注入/クリア/セルタップの編集で custom 確定。
describe("ChordPatternEditor Task1b 両手一体ビュー（常時パッド＋注入/クリア＋materialize）", () => {
  // (a) keyboard 解決で左手パッドが常時 DOM に在る（`自分で` トグルが無い）。
  it("keyboard 解決＝左手パッド常時表示・旧 seg（自分で/OFF/lh-mode）は無い", () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-pad")).toBeTruthy();
    expect(screen.getByLabelText("lh-inject")).toBeTruthy();
    expect(screen.queryByLabelText("lh-mode")).toBeNull();
    expect(screen.queryByLabelText("lh-custom")).toBeNull();
    expect(screen.queryByLabelText("lh-off")).toBeNull();
  });

  // (b) 注入ボタン：[ルート]→R小節頭・[+5度]→R+5・[8va]→R+8（全音符 dur=stepsPerBar・lh.mode:custom）。
  it("[ルート]注入＝各小節頭に R 全音符（steps16→step0 のみ・dur16・custom 確定）", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-root"));
    expect(onChange).toHaveBeenCalledWith(pat({ lh: { mode: "custom", hits: [{ step: 0, deg: "R", dur: 16 }] } }));
  });
  it("[ルート]注入＝2小節（steps32）で各小節頭 step0/16 に R 全音符", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ steps: 32 })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-root"));
    expect(onChange).toHaveBeenCalledWith(pat({ steps: 32, lh: { mode: "custom", hits: [{ step: 0, deg: "R", dur: 16 }, { step: 16, deg: "R", dur: 16 }] } }));
  });
  it("[+5度]注入＝小節頭に R と 5・[8va]注入＝R と 8", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-root5"));
    expect(onChange).toHaveBeenLastCalledWith(pat({ lh: { mode: "custom", hits: [{ step: 0, deg: "R", dur: 16 }, { step: 0, deg: "5", dur: 16 }] } }));
    rerender(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-oct"));
    expect(onChange).toHaveBeenLastCalledWith(pat({ lh: { mode: "custom", hits: [{ step: 0, deg: "R", dur: 16 }, { step: 0, deg: "8", dur: 16 }] } }));
  });

  // (c) preset lh ネタを開くとパッドに materialize 表示・**未編集なら content 不変**・セルタップで custom 確定。
  it("preset root ネタ＝パッドに小節頭 R が点灯（materialize 表示）", () => {
    render(<ChordPatternEditor pattern={pat({ steps: 32, lh: { mode: "root" } })} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-pad-R-0").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("lh-pad-R-16").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("lh-pad-R-8").getAttribute("aria-pressed")).toBe("false"); // 小節頭以外は消灯
  });
  it("preset root5 ネタ＝小節頭に R と 5 が点灯・root は 5 消灯", () => {
    const { rerender } = render(<ChordPatternEditor pattern={pat({ lh: { mode: "root5" } })} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-pad-R-0").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("lh-pad-5-0").getAttribute("aria-pressed")).toBe("true");
    rerender(<ChordPatternEditor pattern={pat({ lh: { mode: "root" } })} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-pad-5-0").getAttribute("aria-pressed")).toBe("false");
  });
  it("preset oct ネタ＝小節頭に R と 8 が点灯", () => {
    render(<ChordPatternEditor pattern={pat({ lh: { mode: "oct" } })} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-pad-R-0").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("lh-pad-8-0").getAttribute("aria-pressed")).toBe("true");
  });
  it("preset ネタは**開くだけ／表示だけでは onChange 発火せず content 不変（bit）**", () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ lh: { mode: "root" } })} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled(); // materialize は表示のみ＝書き込まない
  });
  it("preset ネタのセルタップ＝materialize 土台に足して custom 確定（小節頭 R を残す）", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ lh: { mode: "root" } })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-pad-3-8")); // step8 に 3度を足す
    const arg = onChange.mock.calls[0]![0] as ChordPatternContent;
    expect(arg.lh).toEqual({ mode: "custom", hits: [{ step: 0, deg: "R", dur: 16 }, { step: 8, deg: "3", dur: 4 }] });
  });
  it("preset ネタのセルタップ＝materialize 済み小節頭 R をタップで消せる（custom 確定）", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ lh: { mode: "root" } })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-pad-R-0")); // materialize された R を消す
    const arg = onChange.mock.calls[0]![0] as ChordPatternContent;
    expect(arg.lh).toEqual({ mode: "custom", hits: [] });
  });

  // (d) [クリア] で lh キー削除（左手なし）。
  it("[クリア]で lh キー削除（bit）・lh 無しでクリアが選択表示", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ChordPatternEditor pattern={pat({ lh: { mode: "root" } })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-clear"));
    expect("lh" in (onChange.mock.calls[0]![0] as ChordPatternContent)).toBe(false);
    rerender(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} />); // pat() は lh 無し＝クリア選択
    expect(screen.getByLabelText("lh-clear").className).toContain("on");
  });
  it("lh 未定義＝パッドは全消灯（空）", () => {
    const { lh: _drop, ...noLh } = pat({ lh: { mode: "root" } });
    render(<ChordPatternEditor pattern={noLh as ChordPatternContent} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-pad-R-0").getAttribute("aria-pressed")).toBe("false");
  });

  // (e) guitar 解決で左手非表示（不変）。
  it("guitar 解決＝左手パッド・注入ボタンとも非表示", () => {
    render(<ChordPatternEditor pattern={pat({ voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, style: "guitar" }, lh: { mode: "root" } })} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("lh-pad")).toBeNull();
    expect(screen.queryByLabelText("lh-inject")).toBeNull();
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
    await userEvent.click(screen.getByLabelText("voicing-toggle")); // Task1c：響きは折りたたみ＝展開してトップへ
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

// Task1c（2026-07-23）：両手一体グリッドへ作り直し。並び順=パターン帯→小節→長さ→グリッド／右手↔破線↔左手を単一容器で
// 縦に揃える／「響き」は折りたたみ＋サマリ。content 契約・resolve は不変＝編集が書く値は従来と同一（bit）。
describe("ChordPatternEditor Task1c 両手一体グリッド", () => {
  const guitarPat = (over: Partial<ChordPatternContent> = {}) =>
    pat({ voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, style: "guitar" }, ...over });
  const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  // (a) DOM 縦順＝パターン帯 → 小節[−+] → 長さ(分) → 両手グリッド（ベース BassStepEditor と同順）。
  it("(a) DOM 縦順＝パターン帯→小節→長さ→両手グリッド", () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} />);
    const picker = screen.getByLabelText("pattern-picker");
    const bars = screen.getByLabelText("bars-count");
    const len = screen.getByLabelText("dotted"); // 長さツール（NoteValuePicker）
    const grid = screen.getByLabelText("two-hand-grid");
    expect(follows(picker, bars)).toBe(true);
    expect(follows(bars, len)).toBe(true);
    expect(follows(len, grid)).toBe(true);
  });

  // (b) 右手レーンと左手レーンが単一グリッド容器内・破線区切りで隣接・同ステップ数。
  it("(b) 右手・左手が単一グリッド容器内／破線区切り／同ステップ数", () => {
    render(<ChordPatternEditor pattern={pat()} onChange={vi.fn()} />);
    const grid = screen.getByLabelText("two-hand-grid");
    const rh = screen.getByLabelText("right-hand");
    const lhPad = screen.getByLabelText("lh-pad");
    expect(grid.contains(rh)).toBe(true); // 上帯＝右手は容器内
    expect(grid.contains(lhPad)).toBe(true); // 下帯＝左手も同一容器内
    expect(grid.querySelector(".cp-lh-block")).toBeTruthy(); // 破線区切り（bass-lane-other 資産流用）
    const rhCells = rh.querySelectorAll('[aria-label^="hit-"]').length;
    const lhRCells = lhPad.querySelectorAll('[aria-label^="lh-pad-R-"]').length;
    expect(rhCells).toBe(16); // pattern.steps
    expect(lhRCells).toBe(rhCells); // 上下で同ステップ数＝縦に揃う
  });

  // (c) 「響き」既定折りたたみ・サマリに現在値・展開で7ノブ。
  it("(c) 響き＝既定折りたたみ（ノブ非表示）・サマリに現在値", () => {
    render(<ChordPatternEditor pattern={pat({ mode: "arp", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, arpDir: "updown", arpOctaves: 1 } })} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("mode")).toBeNull(); // 既定=閉＝ノブは DOM に無い
    const toggle = screen.getByLabelText("voicing-toggle");
    expect(toggle.textContent).toContain("アルペジオ"); // サマリに現在値
    expect(toggle.textContent).toContain("↑↓");
    expect(toggle.textContent).toContain("1oct");
  });
  it("(c) 響き展開＝7ノブ（打ち方/トップ/広がり/向き/駆け上がり幅/区切り/高さ）", async () => {
    render(<ChordPatternEditor pattern={pat({ mode: "arp" })} onChange={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("voicing-toggle"));
    for (const l of ["mode", "top", "spread", "arp-dir", "arp-octaves-ctrl", "arp-reset", "octave-ctrl"]) {
      expect(screen.getByLabelText(l)).toBeTruthy();
    }
  });

  // (d) 注入チップ／区切りセグメント／奏法バッジの存在。
  it("(d) 左手注入チップ・区切りセグメント・奏法バッジが在る", async () => {
    render(<ChordPatternEditor pattern={pat({ mode: "arp" })} onChange={vi.fn()} />);
    expect(screen.getByLabelText("lh-inject")).toBeTruthy(); // 注入「種」チップ
    expect(screen.getByLabelText("voicing-style-summary").tagName).toBe("SPAN"); // 奏法バッジ（読み取り専用）
    await userEvent.click(screen.getByLabelText("voicing-toggle"));
    const reset = screen.getByLabelText("arp-reset"); // 区切り＝セグメント（select でない）
    expect(reset.tagName).not.toBe("SELECT");
    expect(within(reset).getAllByRole("button").length).toBe(7); // 7段のセグメント
  });

  // (e) guitar 解決で左手帯非表示・右手（＋D/U）のみの一枚。
  it("(e) guitar 解決＝左手帯なし・右手＋D/U のみ", () => {
    render(<ChordPatternEditor pattern={guitarPat()} onChange={vi.fn()} />);
    expect(screen.getByLabelText("right-hand")).toBeTruthy();
    expect(screen.getByLabelText("du-strip")).toBeTruthy();
    expect(screen.queryByLabelText("lh-pad")).toBeNull();
    expect(screen.queryByLabelText("lh-inject")).toBeNull();
  });

  // (f) 回帰＝編集操作が書く content（hits/voicing/lh）は従来と同一値（bit）。
  it("(f) 右手タップ＝従来どおり {step,dur}／左手注入＝従来どおり materialize", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ChordPatternEditor pattern={pat({ hits: [] })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("hit-4"));
    expect(onChange).toHaveBeenLastCalledWith(pat({ hits: [{ step: 4, dur: 4 }] })); // 右手＝配置文法不変
    rerender(<ChordPatternEditor pattern={pat()} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("lh-root")); // 左手注入＝小節頭 R 全音符（従来値）
    expect(onChange).toHaveBeenLastCalledWith(pat({ lh: { mode: "custom", hits: [{ step: 0, deg: "R", dur: 16 }] } }));
  });
  it("(f) 響き展開で打ち方を変えても書く値は mode のみ（従来と同一・bit）", async () => {
    const onChange = vi.fn();
    render(<ChordPatternEditor pattern={pat({ mode: "arp" })} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("voicing-toggle"));
    await userEvent.click(within(screen.getByLabelText("mode")).getByText("ストローク"));
    expect(onChange).toHaveBeenCalledWith(pat({ mode: "strum" }));
  });
});
