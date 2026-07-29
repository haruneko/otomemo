// #31 スライス1（design §31-9・§31-2）：メロ編集画面の中に「詞を書く入口」を置く。
//
// ⚠ 上位（docs/design.md #31・requirements「歌詞を書く」・architecture 同日追記）は**オーナー未レビュー**。
//    歌詞の置き場も案(い)の**仮置き**＝確定ではない。ただしここで扱うのは「音符を持つメロ自身の句」だけなので、
//    置き場がどの案に決まっても壊れない（design §31-0 の検算）。
//
// スライス1で縛ること：
//  ・書いた表記が句として**残る**（いままで流し込み欄の値は永続せず捨てられていた）。
//  ・読みは表記から機械が取り、**まとめて1回**で頼む。
//  ・読みを音符へ写しても**音符は1つも増えない**（placeMoras＝音符を作り替えない側）。
//  ・表記を直したら控えは使わない＝古い読みを音符に残さない。
//  ・読みが取れなければ「読みが取れませんでした」と出し、表記も音符もそのまま。
//  ・句の面を配線していない呼び側（既存の使い方）は**従来と1つも変わらない**。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { Note } from "../src/music";
import type { LyricLayer } from "../src/lyrics";

const { readings } = vi.hoisted(() => ({ readings: vi.fn() }));
vi.mock("../src/api", () => ({ api: { readings } }));

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

beforeEach(() => {
  readings.mockReset();
  readings.mockResolvedValue([AME]);
});

