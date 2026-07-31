import { describe, it, expect } from "vitest";
import { collectLyricRows } from "../src/lyricOverview";
import type { CompositionNode, Neta } from "../src/api";

// 最小の Neta を作る（型に必要な欄だけ・content は素通し）。
const neta = (o: Partial<Neta> & { id: string; kind: string }): Neta => ({
  title: null, content: {}, key: 0, tempo: 120, meter: "4/4", scope: "project", tags: [],
  created_at: "", updated_at: "", text: null, ...o,
} as Neta);
const melodyWithPhrase = (id: string, text: string, phraseStart = 0): CompositionNode => ({
  neta: neta({
    id, kind: "melody",
    content: {
      notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }],
      lyric: { phrases: [{ id: id + "-p", start: phraseStart, beats: 4, text,
        reading: { forText: text, words: [], moras: [{ kana: "あ", word: 0 }, { kana: "い", word: 0 }], hl: [0, 1], breaks: [] } }] },
    },
  }),
  children: [],
});
const section = (id: string, role: string, ...kids: { position: number; node: CompositionNode }[]): CompositionNode => ({
  neta: neta({ id, kind: "section", title: id, tags: [`role:${role}`] }),
  children: kids.map((k, i) => ({ position: k.position, ord: i, node: k.node })),
});

describe("collectLyricRows：曲の句を時間順に集める", () => {
  it("song→section→メロ を時間順に1系統で並べ、セクション見出しと小節番号を出す", () => {
    // イントロ(0拍〜)＝メロ「あさ」／Aメロ(4拍〜)＝メロ「ひる」＋「よる」(4拍目)
    const song: CompositionNode = {
      neta: neta({ id: "song", kind: "song", title: "テスト曲" }),
      children: [
        { position: 0, ord: 0, node: section("s-intro", "intro", { position: 0, node: melodyWithPhrase("m1", "あさ") }) },
        { position: 4, ord: 1, node: section("s-a", "verse",
          { position: 0, node: melodyWithPhrase("m2", "ひる") },
          { position: 4, node: melodyWithPhrase("m3", "よる") }) },
      ],
    };
    const { sections, rows } = collectLyricRows(song);
    // セクションは時間順（イントロ→Aメロ）
    expect(sections.map((s) => s.label)).toEqual(["Intro", "Aメロ"]); // 既存 ROLE_INFO と一貫
    expect(sections[0]!.startBar).toBe(1); // 0拍=1小節
    expect(sections[1]!.startBar).toBe(2); // 4拍=2小節
    // 行は時間順・表記が出る
    expect(rows.map((r) => r.text)).toEqual(["あさ", "ひる", "よる"]);
    expect(rows.map((r) => r.startBar)).toEqual([1, 2, 3]); // 0拍/4拍/8拍→1/2/3小節
    // セクション対応
    expect(rows[0]!.sectionIndex).toBe(0);
    expect(rows[2]!.sectionIndex).toBe(1);
    // 読み（控えが今の表記＝有効）
    expect(rows[0]!.kana).toBe("あい");
    expect(rows[0]!.hl).toEqual([0, 1]);
    // ＋句を足す（遅延生成）に要る＝各セクションの netaId と次の配置拍
    expect(sections[0]!.netaId).toBe("s-intro");
    expect(sections[1]!.netaId).toBe("s-a");
    expect(sections[1]!.nextBeat).toBeGreaterThan(0); // 末尾＝既存の子の最遠端
  });

  it("字余り（モーラ2・音符…）を事実として出す", () => {
    // 音符2・モーラ5相当を作る：readingを5モーラに。
    const m: CompositionNode = {
      neta: neta({ id: "mj", kind: "melody", content: {
        notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }],
        lyric: { phrases: [{ id: "mj-p", start: 0, beats: 4, text: "雨の日は",
          reading: { forText: "雨の日は", words: [], moras: ["あ", "め", "の", "ひ", "わ"].map((k) => ({ kana: k, word: 0 })), hl: [0, 1, 1, 1, 1], breaks: [] } }] },
      } }),
      children: [],
    };
    const song: CompositionNode = { neta: neta({ id: "sg", kind: "song" }), children: [{ position: 0, ord: 0, node: section("s", "verse", { position: 0, node: m }) }] };
    const { rows } = collectLyricRows(song);
    expect(rows[0]!.facts.jiamari).toBe(3); // モーラ5・音符2＝字余り3
  });

  it("句の無いメロは『詞なし』行として出る（メロが在ることは示す）", () => {
    const m: CompositionNode = { neta: neta({ id: "mn", kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } }), children: [] };
    const song: CompositionNode = { neta: neta({ id: "sg2", kind: "song" }), children: [{ position: 0, ord: 0, node: section("s2", "verse", { position: 0, node: m }) }] };
    const { rows } = collectLyricRows(song);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text).toBe("");
    expect(rows[0]!.facts.noLyric).toBe(true);
  });

  it("空/未定義は空の結果（落ちない）", () => {
    expect(collectLyricRows(null)).toEqual({ sections: [], rows: [] });
  });
});
