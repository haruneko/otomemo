import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadMidi, downloadMultitrackMidi } from "../src/music";

// #4 ダウンロードのリソース安全化：blob URL を click 直後に同期 revoke すると一部ブラウザで
// DL がキャンセル/空ファイル化する。アンカーは DOM に挿入→click→除去し、revoke は遅延させる。

describe("#4 MIDI ダウンロードのアンカー/URL ライフサイクル", () => {
  let created: string[];
  let revoked: string[];
  let clicked: number;

  beforeEach(() => {
    created = [];
    revoked = [];
    clicked = 0;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => {
        const u = `blob:mock/${created.length}`;
        created.push(u);
        return u;
      }),
      revokeObjectURL: vi.fn((u: string) => revoked.push(u)),
    });
    // a.click() は jsdom で navigation を起こさないようスパイ
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked++;
      // click 時点ではまだ revoke されていないこと（早期 revoke 回帰の検出）
      expect(revoked.length, "click 時点で未 revoke").toBe(0);
      // アンカーは DOM に挿入済みであること（Firefox 互換）
      expect(document.body.contains(this), "click 時点で DOM 挿入済み").toBe(true);
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downloadMidi: URL生成→click→アンカー除去→遅延revoke", () => {
    downloadMidi([{ pitch: 60, start: 0, dur: 1 }], "x.mid", 120);
    expect(created.length).toBe(1);
    expect(clicked).toBe(1);
    // click 後にアンカーは残さない（DOM リーク防止）
    expect(document.querySelectorAll("a[download]").length).toBe(0);
    // revoke は遅延（click と同期でない）
    expect(revoked.length).toBe(0);
    vi.runAllTimers();
    expect(revoked).toEqual(created); // 最終的に必ず revoke される（メモリリーク防止）
  });

  it("downloadMultitrackMidi: 同様にリーク無し・遅延revoke", () => {
    downloadMultitrackMidi([{ name: "m", notes: [{ pitch: 60, start: 0, dur: 1 }] }], "s.mid", 120);
    expect(created.length).toBe(1);
    expect(clicked).toBe(1);
    expect(document.querySelectorAll("a[download]").length).toBe(0);
    vi.runAllTimers();
    expect(revoked).toEqual(created);
  });

  it("成功時は true を返す（両関数）", () => {
    expect(downloadMidi([{ pitch: 60, start: 0, dur: 1 }], "x.mid", 120)).toBe(true);
    expect(downloadMultitrackMidi([{ name: "m", notes: [{ pitch: 60, start: 0, dur: 1 }] }], "s.mid", 120)).toBe(true);
  });

  it("弱起（負start）を含んでも throw せず true（クランプで負tick失敗を根治・無言失敗の根絶）", () => {
    // 実機監査：弱起メロを bar0 に置くと負start が残り @tonejs/midi が throw → 無言DL失敗だった。
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(downloadMidi([{ pitch: 60, start: -0.5, dur: 1 }], "x.mid", 120)).toBe(true);
    expect(downloadMultitrackMidi([{ name: "m", notes: [{ pitch: 60, start: -0.5, dur: 1 }] }], "s.mid", 120)).toBe(true);
    expect(err).not.toHaveBeenCalled(); // クランプ済み＝例外経路に入らない
  });

  it("書き出しが例外を投げても無言で死なず false＋console.error（保険の try/catch）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    // createObjectURL を throw させて書き出し境界の失敗を再現。
    (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(downloadMidi([{ pitch: 60, start: 0, dur: 1 }], "x.mid", 120)).toBe(false);
    expect(err).toHaveBeenCalled();
  });
});
