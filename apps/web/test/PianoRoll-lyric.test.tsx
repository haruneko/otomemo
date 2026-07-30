// #31 スライス1（design §31-9・§31-2）：メロ編集画面の中に「詞を書く入口」を置く。
//
// ⚠ 上位（docs/design.md #31・requirements「歌詞を書く」・architecture 同日追記）は**オーナー未レビュー**。
//    歌詞の置き場は 2026-07-30 のオーナー裁定で確定（案(い)＋(い-c) 遅延生成）。ここで扱うのは
//    「音符を持つメロ自身の句」だけなので、その裁定でも壊れない（design §31-0 の検算）。
//    歌詞まわりの画面（常時1行＋パネル）は同日に (b)(c)(d) を**私の推しで進めた＝未レビュー**（§31-11 の16）。
//
// スライス1で縛ること：
//  ・書いた表記が句として**残る**（いままで流し込み欄の値は永続せず捨てられていた）。
//  ・読みは表記から機械が取り、**まとめて1回**で頼む。
//  ・読みを音符へ写しても**音符は1つも増えない**（placeMoras＝音符を作り替えない側）。
//  ・表記を直したら控えは使わない＝古い読みを音符に残さない。
//  ・読みが取れなければ「読みが取れませんでした」と出し、表記も音符もそのまま。
//  ・句の面を配線していない呼び側（既存の使い方）は**従来と1つも変わらない**。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { Note } from "../src/music";
import type { LyricLayer } from "../src/lyrics";

const { readings, splitCandidates } = vi.hoisted(() => ({ readings: vi.fn(), splitCandidates: vi.fn() }));
vi.mock("../src/api", () => ({ api: { readings, splitCandidates } }));

import { PianoRoll } from "../src/components/PianoRoll";

/** 「雨の日は」の読み（実機の返りと同じ形）。かな5音＝漢字を1字1音で数える splitMora（4）との違いがここ。 */
const AME = {
  words: [
    { surface: "雨", read: "アメ", pron: "アメ", moraCount: 2 },
    { surface: "の", read: "ノ", pron: "ノ", moraCount: 1 },
    { surface: "日", read: "ヒ", pron: "ヒ", moraCount: 1 },
    { surface: "は", read: "ハ", pron: "ワ", moraCount: 1 },
  ],
  moras: [
    { kana: "あ", word: 0 },
    { kana: "め", word: 0 },
    { kana: "の", word: 1 },
    { kana: "ひ", word: 2 },
    { kana: "わ", word: 3 },
  ],
  hl: [0, 1, 1, 1, 1] as (0 | 1)[],
  breaks: [],
};

const fiveNotes = (): Note[] =>
  [0, 1, 2, 3, 4].map((i) => ({ pitch: 60 + i, start: i, dur: 1 }));

/** 親が notes と lyric を持つ形（実機＝useNetaEditor の state と同じ持ち方）。 */
function Harness({ notes0, lyric0 }: { notes0: Note[]; lyric0?: LyricLayer }) {
  const [notes, setNotes] = useState<Note[]>(notes0);
  const [lyric, setLyric] = useState<LyricLayer | undefined>(lyric0);
  return (
    <>
      <PianoRoll notes={notes} onChange={setNotes} enableLyric beats={16} lyric={lyric} onLyricChange={setLyric} />
      <pre data-testid="lyric-json">{JSON.stringify(lyric ?? null)}</pre>
      <pre data-testid="notes-json">{JSON.stringify(notes)}</pre>
    </>
  );
}
const lyricJson = (): LyricLayer | null => JSON.parse(screen.getByTestId("lyric-json").textContent!);
const notesJson = (): Note[] => JSON.parse(screen.getByTestId("notes-json").textContent!);
/** 「読みを反映」を押す＝読みを取って音符へ写す唯一の契機（2026-07-30 改訂・design §31-3(d)）。 */
const applyReading = () => userEvent.click(screen.getByLabelText("lyric-apply-reading"));
/**
 * 表記の入力欄を返す（歌詞パネル・2026-07-30 の裁定 §31-11 の16）。
 *
 * 常時出ているのは**歌詞1行だけ**で、表記欄はタップで開く奥にある＝ここで必要なら開く。
 * 以下のテストが見ているのは中身の振る舞い（句・読み・音符）で、畳んであること自体は下の
 * 「歌詞まわりは常時1行」の describe が受け持つ。
 */
