// design#24 backlog「音源読込中の表示」：SF2 ロード中だけ「音源読込中…」(aria-label=sf-loading)が出て、
// 完了で消える。audio の購読口（subscribeSfLoading/isSfLoading）は fake で制御。MixerControl は無効化。
import { describe, it, expect, vi } from "vitest";
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
vi.mock("../src/audio", () => ({
  isSfLoading: store.isSfLoading,
  subscribeSfLoading: store.subscribeSfLoading,
}));

import { TransportBar } from "../src/components/TransportBar";

function renderBar() {
  return render(
    <TransportBar
      state="stopped"
      loopOn={false}
      timeRef={{ current: null }}
      onPlayPause={() => {}}
      onRewind={() => {}}
      onToggleLoop={() => {}}
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
