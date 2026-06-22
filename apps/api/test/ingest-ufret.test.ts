import { describe, it, expect } from "vitest";
import { parseChordSymbol } from "../src/music/chordname";
import { extractUfretLines, linesToChords, extractLoops, songToProgressions, extractSongTitle } from "../src/ingest-ufret";

describe("parseChordSymbol（コード名→root/quality）", () => {
  const cases: [string, number, string][] = [
    ["B", 11, ""], ["A#m", 10, "m"], ["G#m7", 8, "m7"], ["Emaj7", 4, "maj7"],
    ["C", 0, ""], ["Dm7", 2, "m7"], ["G7", 7, "7"], ["C/G", 0, ""], ["Cm7-5", 0, "m7b5"],
    ["Csus4", 0, "sus4"], ["Cadd9", 0, ""], ["Faug", 5, "aug"],
  ];
  it.each(cases)("%s → %i %s", (name, root, quality) => {
    expect(parseChordSymbol(name)).toEqual({ root, quality });
  });
  it("N.C. などは null", () => {
    expect(parseChordSymbol("N.C.")).toBeNull();
    expect(parseChordSymbol("")).toBeNull();
  });
});

// 実 U-FRET 構造を模した最小フィクスチャ（[コード]＋歌詞・繰り返し）。
const FIXTURE = `<script>ufret_chord_datas = ${JSON.stringify([
  "[B]　[A#m]　[B]　[A#m]",
  "[B]歌詞[A#m]歌詞[B]あ[A#m]",
  "[G#m7]どこ",
])};</script>`;

describe("U-FRET 取込", () => {
  it("extractSongTitle：<title>から曲名（/ の前）", () => {
    expect(extractSongTitle("<title>プールサイド / NUMBER GIRL  ギターコード - U-FRET</title>")).toBe("プールサイド");
    expect(extractSongTitle("no title")).toBe("");
  });
  it("extractUfretLines：配列を取り出す", () => {
    expect(extractUfretLines(FIXTURE).length).toBe(3);
  });
  it("linesToChords：トークン抽出＋連続重複畳み", () => {
    const cs = linesToChords(extractUfretLines(FIXTURE));
    // B A#m B A#m | B A#m B A#m | G#m7 → 連続重複は無い（B/A#m交互）
    expect(cs.map((c) => `${c.root}:${c.quality}`).slice(0, 4)).toEqual(["11:", "10:m", "11:", "10:m"]);
  });
  it("extractLoops：繰り返しサイクルを単位化", () => {
    const cs = linesToChords(extractUfretLines(FIXTURE));
    const loops = extractLoops(cs);
    expect(loops.length).toBeGreaterThanOrEqual(1);
    expect(loops[0].map((c) => `${c.root}:${c.quality}`)).toEqual(["11:", "10:m"]); // [B,A#m] ループ
  });
  it("songToProgressions：C基準度数化＋タグ＋出典", () => {
    const meta = { artist: "テスト", song: "曲", url: "http://x", popular: true };
    const progs = songToProgressions(FIXTURE, meta);
    expect(progs.length).toBeGreaterThanOrEqual(1);
    const p = progs[0];
    expect(p.key).toBe(0); // C基準保存（neta.key=0・rootは度数）
    expect(p.meter).toBe("4/4");
    expect(p.content.chords.every((c) => c.root >= 0 && c.root < 12)).toBe(true);
    // timing＝一律2拍/コード（1拍ベタ並べを是正・U-FRETは実リズム持たない）
    expect(p.content.chords[0]).toMatchObject({ start: 0, dur: 2 });
    if (p.content.chords[1]) expect(p.content.chords[1]).toMatchObject({ start: 2, dur: 2 });
    // 移調しても相対関係は保つ：B→A#m の半音差(-1)が度数差にも保たれる
    expect(((p.content.chords[0].root - p.content.chords[1].root) % 12 + 12) % 12).toBe(1);
    expect(p.tags).toContain("テスト");
    expect(p.tags).toContain("定番");
    expect(p.content.source.url).toBe("http://x");
  });
});
