import { describe, it, expect } from "vitest";
import { parseChordSymbol } from "../src/music/chordname";
import { extractUfretLines, linesToChords, extractLoops, songToProgressions, extractSongTitle } from "../src/ingest-ufret";

describe("parseChordSymbol（コード名→root/quality）", () => {
  const cases: [string, number, string][] = [
    ["B", 11, ""], ["A#m", 10, "m"], ["G#m7", 8, "m7"], ["Emaj7", 4, "maj7"],
    ["C", 0, ""], ["Dm7", 2, "m7"], ["G7", 7, "7"], ["Cm7-5", 0, "m7b5"],
    ["Csus4", 0, "sus4"], ["Cadd9", 0, ""], ["Faug", 5, "aug"],
  ];
  it.each(cases)("%s → %i %s", (name, root, quality) => {
    expect(parseChordSymbol(name)).toEqual({ root, quality });
  });
  it("N.C. などは null", () => {
    expect(parseChordSymbol("N.C.")).toBeNull();
    expect(parseChordSymbol("")).toBeNull();
  });

  it("H1: マイナーメジャー7th（CmM7/Cmmaj7/Cm(maj7)）→ mM7＝メジャー化しない（監査: maj7に誤縮約）", () => {
    expect(parseChordSymbol("CmM7")).toEqual({ root: 0, quality: "mM7" });
    expect(parseChordSymbol("Cmmaj7")).toEqual({ root: 0, quality: "mM7" });
    expect(parseChordSymbol("Am(maj7)")).toEqual({ root: 9, quality: "mM7" });
  });
  it("H2: フルディミニッシュ（Cdim7/C°7）→ dim7＝減7音を落とさない（監査: dim三和音へ縮約）", () => {
    expect(parseChordSymbol("Cdim7")).toEqual({ root: 0, quality: "dim7" });
    expect(parseChordSymbol("C°7")).toEqual({ root: 0, quality: "dim7" });
  });
  it("C3: hdim7/hdim（平文の half-diminished）→ m7b5＝ø 系（旧: /dim7/ 先勝ちで dim7 へ誤縮約）", () => {
    expect(parseChordSymbol("Bhdim7")).toEqual({ root: 11, quality: "m7b5" });
    expect(parseChordSymbol("Chdim")).toEqual({ root: 0, quality: "m7b5" });
    // 通常の dim7 は退行しない（減7音を保持）
    expect(parseChordSymbol("Bdim7")).toEqual({ root: 11, quality: "dim7" });
  });
  it("H3: o/+ の過剰マッチ解消＝C7+5はaug7・素のoだけがdim（監査: 任意のo/+が誤爆）", () => {
    expect(parseChordSymbol("C7+5")).toEqual({ root: 0, quality: "aug7" });
    expect(parseChordSymbol("C7#5")).toEqual({ root: 0, quality: "aug7" });
    expect(parseChordSymbol("Co")).toEqual({ root: 0, quality: "dim" });
    expect(parseChordSymbol("Co7")).toEqual({ root: 0, quality: "dim7" });
  });
  it("M7: 分数コード＝ベースを捨てず bass に保持（C/E・ConE 両表記）", () => {
    expect(parseChordSymbol("C/E")).toEqual({ root: 0, quality: "", bass: 4 });
    expect(parseChordSymbol("ConE")).toEqual({ root: 0, quality: "", bass: 4 });
    expect(parseChordSymbol("A/C#")).toEqual({ root: 9, quality: "", bass: 1 });
    expect(parseChordSymbol("C/G")).toEqual({ root: 0, quality: "", bass: 7 });
    expect(parseChordSymbol("Am7/G")).toEqual({ root: 9, quality: "m7", bass: 7 });
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
  it("奇数コード(3)は最後を4拍に伸ばし小節境界へ（2+2+4=8）", () => {
    const odd = `<script>ufret_chord_datas = ${JSON.stringify(["[C]　[F]　[G]　[C]　[F]　[G]"])};</script>`;
    const progs = songToProgressions(odd, { artist: "t", song: "s", url: "u" });
    const cs = progs[0].content.chords;
    expect(cs.length).toBe(3);
    expect(cs.map((c) => c.dur)).toEqual([2, 2, 4]);
    expect(cs.map((c) => c.start)).toEqual([0, 2, 4]);
  });
  it("songToProgressions：C基準度数化＋タグ＋出典", () => {
    const meta = { artist: "テスト", song: "曲", url: "http://x", popular: true };
    const progs = songToProgressions(FIXTURE, meta);
    expect(progs.length).toBeGreaterThanOrEqual(1);
    const p = progs[0];
    expect(p.key).toBe(0); // C基準保存（neta.key=0・rootは度数）
    expect(p.meter).toBe("4/4");
    expect(p.content.chords.every((c) => c.root >= 0 && c.root < 12)).toBe(true);
    // timing＝2拍/コード（1拍ベタ並べを是正）。奇数個なら最後を4拍に伸ばし小節境界へ着地。
    expect(p.content.chords[0]).toMatchObject({ start: 0, dur: 2 });
    const cs = p.content.chords;
    const total = cs.reduce((s, c) => s + c.dur, 0);
    expect(total % 4).toBe(0); // 合計が小節(4拍)の倍数
    if (cs.length % 2 === 1) expect(cs[cs.length - 1].dur).toBe(4); // 奇数→末尾4拍
    // 移調しても相対関係は保つ：B→A#m の半音差(-1)が度数差にも保たれる
    expect(((p.content.chords[0].root - p.content.chords[1].root) % 12 + 12) % 12).toBe(1);
    expect(p.tags).toContain("テスト");
    expect(p.tags).toContain("定番");
    expect(p.content.source.url).toBe("http://x");
  });
});

import { analyzeProgressionFromUfret } from "../src/ingest-ufret";
describe("L13: fetchedToLibraryInput（fetch_chords→連想コーパスへの複製・ingestと同一規約）", () => {
  it("C正規化・key=0・scope=library・取込タグ＝find_progressionsに見える形", async () => {
    const { fetchedToLibraryInput } = await import("../src/ingest-ufret");
    const prog = {
      chords: [
        { root: 7, quality: "", start: 0, dur: 2 }, { root: 0, quality: "", start: 2, dur: 2 },
        { root: 2, quality: "", start: 4, dur: 2 }, { root: 7, quality: "", start: 6, dur: 2 },
      ], // G-C-D-G＝GのI-IV-V-I
      key: 7,
      mode: "major" as const,
    };
    const input = fetchedToLibraryInput(prog, "テスト曲", "https://example.com/x");
    expect(input.scope).toBe("library");
    expect(input.key).toBe(0);
    expect(input.tags).toContain("取込");
    // C正規化＝G(7)始まりが 0 始まりに
    const cs = (input.content as { chords: { root: number }[] }).chords;
    expect(cs[0]!.root).toBe(0);
    expect(cs[1]!.root).toBe(5);
    expect(cs[2]!.root).toBe(7);
  });
});

describe("analyzeProgressionFromUfret（サイト取得＝実キーの進行・アナリーゼ用）", () => {
  it("U-FRET html → 実音のコード進行（C基準にしない）＋キー検出", () => {
    const html = `<script>ufret_chord_datas = ${JSON.stringify([
      "[A]あ[E]い[F#m]う[D]え",
      "[A]お[E]か[F#m]き[D]く",
    ])};</script>`;
    const p = analyzeProgressionFromUfret(html)!;
    expect(p).not.toBeNull();
    // A E F#m D（I-V-vi-IV in A）＝実音のまま（root は絶対pc）
    expect(p.chords.map((c) => `${c.root}:${c.quality}`)).toEqual(["9:", "4:", "6:m", "2:"]);
    expect(p.chords[1]!.start).toBe(2); // CHORD_BEATS=2
    expect(p.key).toBe(9); // A（C基準の0でなく実キー）
    expect(p.mode).toBe("major");
  });
  it("コード譜が取れなければ null", () => {
    expect(analyzeProgressionFromUfret("<html>no chords here</html>")).toBeNull();
  });
  it("自明な2和音バンプでなく**最長ループ**を主要進行に採る（Lemon 実データの露呈を回帰）", () => {
    const html = `<script>ufret_chord_datas = ${JSON.stringify([
      "[E]あ[B]い[E]う[B]え",
      "[G#m]さ[F#]し[E]す[B]せ[G#m]た[F#]ち[E]つ[B]て",
    ])};</script>`;
    const p = analyzeProgressionFromUfret(html)!;
    expect(p.chords.map((c) => `${c.root}:${c.quality}`)).toEqual(["8:m", "6:", "4:", "11:"]); // G#m F# E B
  });
});