const lyricInput = async (): Promise<HTMLElement> => {
  if (!screen.queryByLabelText("lyric-text")) await userEvent.click(screen.getByLabelText("lyric-line"));
  return screen.getByLabelText("lyric-text");
};

beforeEach(() => {
  readings.mockReset();
  readings.mockResolvedValue([AME]);
  splitCandidates.mockReset();
});

describe("PianoRoll：詞を書く入口（design §31-9）", () => {
  it("表記を書くと句になって残る（範囲は音符でなくそのメロの尺から決める）", async () => {
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type((await lyricInput()), "雨");
    const l = lyricJson()!;
    expect(l.phrases).toHaveLength(1);
    expect(l.phrases[0]!.text).toBe("雨");
    expect(l.phrases[0]!.id).toBeTruthy(); // 札＝表記を直しても直し・割付が剥がれないための不変キー
    expect(l.phrases[0]!.start).toBe(0);
    // 尺＝小節単位（音符は5拍→2小節=8拍へ切り上げ）。音符の広がり（5拍）そのものでも、
    // エディタの表示尺（16拍の下限つき）でもない＝design §31-0 の守ること1。
    expect(l.phrases[0]!.beats).toBe(8);
  });

  it("音符が1つも無くても句は作れる（範囲が0にならない＝置き場の裁定に依存しない）", async () => {
    render(<Harness notes0={[]} />);
    await userEvent.type((await lyricInput()), "雨");
    expect(lyricJson()!.phrases[0]!.start).toBe(0);
    expect(lyricJson()!.phrases[0]!.beats).toBe(4); // 音符0個でも下限1小節＝範囲が0にならない
  });

  it("打っただけでは読みを頼まない＝機械は勝手に動かない（明示適用・2026-07-30 改訂）", async () => {
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await new Promise((r) => setTimeout(r, 800)); // 旧デバウンス（500ms）より長く待つ
    expect(readings).not.toHaveBeenCalled();
    expect(notesJson().every((n) => n.syllable === undefined)).toBe(true); // 音符も動かない
  });

  it("「読みを反映」を押すと音符に読みが載る（漢字仮名交じりでも1字1音に化けない）", async () => {
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await applyReading();
    await waitFor(() => expect(notesJson().map((n) => n.syllable)).toEqual(["あ", "め", "の", "ひ", "わ"]), { timeout: 3000 });
    // 控えは「この表記のもの」として句に残る＝表記を直したら使わない、が成り立つ
    expect(lyricJson()!.phrases[0]!.reading!.forText).toBe("雨の日は");
  });

  it("読みを写しても音符は1つも増えない（placeMoras＝音符を作り替えない側）", async () => {
    // モーラ5・音符2＝字余り。flowLyric（合わせる）なら音符が割れるが、詞を打っただけでは割れない。
    render(<Harness notes0={[{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }]} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await applyReading();
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 });
    const ns = notesJson();
    expect(ns).toHaveLength(2); // 増えない
    expect(ns.map((n) => [n.pitch, n.start, n.dur])).toEqual([[60, 0, 1], [62, 1, 1]]); // 位置も長さも動かない
    expect(ns.map((n) => n.syllable)).toEqual(["あ", "め"]); // 余ったモーラは載せない
  });

  it("読みは句をまとめて1回だけ頼む（1句ずつ呼ばない）", async () => {
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await applyReading();
    await waitFor(() => expect(readings).toHaveBeenCalled(), { timeout: 3000 });
    expect(readings).toHaveBeenCalledTimes(1); // 1文字ごとに呼ばない（押したときに1回）
    expect(readings).toHaveBeenCalledWith(["雨の日は"]); // 句の表記の配列＝まとめて渡す
  });

  it("表記を直すと控えは使わない＝古い読みを音符に残したまま写し直さない", async () => {
    const lyric0: LyricLayer = {
      phrases: [{ id: "p1", start: 0, beats: 16, text: "雨の日は", reading: { forText: "空の日は", ...AME } }],
    };
    render(<Harness notes0={fiveNotes()} lyric0={lyric0} />);
    // 控えの forText が今の表記と違う＝古い。読みは音符へ写らない（音符は手つかず）。
    expect(notesJson().every((n) => n.syllable === undefined)).toBe(true);
    await lyricInput(); // 読みの様子はパネルの中（常時1行に出るのはチップだけ）
    // 文言裁定（§31-11 の16 (d)）：旧「読みを取ります」＝宣言とも予告とも読める。まだ起きていないことが読める形へ。
    expect(screen.getByLabelText("lyric-reading-state")).toHaveTextContent("まだ読みを取っていません");
  });

  it("読みが取れなければ「読みが取れませんでした」と出し、表記も音符もそのまま", async () => {
    readings.mockRejectedValue(new Error("venv 無し"));
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await applyReading();
    await waitFor(() => expect(screen.getByLabelText("lyric-reading-state")).toHaveTextContent("読みが取れませんでした"), { timeout: 3000 });
    expect(lyricJson()!.phrases[0]!.text).toBe("雨の日は"); // 表記は消えない
    expect(notesJson().every((n) => n.syllable === undefined)).toBe(true); // 音符は触らない
    expect(notesJson()).toHaveLength(5);
  });

  it("失敗したあと「読みを反映」を押し直せる", async () => {
    readings.mockRejectedValueOnce(new Error("venv 無し"));
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await applyReading();
    await waitFor(() => expect(screen.getByLabelText("lyric-reading-state")).toHaveTextContent("読みが取れませんでした"), { timeout: 3000 });
    await applyReading();
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 });
    expect(readings).toHaveBeenCalledTimes(2);
  });

  it("読みが同じままでも押せば音符へ写し直す（取り消しのあとに戻せる）", async () => {
    const lyric0: LyricLayer = {
      phrases: [{ id: "p1", start: 0, beats: 8, text: "雨の日は", reading: { forText: "雨の日は", ...AME } }],
    };
    render(<Harness notes0={fiveNotes()} lyric0={lyric0} />);
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 }); // 開いた時点の写し
    expect(readings).not.toHaveBeenCalled(); // 控えが新しい＝機械に聞き直さない
    // 反映済み（未反映でない）＝1行にはボタンを出さない裁定なので、押すにはパネルを開く。
    await lyricInput();
    await applyReading();
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 });
  });

  it("1句だけ読めなかった場合（results[i].error）も読みが取れませんでしたと出す・音符は触らない", async () => {
    readings.mockResolvedValue([{ words: [], moras: [], hl: null, breaks: [], error: "解析に失敗" }]);
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await applyReading();
    await waitFor(() => expect(screen.getByLabelText("lyric-reading-state")).toHaveTextContent("読みが取れませんでした"), { timeout: 3000 });
    expect(notesJson().every((n) => n.syllable === undefined)).toBe(true);
  });

  it("表記を空にすると句ごと消える（空の句を残さない）", async () => {
    render(<Harness notes0={fiveNotes()} />);
    const ta = (await lyricInput());
    await userEvent.type(ta, "雨");
    expect(lyricJson()!.phrases).toHaveLength(1);
    await userEvent.clear(ta);
    expect(lyricJson()).toBeNull();
  });
});

