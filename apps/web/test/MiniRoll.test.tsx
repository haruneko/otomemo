import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MiniRoll } from "../src/components/MiniRoll";
import type { Neta } from "../src/api";

const mk = (kind: string, content: unknown): Neta => ({
  id: "x",
  kind,
  title: null,
  text: null,
  content,
  key: null,
  mode: null,
  tempo: null,
  meter: null,
  bars: null,
  mood: null,
  tags: [],
  created: "",
  updated: "",
});

describe("MiniRoll (#48)", () => {
  it("renders one rect per melody note", () => {
    const { container } = render(
      <MiniRoll
        neta={mk("melody", {
          notes: [
            { pitch: 60, start: 0, dur: 1 },
            { pitch: 64, start: 1, dur: 1 },
          ],
        })}
      />,
    );
    expect(container.querySelectorAll("rect").length).toBe(2);
  });

  it("renders nothing for non-music kinds", () => {
    const { container } = render(<MiniRoll neta={mk("lyric", null)} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  // 監査（横断/堅牢性）：不正 content 由来の NaN で <rect> が NaN 属性になり／描画が落ちて一覧全体を巻き込む事故を防ぐ。
  it("不正な数値(NaN)を含むノートを描画しても落ちず、NaN属性の rect を出さない", () => {
    const bad = {
      notes: [
        { pitch: 60, start: 0, dur: 1 }, // 正常
        { pitch: NaN, start: 0, dur: 1 }, // pitch NaN
        { pitch: 62, start: NaN, dur: 1 }, // start NaN
        { pitch: 64, start: 0, dur: NaN }, // dur NaN
      ],
    };
    const { container } = render(<MiniRoll neta={mk("melody", bad)} />);
    const rects = [...container.querySelectorAll("rect")];
    // 正常な1音だけ描かれる
    expect(rects.length).toBe(1);
    for (const r of rects) {
      for (const attr of ["x", "y", "width", "height"]) {
        expect(r.getAttribute(attr)).not.toContain("NaN");
      }
    }
  });

  it("全ノートが不正なら何も描かない（null）", () => {
    const { container } = render(
      <MiniRoll neta={mk("melody", { notes: [{ pitch: NaN, start: NaN, dur: NaN }] })} />,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});

// #31 (い-c) 遅延生成の裁定（2026-07-30・design §31-9）：詞先で生まれるメロは「句はあるが音符がまだ無い」。
// 音符0個で null を返すままだと**中身があるのにカードが真っ白**になる（オーナー「見た目には微妙」の正体）。
// 決め＝絵の枠には状況を1行（見出し＝句は NetaList 側の仕事＝同じ文字を2回出さない）。
describe("MiniRoll＝音符がまだ無いメロ（詞先）", () => {
  const phrase = (over: Record<string, unknown> = {}) => ({
    id: "p1",
    start: 0,
    beats: 4,
    text: "時計の針が止まる",
    ...over,
  });
  const reading = (text: string, kanas: string[]) => ({
    forText: text,
    words: [],
    moras: kanas.map((kana) => ({ kana, word: -1 })),
    hl: null,
    breaks: [],
  });

  it("句があれば、状況と音数を1行出す（絵は描かない）", () => {
    const text = "時計の針が止まる";
    const kanas = ["と", "け", "い", "の", "は", "り", "が", "と", "ま", "る"];
    const { container } = render(
      <MiniRoll
        neta={mk("melody", { notes: [], lyric: { phrases: [phrase({ text, reading: reading(text, kanas) })] } })}
      />,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toContain("音符はまだ無い");
    expect(container.textContent).toContain("10音"); // 読みの控えが今の表記のものなら音数も出す
  });

  it("読みをまだ取っていない句なら、音数は出さず状況だけ出す", () => {
    const { container } = render(
      <MiniRoll neta={mk("melody", { notes: [], lyric: { phrases: [phrase()] } })} />,
    );
    expect(container.textContent).toContain("音符はまだ無い");
    expect(container.textContent).not.toContain("音符はまだ無い ・"); // 中黒つきの音数は出ない
  });

  it("表記を直して読みが古くなった句では、音数を出さない（古い音数を見せない）", () => {
    const { container } = render(
      <MiniRoll
        neta={mk("melody", {
          notes: [],
          // 控えは前の表記のもの＝isReadingStale。PianoRoll の読み行と同じ判断にそろえる。
          lyric: { phrases: [phrase({ text: "時計の針が止まった", reading: reading("時計の針が止まる", ["と", "け", "い"]) })] },
        })}
      />,
    );
    expect(container.textContent).toContain("音符はまだ無い");
    expect(container.textContent).not.toContain("3音");
  });

  it("句が無い音符0個のネタは従来どおり何も描かない（既存50件の見えを変えない）", () => {
    const { container } = render(<MiniRoll neta={mk("melody", { notes: [] })} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("メロ以外（bass）は句を見ない＝従来どおり何も描かない", () => {
    // 配置済みの音符0個ネタは全部 bass（実データ104件中50件が音符0個・配置6件は全部 bass）。
    const { container } = render(
      <MiniRoll neta={mk("bass", { notes: [], lyric: { phrases: [phrase()] } })} />,
    );
    expect(container.textContent).toBe("");
  });
});
