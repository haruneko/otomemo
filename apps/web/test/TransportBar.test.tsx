// design#24 backlog「音源読込中の表示」：SF2 ロード中だけ「音源読込中…」(aria-label=sf-loading)が出て、
// 完了で消える。audio の購読口（subscribeSfLoading/isSfLoading）は fake で制御。MixerControl は無効化。
import { describe, it, expect, vi } from "vitest";
import type React from "react";
import { render, screen, act } from "@testing-library/react";

vi.mock("../src/components/MixerControl", () => ({ MixerControl: () => null }));

const store = vi.hoisted(() => {
  let loading = false;
  const ls = new Set<(v: boolean) => void>();
  return {
    isSfLoading: () => loading,
    subscribeSfLoading: (cb: (v: boolean) => void) => {
      ls.add(cb);
      return () => {
        ls.delete(cb);
      };
    },
    set: (v: boolean) => {
      loading = v;
      ls.forEach((f) => f(v));
    },
    reset: () => {
      loading = false;
      ls.clear();
    },
  };
});
// sfPreparing（W3 sampler 準備中）の購読口も fake。既定は非準備。
const prep = vi.hoisted(() => {
  let preparing = false;
  const ls = new Set<(v: boolean) => void>();
  return {
    isSfPreparing: () => preparing,
    subscribeSfPreparing: (cb: (v: boolean) => void) => {
      ls.add(cb);
      return () => {
        ls.delete(cb);
      };
    },
    set: (v: boolean) => {
      preparing = v;
      ls.forEach((f) => f(v));
    },
    reset: () => {
      preparing = false;
      ls.clear();
    },
  };
});
vi.mock("../src/audio", () => ({
  isSfLoading: store.isSfLoading,
  subscribeSfLoading: store.subscribeSfLoading,
  isSfPreparing: prep.isSfPreparing,
  subscribeSfPreparing: prep.subscribeSfPreparing,
}));

import { TransportBar } from "../src/components/TransportBar";

function renderBar(props: Partial<React.ComponentProps<typeof TransportBar>> = {}) {
  return render(
    <TransportBar
      state="stopped"
      loopOn={false}
      timeRef={{ current: null }}
      onPlayPause={() => {}}
      onRewind={() => {}}
      onToggleLoop={() => {}}
      {...props}
    />,
  );
}

describe("#24 TransportBar 音源読込中の表示", () => {
  it("ロード中だけ『音源読込中…』を出し、完了で消える", () => {
    store.reset();
    renderBar();
    // 初期＝非ロード＝表示なし。
    expect(screen.queryByLabelText("sf-loading")).toBeNull();

    // ロード開始 → 表示あり。
    act(() => store.set(true));
    const el = screen.getByLabelText("sf-loading");
    expect(el).toBeTruthy();
    expect(el.textContent).toContain("音源読込中");

    // 完了 → 消える。
    act(() => store.set(false));
    expect(screen.queryByLabelText("sf-loading")).toBeNull();
  });
});

describe("TransportBar pending 表示（設計 2026-07-17 赤②）", () => {
  it("(a) pending 指定で▶が aria-busy=true・(b) play-pending ラベルを表示", () => {
    store.reset();
    prep.reset();
    renderBar({ pending: "歌声 1/3…" });
    const btn = screen.getByLabelText("play-pause");
    expect(btn.getAttribute("aria-busy")).toBe("true");
    const chip = screen.getByLabelText("play-pending");
    expect(chip.textContent).toContain("歌声 1/3");
  });

  it("(c) sfLoading=true と同時なら pending が勝つ（sf-loading 文言は出ない）", () => {
    store.reset();
    prep.reset();
    renderBar({ pending: "歌声 2/2…" });
    act(() => store.set(true));
    // 優先順位：歌声 > 音源読込。sf-loading スロットは出さず play-pending を1本だけ。
    expect(screen.queryByLabelText("sf-loading")).toBeNull();
    expect(screen.getByLabelText("play-pending").textContent).toContain("歌声 2/2");
  });

  it("sfPreparing=true・pending/sfLoading 無し＝『楽器準備中…』を出す（最下位）", () => {
    store.reset();
    prep.reset();
    renderBar();
    expect(screen.queryByLabelText("sf-loading")).toBeNull();
    act(() => prep.set(true));
    const chip = screen.getByLabelText("sf-loading");
    expect(chip.textContent).toContain("楽器準備中");
  });

  it("優先順位：sfLoading（音源読込中）＞ sfPreparing（楽器準備中）", () => {
    store.reset();
    prep.reset();
    renderBar();
    act(() => {
      store.set(true);
      prep.set(true);
    });
    expect(screen.getByLabelText("sf-loading").textContent).toContain("音源読込中");
  });

  it("(d) pending 未指定＝▶に aria-busy を付けない・play-pending なし（従来 markup 一致）", () => {
    store.reset();
    prep.reset();
    renderBar();
    const btn = screen.getByLabelText("play-pause");
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(screen.queryByLabelText("play-pending")).toBeNull();
  });
});