describe("PianoRoll：詞を書く入口（design §31-9）", () => {
  it("表記を書くと句になって残る（範囲は音符でなくそのメロの尺から決める）", async () => {
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type(screen.getByLabelText("lyric-text"), "雨");
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
    await userEvent.type(screen.getByLabelText("lyric-text"), "雨");
    expect(lyricJson()!.phrases[0]!.start).toBe(0);
    expect(lyricJson()!.phrases[0]!.beats).toBe(4); // 音符0個でも下限1小節＝範囲が0にならない
  });

  it("読みを取ると音符に読みが載る（漢字仮名交じりでも1字1音に化けない）", async () => {
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type(screen.getByLabelText("lyric-text"), "雨の日は");
    await waitFor(() => expect(notesJson().map((n) => n.syllable)).toEqual(["あ", "め", "の", "ひ", "わ"]), { timeout: 3000 });
    // 控えは「この表記のもの」として句に残る＝表記を直したら使わない、が成り立つ
    expect(lyricJson()!.phrases[0]!.reading!.forText).toBe("雨の日は");
  });

  it("読みを写しても音符は1つも増えない（placeMoras＝音符を作り替えない側）", async () => {
    // モーラ5・音符2＝字余り。flowLyric（合わせる）なら音符が割れるが、詞を打っただけでは割れない。
    render(<Harness notes0={[{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }]} />);
    await userEvent.type(screen.getByLabelText("lyric-text"), "雨の日は");
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 });
    const ns = notesJson();
    expect(ns).toHaveLength(2); // 増えない
    expect(ns.map((n) => [n.pitch, n.start, n.dur])).toEqual([[60, 0, 1], [62, 1, 1]]); // 位置も長さも動かない
    expect(ns.map((n) => n.syllable)).toEqual(["あ", "め"]); // 余ったモーラは載せない
  });

  it("読みは句をまとめて1回だけ頼む（1句ずつ呼ばない）", async () => {
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type(screen.getByLabelText("lyric-text"), "雨の日は");
    await waitFor(() => expect(readings).toHaveBeenCalled(), { timeout: 3000 });
    expect(readings).toHaveBeenCalledTimes(1); // 1文字ごとに呼ばない（打ち終わりを待ってから1回）
    expect(readings).toHaveBeenCalledWith(["雨の日は"]); // 句の表記の配列＝まとめて渡す
  });

  it("表記を直すと控えは使わない＝古い読みを音符に残したまま写し直さない", async () => {
    const lyric0: LyricLayer = {
      phrases: [{ id: "p1", start: 0, beats: 16, text: "雨の日は", reading: { forText: "空の日は", ...AME } }],
    };
    render(<Harness notes0={fiveNotes()} lyric0={lyric0} />);
    // 控えの forText が今の表記と違う＝古い。読みは音符へ写らない（音符は手つかず）。
    expect(notesJson().every((n) => n.syllable === undefined)).toBe(true);
    expect(screen.getByLabelText("lyric-reading-state")).toHaveTextContent("読みを取ります");
  });

  it("読みが取れなければ「読みが取れませんでした」と出し、表記も音符もそのまま", async () => {
    readings.mockRejectedValue(new Error("venv 無し"));
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type(screen.getByLabelText("lyric-text"), "雨の日は");
    await waitFor(() => expect(screen.getByLabelText("lyric-reading-state")).toHaveTextContent("読みが取れませんでした"), { timeout: 3000 });
    expect(lyricJson()!.phrases[0]!.text).toBe("雨の日は"); // 表記は消えない
    expect(notesJson().every((n) => n.syllable === undefined)).toBe(true); // 音符は触らない
    expect(notesJson()).toHaveLength(5);
  });

  it("失敗したあと「読みを取り直す」で頼み直せる", async () => {
    readings.mockRejectedValueOnce(new Error("venv 無し"));
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type(screen.getByLabelText("lyric-text"), "雨の日は");
    await waitFor(() => expect(screen.getByLabelText("lyric-reading-state")).toHaveTextContent("読みが取れませんでした"), { timeout: 3000 });
    await userEvent.click(screen.getByLabelText("lyric-reading-refresh"));
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 });
    expect(readings).toHaveBeenCalledTimes(2);
  });

  it("1句だけ読めなかった場合（results[i].error）も読みが取れませんでしたと出す・音符は触らない", async () => {
    readings.mockResolvedValue([{ words: [], moras: [], hl: null, breaks: [], error: "解析に失敗" }]);
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type(screen.getByLabelText("lyric-text"), "雨の日は");
    await waitFor(() => expect(screen.getByLabelText("lyric-reading-state")).toHaveTextContent("読みが取れませんでした"), { timeout: 3000 });
    expect(notesJson().every((n) => n.syllable === undefined)).toBe(true);
  });

  it("表記を空にすると句ごと消える（空の句を残さない）", async () => {
    render(<Harness notes0={fiveNotes()} />);
    const ta = screen.getByLabelText("lyric-text");
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

  it("既存のかな流し込み（合わせる側）は句があっても残る＝かな入力の口を殺さない", async () => {
    render(<Harness notes0={fiveNotes()} />);
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
    await userEvent.type(screen.getByLabelText("lyric-text"), "雨");
    await waitFor(() => expect(readings).toHaveBeenCalled(), { timeout: 3000 }); // 読み取りが走り出した

    // 返りを待つあいだに続きを打つ
    await userEvent.type(screen.getByLabelText("lyric-text"), "の日は");
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
    await userEvent.type(screen.getByLabelText("lyric-text"), "雨の日は");
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 });
    await waitFor(() => expect(document.querySelectorAll(".proll-fit-mark").length).toBeGreaterThan(0), { timeout: 3000 });
  });

  it("読みとメロが噛み合っていれば印は出ない", async () => {
    // 高低 [0,1,1,1,1] に沿って上げてから保つ＝裏切らない
    const along: Note[] = [60, 64, 64, 64, 64].map((pitch, i) => ({ pitch, start: i, dur: 1 }));
    render(<Harness notes0={along} />);
    await userEvent.type(screen.getByLabelText("lyric-text"), "雨の日は");
    await waitFor(() => expect(notesJson()[0]!.syllable).toBe("あ"), { timeout: 3000 });
    expect(document.querySelectorAll(".proll-fit-mark").length).toBe(0); // 凡例の .fit-red は数えない
  });
});

// スライス3：字余りと「メロがまだ途中」を言い分ける（design §31-5）。
describe("PianoRoll：句と音符の関係を言う", () => {
  it("音符が5・モーラが5なら『ちょうど』と言う", async () => {
    render(<Harness notes0={fiveNotes()} />);
    await userEvent.type(screen.getByLabelText("lyric-text"), "雨の日は");
    await waitFor(() => expect(screen.getByLabelText("lyric-phrase-status")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByLabelText("lyric-phrase-status").textContent).toBe("ちょうど");
  });

  it("音符が2・モーラが5なら『字余り3』と言う（機械は詰めない・音符も増やさない）", async () => {
    render(<Harness notes0={[{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }]} />);
    await userEvent.type(screen.getByLabelText("lyric-text"), "雨の日は");
    await waitFor(() => expect(screen.getByLabelText("lyric-phrase-status")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByLabelText("lyric-phrase-status").textContent).toBe("字余り3");
    expect(notesJson()).toHaveLength(2); // 言うだけ＝音符は増えない
  });
});