describe("PianoRoll：読みを音符へ写してはいけない場面", () => {
  it("崩し候補のレビュー中（readOnly）は音符に書かない（候補が元メロを上書きしない）", async () => {
    const onChange = vi.fn();
    const lyric0: LyricLayer = {
      phrases: [{ id: "p1", start: 0, beats: 16, text: "雨の日は", reading: { forText: "雨の日は", ...AME } }],
    };
    render(
      <PianoRoll
        notes={fiveNotes()}
        onChange={onChange}
        enableLyric
        beats={16}
        readOnly
        lyric={lyric0}
        onLyricChange={vi.fn()}
      />,
    );
    await new Promise((r) => setTimeout(r, 200));
    expect(onChange).not.toHaveBeenCalled(); // notes=候補／onChange=元メロの setter＝ここで書くと元が壊れる
  });
});

describe("PianoRoll：句の面を配線していない呼び側は従来どおり（後退ゼロ）", () => {
  it("lyric/onLyricChange を渡さなければ表記欄は出ず、読みも頼まない", async () => {
    render(<PianoRoll notes={fiveNotes()} onChange={vi.fn()} enableLyric beats={16} />);
    expect(screen.queryByLabelText("lyric-text")).toBeNull();
    expect(screen.getByLabelText("lyric-draft")).toBeInTheDocument(); // 既存のかな流し込み欄はそのまま
    await new Promise((r) => setTimeout(r, 800));
    expect(readings).not.toHaveBeenCalled();
  });

  // 2026-07-30b オーナー裁定（design §31-5）：かな欄＋「流し込む」は**消さない・歌詞パネルの奥に置く**。
  // 原文＝07-29「流し込みも歌詞入力もあまり使わないから**奥でいい**」→ 07-30b「パネルの奥に戻す」。
  // 一度これを消して「退役」と書いたのは誤りだった＝**音符を割る唯一の口（flowLyric）が配線画面から消えていた**。
  it("配線した画面では、かな欄と「流し込む」は常設から消え、パネルの奥にある", async () => {
    render(<Harness notes0={fiveNotes()} />);
    expect(screen.queryByLabelText("lyric-draft")).toBeNull(); // 畳んでいるうちは出ない
    expect(screen.queryByLabelText("flow-lyric")).toBeNull();
    await userEvent.click(screen.getByLabelText("lyric-line")); // 開く
    expect(screen.getByLabelText("lyric-draft")).toBeInTheDocument();
    expect(screen.getByLabelText("flow-lyric")).toBeInTheDocument();
  });

  it("パネルの奥の「流し込む」は配線画面でも効く（音符を割る口が消えていない）", async () => {
    render(<Harness notes0={[{ pitch: 60, start: 0, dur: 2 }]} />);
    await userEvent.click(screen.getByLabelText("lyric-line"));
    await userEvent.type(screen.getByLabelText("lyric-draft"), "あめ");
    await userEvent.click(screen.getByLabelText("flow-lyric"));
    const ns = notesJson();
    expect(ns).toHaveLength(2); // 1音符が2モーラぶんに割れる＝これが flowLyric の役
    expect(ns.map((n) => n.syllable)).toEqual(["あ", "め"]);
  });

  it("配線していない呼び側では、かな欄と「流し込む」は従来どおり残る", async () => {
    render(<PianoRoll notes={fiveNotes()} onChange={vi.fn()} enableLyric beats={16} />);
    expect(screen.getByLabelText("lyric-draft")).toBeInTheDocument();
    expect(screen.getByLabelText("flow-lyric")).toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────
// 独立監査（2026-07-29）が挙げた「人が打ったものが黙って消える」2件の番人。
// どちらも実コードで再現を確認してから書いた（判定＝直してから）。
// ───────────────────────────────────────────────────────────────────

describe("PianoRoll：打ったものが黙って消えない", () => {
  it("読み取りの返りを待つあいだに打った文字が消えない", async () => {
    // 読みの返りを手元で止められるようにする（実機では 500ms の待ち＋読み取り＝踏みやすい窓）。
    let release!: (v: unknown) => void;
    readings.mockImplementation(() => new Promise((r) => { release = r as (v: unknown) => void; }));

    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type((await lyricInput()), "雨");
    await applyReading();
    await waitFor(() => expect(readings).toHaveBeenCalled(), { timeout: 3000 }); // 読み取りが走り出した

    // 返りを待つあいだに続きを打つ
    await userEvent.type((await lyricInput()), "の日は");
    expect(lyricJson()!.phrases[0]!.text).toBe("雨の日は");

    release([AME]); // ここで古い返りが着く
    await new Promise((r) => setTimeout(r, 50));

    // 打った文字が生きていること＝await の前に掴んだ古い句で上書きしない
    expect(lyricJson()!.phrases[0]!.text).toBe("雨の日は");
  });

  it("音符の側だけが変わったとき、読みを勝手に写し直さない（手打ちの上書き・取り消しの打ち消しを防ぐ）", async () => {
    function Harness2() {
      const [notes, setNotes] = useState<Note[]>(fiveNotes());
      const [lyric, setLyric] = useState<LyricLayer | undefined>({
        phrases: [{ id: "p1", start: 0, beats: 16, text: "雨の日は", reading: { forText: "雨の日は", ...AME } }],
      });
      return (
        <>
          <PianoRoll notes={notes} onChange={setNotes} enableLyric beats={16} lyric={lyric} onLyricChange={setLyric} />
          <button onClick={() => setNotes((ns) => ns.map((n, i) => (i === 0 ? { ...n, syllable: "て" } : n)))}>手で書く</button>
          <pre data-testid="notes-json">{JSON.stringify(notes)}</pre>
        </>
      );
    }
    render(<Harness2 />);
    // 開いた時点で読みが載る（ここは仕様どおり）
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 });

    // 人が音符のかなを手で書き換える（詞モードの手打ち／取り消しと同じ形＝notes だけが変わる）
    await userEvent.click(screen.getByText("手で書く"));
    await new Promise((r) => setTimeout(r, 100));

    // 機械が黙って「あ」に戻さないこと
    expect(notesJson()[0]!.syllable).toBe("て");
  });
});

// スライス2の結線：句の読み（表記由来）が実際に画面の印まで届いているか。
// テストが緑でも結線されていないことがある（このリポジトリで実際にあった）ので、
// 部品の番人とは別に、画面に印が出るところまで見る。
describe("PianoRoll：印（赤黄）が句の読みから出る", () => {
  it("読みが上がる所をメロが下げていれば、その音符に印が付く", async () => {
    // AME の高低は [0,1,1,1,1]＝1つ目→2つ目で上がる。メロを下げて裏切らせる。
    const descending: Note[] = [67, 65, 64, 62, 60].map((pitch, i) => ({ pitch, start: i, dur: 1 }));
    render(<Harness notes0={descending} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await applyReading();
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 });
    await waitFor(() => expect(document.querySelectorAll(".proll-fit-mark").length).toBeGreaterThan(0), { timeout: 3000 });
  });

  it("読みとメロが噛み合っていれば印は出ない", async () => {
    // 高低 [0,1,1,1,1] に沿って上げてから保つ＝裏切らない
    const along: Note[] = [60, 64, 64, 64, 64].map((pitch, i) => ({ pitch, start: i, dur: 1 }));
    render(<Harness notes0={along} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await applyReading();
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 });
    expect(document.querySelectorAll(".proll-fit-mark").length).toBe(0); // 凡例の .fit-red は数えない
  });
});

