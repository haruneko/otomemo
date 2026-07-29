// #31 スライス1（design §31-3(d)）：表記（漢字仮名交じり）→読みを取る口を画面から呼ぶ。
// ⚠ 上位（design #31 ほか）は**オーナー未レビュー**・歌詞の置き場は案(い)の仮置き。
//
// ここで縛るのは2つだけ：
//  ・**まとめて1回**で渡すこと（1句ずつ呼ぶと Python の起動と辞書読み込みが句の数だけ掛かる。
//    読み取り担当の実測＝40句を1句ずつ 5,407ms／まとめて1回 146ms＝37倍）。
//  ・入力が変（400）と機械側が読めなかった（502）を**呼び側が見分けられる**こと。
//    見分けられないと画面が「読みが取れませんでした」を出し分けられない（design §31-3(d)）。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError } from "../src/api";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => "" });

describe("api.readings（表記→読み）", () => {
  it("POST /music/reading に texts をまとめて1回で渡す", async () => {
    fetchMock.mockResolvedValue(ok({ results: [{ words: [], moras: [], hl: null, breaks: [] }, { words: [], moras: [], hl: null, breaks: [] }] }));
    const r = await api.readings(["雨の日は", "靴が濡れる"]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 句ごとに呼ばない
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/music/reading");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ texts: ["雨の日は", "靴が濡れる"] });
    expect(r).toHaveLength(2);
  });

  it("results をそのまま返す（かな・高低・語の列）", async () => {
    const one = {
      words: [{ surface: "雨", read: "アメ", pron: "アメ", moraCount: 2 }],
      moras: [{ kana: "あ", word: 0 }, { kana: "め", word: 0 }],
      hl: [1, 0],
      breaks: [],
    };
    fetchMock.mockResolvedValue(ok({ results: [one] }));
    expect(await api.readings(["雨"])).toEqual([one]);
  });

  it("400（入力が変）と 502（機械側が読めなかった）を status で見分けられる", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => "読みが取れませんでした" });
    const e = await api.readings(["雨"]).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(502);
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => "texts(string[]) が必要" });
    const e2 = await api.readings([""]).catch((x) => x);
    expect((e2 as ApiError).status).toBe(400);
  });
});
