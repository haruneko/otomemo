// design#24 backlog「SF2 の IndexedDB 永続化」：primeSf2 が IDB を挟む契約。
// 実 SF2/smplr は読まず、IDB は fake store（Map）を __setSfTestHooks({idb}) で注入。
// fetch はファイル共有のスパイ（primeSf2 の ensureFetchDedup が最初に捕捉する origFetch）で回数を数える。
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { primeSf2, setActiveSoundFont, __setSfTestHooks } from "../src/audio";

let fetchMock: ReturnType<typeof vi.fn>;
let realFetch: typeof globalThis.fetch;
beforeAll(() => {
  realFetch = globalThis.fetch;
  // origFetch は最初の prime で globalThis.fetch を bind して捕捉＝以後この mock が実DL担当。
  fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

let urlSeq = 0;
const freshUrl = () => `blob:sf-idb-${urlSeq++}`; // 毎テスト別URL＝sfBufCache dedup を避ける

// Map ベースの fake IDB store。
function fakeStore(seed?: Record<string, ArrayBuffer>) {
  const m = new Map<string, ArrayBuffer>(Object.entries(seed ?? {}));
  return {
    map: m,
    get: vi.fn(async (u: string) => m.get(u) ?? null),
    put: vi.fn(async (u: string, b: ArrayBuffer) => {
      m.set(u, b);
    }),
  };
}

beforeEach(() => {
  fetchMock.mockClear();
});

describe("#24 SF2 IndexedDB 永続化 — primeSf2", () => {
  it("ミス：IDB に無ければ fetch し、結果を保存する", async () => {
    const store = fakeStore();
    __setSfTestHooks({ idb: store, reset: true });
    const url = freshUrl();
    setActiveSoundFont(url);

    const buf = await primeSf2(url);

    expect(store.get).toHaveBeenCalledWith(url);
    expect(fetchMock).toHaveBeenCalledTimes(1); // ネットワークDL 1回
    expect(store.put).toHaveBeenCalledTimes(1); // 保存
    expect(store.map.has(url)).toBe(true);
    expect(buf.byteLength).toBe(8);
  });

  it("ヒット：IDB にあれば fetch を呼ばず保存も呼ばない（cold 解消）", async () => {
    const url = freshUrl();
    const cached = new ArrayBuffer(16);
    const store = fakeStore({ [url]: cached });
    __setSfTestHooks({ idb: store, reset: true });
    setActiveSoundFont(url);

    const buf = await primeSf2(url);

    expect(fetchMock).not.toHaveBeenCalled(); // ネットワーク省略
    expect(store.put).not.toHaveBeenCalled();
    expect(buf).toBe(cached); // 保存済みバイト列そのまま
  });

  it("保存失敗は握りつぶし、fetch 結果をそのまま返す（機能劣化させない）", async () => {
    const url = freshUrl();
    const store = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => {
        throw new Error("QuotaExceeded");
      }),
    };
    __setSfTestHooks({ idb: store, reset: true });
    setActiveSoundFont(url);

    const buf = await primeSf2(url); // put が投げても解決する
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(buf.byteLength).toBe(8);
  });

  it("IndexedDB 不在（本体 idb・jsdom は indexedDB 無し）＝素通し＝fetch する", async () => {
    // idb:null で本体 impl へ戻す。jsdom には globalThis.indexedDB が無い→get は null→fetch。
    __setSfTestHooks({ idb: null, reset: true });
    expect((globalThis as any).indexedDB).toBeUndefined();
    const url = freshUrl();
    setActiveSoundFont(url);

    const buf = await primeSf2(url);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(buf.byteLength).toBe(8); // put(no-op) で投げず素通し
  });
});