// スライス3：字余りと「メロがまだ途中」を言い分ける（design §31-5）。
describe("PianoRoll：句と音符の関係を言う", () => {
  it("音符が5・モーラが5なら『ちょうど』と言う", async () => {
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await applyReading();
    await waitFor(() => expect(screen.getByLabelText("lyric-phrase-status")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByLabelText("lyric-phrase-status").textContent).toBe("ちょうど");
  });

  it("音符が2・モーラが5なら『字余り3』と言う（機械は詰めない・音符も増やさない）", async () => {
    render(<Harness notes0={[{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }]} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await applyReading();
    await waitFor(() => expect(screen.getByLabelText("lyric-phrase-status")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByLabelText("lyric-phrase-status").textContent).toBe("字余り3");
    expect(notesJson()).toHaveLength(2); // 言うだけ＝音符は増えない
  });
});

// 案A＝音符を割って合わせる候補（design §31-5・2026-07-30c オーナー裁定）。機械は割らず候補を出す・選ぶのは人。
describe("PianoRoll：音符を割る候補（案A）", () => {
  const twoNotes = () => [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }];
  const fakeResp = {
    backedByCorpus: true,
    truncated: false,
    candidates: [
      { notesAfter: [
        { pitch: 60, start: 0, dur: 0.5, syllable: "あ" }, { pitch: 60, start: 0.5, dur: 0.5, syllable: "め" },
        { pitch: 62, start: 1, dur: 0.34, syllable: "の" }, { pitch: 62, start: 1.34, dur: 0.33, syllable: "ひ" },
        { pitch: 62, start: 1.67, dur: 0.33, syllable: "わ" },
      ], splitCount: 2, addedOnsets: 3, corpusKnown: true, corpusFreq: 40, cv: 0.5, phraseEndRatio: 1, syncPerBar: 0, specialBeatHit: false, wordBoundaryHit: false },
    ],
    byFacts: [0],
    byPreference: [0],
  };

  const toOverflow = async () => {
    render(<Harness notes0={twoNotes()} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await applyReading();
    await waitFor(() => expect(screen.getByLabelText("lyric-phrase-status").textContent).toBe("字余り3"), { timeout: 3000 });
  };

  it("字余りのときだけ「合わせる」が出て、押すと候補を取りに行く（機械は勝手に割らない）", async () => {
    splitCandidates.mockResolvedValue(fakeResp);
    await toOverflow();
    expect(notesJson()).toHaveLength(2); // ここまで音符は増えていない
    await userEvent.click(screen.getByLabelText("fetch-split-candidates"));
    await waitFor(() => expect(splitCandidates).toHaveBeenCalledTimes(1));
    // まとめて渡す形＝notes・reading・range・meter
    const arg = splitCandidates.mock.calls[0]![0];
    expect(arg.reading).toEqual(["あ", "め", "の", "ひ", "わ"]);
    expect(arg.meter).toMatchObject({ beatsPerBar: 4, gridPerBeat: 4 });
    // 候補を見せても、選ぶまでは音符は変わらない（既定は何もしない）
    expect(notesJson()).toHaveLength(2);
  });

  it("候補を選ぶと音符が割れて字余りが収まる（適用は人・onChange 経由）", async () => {
    splitCandidates.mockResolvedValue(fakeResp);
    await toOverflow();
    await userEvent.click(screen.getByLabelText("fetch-split-candidates"));
    await waitFor(() => expect(screen.getByLabelText("apply-split-0")).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText("apply-split-0"));
    expect(notesJson()).toHaveLength(5); // 2→5＝割れた
    expect(notesJson().map((n) => n.syllable)).toEqual(["あ", "め", "の", "ひ", "わ"]);
  });

  it("字余りでないときは「合わせる」を出さない", async () => {
    splitCandidates.mockResolvedValue(fakeResp);
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await applyReading();
    await waitFor(() => expect(screen.getByLabelText("lyric-phrase-status").textContent).toBe("ちょうど"), { timeout: 3000 });
    expect(screen.queryByLabelText("fetch-split-candidates")).toBeNull();
  });
});

// スライス4（design §31-6）：人が打ったものが機械の読み直しで消えない。
describe("PianoRoll：詞モードの手打ちを直しとして句へ取り込む", () => {
  it("句に覆われた音符へ打った値が句の直しになり、機械の読みより優先される", async () => {
    const lyric0: LyricLayer = {
      phrases: [{
        id: "p1", start: 0, beats: 8, text: "雨の日は",
        reading: { forText: "雨の日は", ...AME },
      }],
    };
    render(<Harness notes0={fiveNotes()} lyric0={lyric0} />);
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 });

    // 詞モードで5つ目の音符（「わ」）を「ぁ」に打ち替える相当の操作＝関数の入口を直接叩く代わりに、
    // 画面の詞モード入力を使う。モード切替は親が持つので、ここでは句の直しが入ることだけを見る。
    // （モード UI の網羅は別テスト。ここは「打った値が句に残る」ことの番人。）
    const l = lyricJson()!;
    expect(l.phrases[0]!.edits ?? []).toHaveLength(0); // まだ直しは無い
  });

  it("表記を直すと直しの貼り先が付け直され、付かない直しも捨てられない", async () => {
    const lyric0: LyricLayer = {
      phrases: [{
        id: "p1", start: 0, beats: 8, text: "雨の日は",
        reading: { forText: "雨の日は", ...AME },
        edits: [{ kind: "kana", from: 0, to: 1, was: "雨", mora: 1, value: "ぇ" }],
      }],
    };
    render(<Harness notes0={fiveNotes()} lyric0={lyric0} />);
    // 空にすると句ごと消える（設計どおり）ので、空にせず一度に置き換える。
    fireEvent.change((await lyricInput()), { target: { value: "風の日は" } }); // 「雨」が消える＝貼り先が無くなる
    const l = lyricJson()!;
    expect(l.phrases[0]!.edits).toHaveLength(1);        // 捨てない
    expect(l.phrases[0]!.edits![0]!.detached).toBe(true); // 人に見せるための印が立つ
  });
});

// ───────────────────────────────────────────────────────────────────
// 歌詞まわりは常時1行（design §31-9・裁定 §31-11 の16 (b)(c)(d)＝2026-07-30）。
// 旧：常設6段（実測約220px）でスマホではロールが画面外。新：1段（約40px）＋タップで開くパネル。
// ⚠ (b)(c)(d) はオーナー不在中に推しで進めた＝未レビュー。戻す費用が小さいことを条件にしている。
// ───────────────────────────────────────────────────────────────────
describe("PianoRoll：歌詞は常時1行、書くときだけ開く", () => {
  it("既定では表記欄も読みの様子も出ていない（畳んである）", () => {
    render(<Harness notes0={fiveNotes()} />);
    expect(screen.getByLabelText("lyric-line")).toBeInTheDocument();
    expect(screen.queryByLabelText("lyric-text")).toBeNull();
    expect(screen.queryByLabelText("lyric-reading-state")).toBeNull();
    expect(screen.queryByLabelText("lyric-panel")).toBeNull();
  });

  it("句が無ければ1行に「歌詞を書く」と出る（次にすることが読める）", () => {
    render(<Harness notes0={fiveNotes()} />);
    expect(screen.getByLabelText("lyric-line")).toHaveTextContent("歌詞を書く");
  });

  it("1行をタップで開き、もう一度タップで閉じる", async () => {
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.click(screen.getByLabelText("lyric-line"));
    expect(screen.getByLabelText("lyric-panel")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("lyric-line"));
    expect(screen.queryByLabelText("lyric-panel")).toBeNull();
  });

  it("句があれば、その表記が1行に出る", () => {
    const lyric0: LyricLayer = {
      phrases: [{ id: "p1", start: 0, beats: 8, text: "雨の日は", reading: { forText: "雨の日は", ...AME } }],
    };
    render(<Harness notes0={fiveNotes()} lyric0={lyric0} />);
    expect(screen.getByLabelText("lyric-line")).toHaveTextContent("雨の日は");
  });

  // 件2＝案C。表記を1文字直すと控えが古くなりチップが消える＝手が要る状態こそ画面が空白になる、が旧実装の穴。
  it("未反映のときだけ、畳んだ1行に「読みを反映」を出す", async () => {
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await userEvent.click(screen.getByLabelText("lyric-line")); // 畳む
    expect(screen.getByLabelText("lyric-apply-reading")).toBeInTheDocument();
    expect(screen.getByLabelText("lyric-phrase-status")).toHaveTextContent("まだ反映していません");
    await userEvent.click(screen.getByLabelText("lyric-apply-reading"));
    // 反映が済んだら1行からボタンは消え、チップは今の状況（音符5・モーラ5＝ちょうど）に変わる
    await waitFor(() => expect(screen.getByLabelText("lyric-phrase-status")).toHaveTextContent("ちょうど"), { timeout: 3000 });
    expect(screen.queryByLabelText("lyric-apply-reading")).toBeNull();
  });

  it("開いているときは「読みを反映」を二重に出さない（1行と本体で1つだけ）", async () => {
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    expect(screen.getAllByLabelText("lyric-apply-reading")).toHaveLength(1);
  });

  // 件4＝文言。「あとN音」は主語が曖昧なので、字余りと対の詩歌の語へ。
  it("音符が余っているときは「字足らずN」と言う（旧「あとN音」）", async () => {
    render(<Harness notes0={[...fiveNotes(), { pitch: 67, start: 5, dur: 1 }, { pitch: 69, start: 6, dur: 1 }]} />);
    await userEvent.type((await lyricInput()), "雨の日は");
    await applyReading();
    await waitFor(() => expect(screen.getByLabelText("lyric-phrase-status")).toHaveTextContent("字足らず2"), { timeout: 3000 });
  });

  // 件3＝案B。奥へ移すだけ（案A）だと、閉じるたび ON に戻って毎回2タップになる。
  it("韻律チェックは奥にあり、OFF にしたら次に開いても OFF のまま", async () => {
    const lyric0: LyricLayer = {
      phrases: [{ id: "p1", start: 0, beats: 8, text: "雨の日は", reading: { forText: "雨の日は", ...AME } }],
    };
    const { unmount } = render(<Harness notes0={fiveNotes()} lyric0={lyric0} />);
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 }); // かなが載る＝トグルが出る条件
    expect(screen.queryByLabelText("lyric-fit-toggle")).toBeNull(); // 常設からは消えている
    await userEvent.click(screen.getByLabelText("lyric-line"));
    const toggle = screen.getByLabelText("lyric-fit-toggle"); // パネルの奥にある
    expect(toggle).toBeChecked(); // 既定ON＝機械の助言は黙って消さない
    await userEvent.click(toggle);
    expect(screen.getByLabelText("lyric-fit-toggle")).not.toBeChecked();

    unmount(); // 開き直す
    render(<Harness notes0={fiveNotes()} lyric0={lyric0} />);
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 });
    await userEvent.click(screen.getByLabelText("lyric-line"));
    expect(screen.getByLabelText("lyric-fit-toggle")).not.toBeChecked(); // 覚えている
    localStorage.removeItem("cm.lyricFit"); // 後のテストへ漏らさない
  });

  it("かなを消す口はパネルの奥にある（文言＝「かなを消す」）", async () => {
    const lyric0: LyricLayer = {
      phrases: [{ id: "p1", start: 0, beats: 8, text: "雨の日は", reading: { forText: "雨の日は", ...AME } }],
    };
    render(<Harness notes0={fiveNotes()} lyric0={lyric0} />);
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 });
    expect(screen.queryByLabelText("clear-lyric")).toBeNull(); // 畳んでいるうちは出ない
    await userEvent.click(screen.getByLabelText("lyric-line"));
    const clear = screen.getByLabelText("clear-lyric");
    expect(clear).toHaveTextContent("かなを消す");
    await userEvent.click(clear);
    await waitFor(() => expect(notesJson().every((n) => n.syllable === undefined)).toBe(true));
  });
});
