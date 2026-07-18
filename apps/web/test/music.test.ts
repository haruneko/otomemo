import { describe, it, expect, vi } from "vitest";
import { Midi } from "@tonejs/midi";
import {
  notesToMidi,
  tracksToMidi,
  notesOf,
  midiToNotes,
  transpose,
  chordToMidi,
  chordsToNotes,
  rhythmToNotes,
  notesForContent,
  band,
  resolveRelativeBass,
  resolveChordPattern,
  compositeNotes,
  scheduleTimes,
  totalSec,
  loopRange,
  barBeat,
  playEvent,
  type Note,
} from "../src/music";

describe("music", () => {
  it("encodes notes into parseable MIDI", () => {
    const notes: Note[] = [
      { pitch: 60, start: 0, dur: 1 },
      { pitch: 64, start: 1, dur: 2 },
    ];
    const bytes = notesToMidi(notes, 120);
    expect(bytes.length).toBeGreaterThan(0);
    const back = new Midi(bytes);
    expect(back.tracks[0]!.notes.length).toBe(2);
    expect(back.tracks[0]!.notes[0]!.midi).toBe(60);
  });

  it("round-trips notes through MIDI import", () => {
    const bytes = notesToMidi(
      [
        { pitch: 60, start: 0, dur: 1 },
        { pitch: 67, start: 2, dur: 0.5 },
      ],
      120,
    );
    const { notes } = midiToNotes(bytes);
    expect(notes.length).toBe(2);
    expect(notes[0]!.pitch).toBe(60);
    expect(notes[1]!.start).toBeCloseTo(2, 1);
  });

  it("transposes C-base notes by semitones (key offset)", () => {
    expect(transpose([{ pitch: 60, start: 0, dur: 1 }], 9)[0]!.pitch).toBe(69);
    expect(transpose([{ pitch: 60, start: 0, dur: 1 }], 0)[0]!.pitch).toBe(60);
  });

  it("expands a chord symbol to ascending midi notes (C-base)", () => {
    expect(chordToMidi("C")).toEqual([60, 64, 67]); // C E G at octave 4
    expect(chordToMidi("Am")).toEqual([69, 72, 76]); // A C E ascending
  });

  it("expands chords to overlapping notes at each start/dur", () => {
    const notes = chordsToNotes([{ root: 0, quality: "", start: 0, dur: 4 }]);
    expect(notes).toHaveLength(3);
    expect(notes.every((n) => n.start === 0 && n.dur === 4)).toBe(true);
  });

  it("renders tension chords from QUALITY_INTERVALS (C9 = C E G Bb D・pc正しい・テンションはオクターブ上)", () => {
    const notes = chordsToNotes([{ root: 0, quality: "9", start: 0, dur: 4 }]);
    expect(notes).toHaveLength(5); // R3579
    const pcs = notes.map((n) => ((n.pitch % 12) + 12) % 12).sort((a, b) => a - b);
    expect([...new Set(pcs)]).toEqual([0, 2, 4, 7, 10]); // C D E G Bb
    // 9th(D) はクラスタでなくオクターブ上に開く（最低Cより1オクターブ超上）
    const cs = notes.map((n) => n.pitch).sort((a, b) => a - b);
    expect(cs[cs.length - 1]! - cs[0]!).toBeGreaterThanOrEqual(12);
  });

  it("unknown quality falls back to major triad（後方互換）", () => {
    const notes = chordsToNotes([{ root: 0, quality: "zzz", start: 0, dur: 1 }]);
    expect(notes).toHaveLength(3);
  });

  it("分数コード（決定B）：C/E は最低音が E＝bass pc が一番下に追加される", () => {
    const plain = chordsToNotes([{ root: 0, quality: "", start: 0, dur: 4 }]);
    const slash = chordsToNotes([{ root: 0, quality: "", start: 0, dur: 4, bass: 4 }]); // C/E
    expect(slash.length).toBe(plain.length + 1); // bass 1音追加
    const low = slash.reduce((m, n) => (n.pitch < m.pitch ? n : m), slash[0]!);
    expect(((low.pitch % 12) + 12) % 12).toBe(4); // 最低音=E
    expect(low.pitch).toBeLessThan(Math.min(...plain.map((n) => n.pitch))); // コードより下
  });

  it("expands a rhythm lane's hits to drum notes (step/4 = beat)", () => {
    const notes = rhythmToNotes({ steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0, 4] }] });
    expect(notes).toEqual([
      { pitch: 36, start: 0, dur: 0.25, drum: true, vel: 115 },
      { pitch: 36, start: 1, dur: 0.25, drum: true, vel: 115 },
    ]);
  });

  it("#84 S4 hihat is quieter than kick by default velocity; lane.vel overrides", () => {
    const notes = rhythmToNotes({
      steps: 16,
      lanes: [
        { name: "Kick", midi: 36, hits: [0] },
        { name: "HiHat", midi: 42, hits: [0] },
        { name: "HiHat", midi: 42, hits: [2], vel: 90 }, // 明示vel が優先
      ],
    });
    const kick = notes.find((n) => n.pitch === 36)!;
    const hat = notes.find((n) => n.pitch === 42 && n.start === 0)!;
    const hatLoud = notes.find((n) => n.pitch === 42 && n.start === 0.5)!;
    expect(hat.vel).toBeLessThan(kick.vel!); // ハットは控えめ
    expect(hatLoud.vel).toBe(90); // lane.vel 指定が効く
  });

  it("#55 tracksToMidi makes one track per non-empty lane, drum on ch10", () => {
    const buf = tracksToMidi(
      [
        { name: "メロ", notes: [{ pitch: 60, start: 0, dur: 1 }] },
        { name: "リズム", notes: [{ pitch: 36, start: 0, dur: 0.25, drum: true }], drum: true },
        { name: "空", notes: [] }, // 空レーンは省かれる
      ],
      120,
      "4/4",
    );
    const midi = new Midi(buf);
    expect(midi.tracks.length).toBe(2);
    const drum = midi.tracks.find((t) => t.channel === 9);
    expect(drum).toBeTruthy();
    expect(drum!.notes[0]?.midi).toBe(36);
  });

  it("notesForContent dispatches by kind", () => {
    expect(notesForContent("melody", { notes: [{ pitch: 60, start: 0, dur: 1 }] })).toHaveLength(1);
    // #bass 絶対モードは melody と同型(notes)
    expect(notesForContent("bass", { notes: [{ pitch: 31, start: 0, dur: 1 }] })).toEqual([
      { pitch: 31, start: 0, dur: 1 },
    ]);
    expect(
      notesForContent("rhythm", { rhythm: { steps: 16, lanes: [{ name: "K", midi: 36, hits: [0] }] } }),
    ).toHaveLength(1);
    expect(notesForContent("lyric", null)).toEqual([]);
  });

  // #bass S2 相対モード：度数→コード解決（worker bass.py と同契約を web に移植）
  describe("relative bass (#bass S2)", () => {
    it("band places pc into E1..D#2 register", () => {
      expect(band(4)).toBe(28); // E → E1（床）
      expect(band(0)).toBe(36); // C → C2
      expect(band(7)).toBe(31); // G → G1
      expect(band(3)).toBe(39); // D# → D#2（上端）
      for (let pc = 0; pc < 12; pc++) {
        expect(band(pc)).toBeGreaterThanOrEqual(28);
        expect(band(pc)).toBeLessThanOrEqual(39);
      }
    });

    it("resolves R/5/8 on C tonic (no chords → key tonic)", () => {
      const notes = resolveRelativeBass(
        [
          { step: 0, degree: "R", dur: 1 },
          { step: 1, degree: "5", dur: 1 },
          { step: 2, degree: "8", dur: 1 },
        ],
        [],
        0,
      );
      expect(notes.map((n) => n.pitch)).toEqual([36, 43, 48]); // C2 / G2(root+7) / C3(root+12)
      // 1step=16分=0.25拍
      expect(notes[0]!.start).toBe(0);
      expect(notes[1]!.start).toBe(0.25);
    });

    it("resolves 3rd/7th from chord quality (G7)", () => {
      const notes = resolveRelativeBass(
        [
          { step: 0, degree: "R", dur: 1 },
          { step: 1, degree: "3", dur: 1 },
          { step: 2, degree: "7", dur: 1 },
        ],
        [{ root: 7, quality: "7", start: 0, dur: 4 }],
        0,
      );
      expect(notes.map((n) => n.pitch)).toEqual([31, 35, 41]); // G1 / B1(root+4) / F2(root+10) 度数はルートから上
    });

    it("minor 3rd is short third (Am → C)", () => {
      const notes = resolveRelativeBass([{ step: 0, degree: "3", dur: 1 }], [{ root: 9, quality: "m", start: 0, dur: 4 }], 0);
      expect(notes[0]!.pitch).toBe(band(0)); // C → 36
    });

    it("approach walks a half-step toward the next chord root", () => {
      const notes = resolveRelativeBass(
        [
          { step: 0, degree: "R", dur: 4 },
          { step: 4, degree: "approach", dur: 4 },
        ],
        [
          { root: 0, quality: "", start: 0, dur: 1 },
          { root: 7, quality: "", start: 2, dur: 2 }, // 次コード G → ルート band(7)=31
        ],
        0,
      );
      // 31±1（30/32）のうち直前音(36)に近い側＝32
      expect([30, 32]).toContain(notes[1]!.pitch);
    });

    it("never emits below the E1 floor (28)", () => {
      const notes = resolveRelativeBass([{ step: 0, degree: "R", dur: 1 }], [], 4); // E→28
      expect(notes.every((n) => n.pitch >= 28)).toBe(true);
    });

    it("つんのめり：裏拍始まりで次のダウンビートを跨ぐ音は、跨いだ先のコードで相対解決", () => {
      // 2拍裏(step10=2.5拍)から四分(4step=1拍)→3.5拍まで＝3拍目(G)を跨ぐ→Gルート基準。
      const chords = [
        { root: 0, quality: "", start: 0, dur: 3 }, // 0..3拍目前 = C
        { root: 7, quality: "", start: 3, dur: 1 }, // 3拍目 = G
      ];
      const anticip = resolveRelativeBass([{ step: 10, degree: "R", dur: 4 }], chords, 0);
      expect(anticip[0]!.pitch).toBe(band(7)); // G(31)＝跨いだ先のコードで解決（つんのめり）
      // 対照：拍頭(step8=2拍)始まりは始点のコード C のまま（つんのめらない）
      const onbeat = resolveRelativeBass([{ step: 8, degree: "R", dur: 4 }], chords, 0);
      expect(onbeat[0]!.pitch).toBe(band(0)); // C(36)
    });

    it("notesForContent resolves relative bass (single preview uses key tonic)", () => {
      const content = { mode: "relative", steps: 16, pattern: [{ step: 0, degree: "R", dur: 4 }] };
      expect(notesForContent("bass", content, { key: 0 })).toEqual([{ pitch: 36, start: 0, dur: 1 }]);
      // preview_chords があればそれで鳴らす
      const withChords = { ...content, preview_chords: [{ root: 7, quality: "", start: 0, dur: 4 }] };
      expect(notesForContent("bass", withChords)[0]!.pitch).toBe(31); // G1
    });

    it("compositeNotes resolves relative bass against the section chord lane", () => {
      const children = [
        {
          position: 0,
          node: { neta: { kind: "chord_progression", content: { chords: [{ root: 7, quality: "", start: 0, dur: 4 }] } } },
        },
        {
          position: 0,
          node: { neta: { kind: "bass", content: { mode: "relative", steps: 16, pattern: [{ step: 0, degree: "R", dur: 4 }] } } },
        },
      ];
      const notes = compositeNotes(children, 0);
      // section コードレーンの G に当たり band(7)=31（相対bassは移調しない＝解決済み実音高）
      expect(notes.find((n) => n.pitch === 31)).toBeTruthy();
    });

    it("compositeNotes carries per-part program (合成再生で音色を保つ)", () => {
      const children = [
        { position: 0, node: { neta: { kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }], program: 4 } } } },
        { position: 0, node: { neta: { kind: "bass", content: { notes: [{ pitch: 31, start: 0, dur: 1 }] } } } },
      ];
      const notes = compositeNotes(children, 0);
      // melody は content.program=4(エレピ)、bass は既定 33(フィンガーベース)
      expect(notes.find((n) => n.pitch === 60)?.program).toBe(4);
      expect(notes.find((n) => n.pitch === 31)?.program).toBe(33);
    });

    it("弱起(負start)の子は position より前に鳴り、拍0=position は保たれる（fb-4）", () => {
      const children = [
        { position: 4, node: { neta: { kind: "melody", content: { notes: [{ pitch: 67, start: -1, dur: 1 }, { pitch: 72, start: 0, dur: 1 }] } } } },
      ];
      const notes = compositeNotes(children, 0);
      expect(notes.find((n) => n.pitch === 67)!.start).toBe(3); // 弱起は position(4) の前＝3拍
      expect(notes.find((n) => n.pitch === 72)!.start).toBe(4); // ダウンビート＝position に保たれる
    });

    it("ネストした section を再帰合成する（#15・子の調＋位置オフセット）", () => {
      // 親 section(key=0) に サブ section(key=2) を position=4 で配置。サブは C基準メロ(pitch60)を持つ。
      const children = [
        {
          position: 4,
          node: {
            neta: { kind: "section", content: {}, key: 2 },
            children: [
              { position: 0, node: { neta: { kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } } } },
            ],
          },
        },
      ];
      const notes = compositeNotes(children, 0);
      // サブの調key=2でメロが+2移調(60→62)、親内 position=4 で start が+4
      expect(notes.length).toBe(1);
      expect(notes[0]!.pitch).toBe(62);
      expect(notes[0]!.start).toBe(4);
    });

    it("小節別リズム＝A@0/B@小節2/A@小節3 が ABA で鳴る（BがBBBに漏れない）", () => {
      const A = { neta: { kind: "rhythm", content: { rhythm: { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [0] }] } } } };
      const B = { neta: { kind: "rhythm", content: { rhythm: { steps: 16, lanes: [{ name: "Snare", midi: 38, hits: [0] }] } } } };
      const notes = compositeNotes(
        [
          { position: 0, node: A }, // 小節1（4/4・bpb=4）
          { position: 4, node: B }, // 小節2
          { position: 8, node: A }, // 小節3
        ],
        0,
      );
      // Kick(36)は 0拍と8拍、Snare(38)は 4拍だけ＝ABA。B が小節3以降に漏れない。
      expect(notes.filter((n) => n.pitch === 36).map((n) => n.start).sort((a, b) => a - b)).toEqual([0, 8]);
      expect(notes.filter((n) => n.pitch === 38).map((n) => n.start)).toEqual([4]);
    });
    it("① 進行トラックは無音の骨格＝自分は鳴らさず、コード楽器の解決文脈だけ提供する", () => {
      const prog = { position: 0, node: { neta: { kind: "chord_progression", content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }] } } } };
      // 進行だけ置いても音は出ない（骨格＝抽象・CP1）
      expect(compositeNotes([prog], 0)).toEqual([]);
      // 進行＋コード楽器 → 進行の骨格に解決してコード楽器だけ鳴る（進行の自前発音48は出力に無い）
      const withInstr = [
        prog,
        { position: 0, node: { neta: { kind: "chord_pattern", content: { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0 }, steps: 16, hits: [{ step: 0, dur: 16 }] } } } },
      ];
      const notes = compositeNotes(withInstr, 0);
      expect(notes.length).toBeGreaterThan(0);
      expect(notes.every((n) => n.program !== 48)).toBe(true); // 進行(GM49=48)は無音
      expect(notes.filter((n) => n.start === 0).map((n) => ((n.pitch % 12) + 12) % 12).sort((a, b) => a - b)).toEqual([0, 4, 7]); // C E G（コード楽器が解決）
    });
  });

  it("beatsPerBar：拍子→1小節の拍数（6/8=3・4/4=4・3/4=3・未指定=4／評価修正B）", async () => {
    const { beatsPerBar } = await import("../src/music");
    expect(beatsPerBar("4/4")).toBe(4);
    expect(beatsPerBar("6/8")).toBe(3);
    expect(beatsPerBar("3/4")).toBe(3);
    expect(beatsPerBar("2/2")).toBe(4);
    expect(beatsPerBar(null)).toBe(4);
    expect(beatsPerBar("garbage")).toBe(4);
  });
  it("notesOf extracts notes or empty", () => {
    expect(notesOf({ notes: [{ pitch: 60, start: 0, dur: 1 }] })).toHaveLength(1);
    expect(notesOf(null)).toEqual([]);
    expect(notesOf("x")).toEqual([]);
  });

  it("writes the GM program to the MIDI track (#47)", () => {
    const midi = new Midi(notesToMidi([{ pitch: 60, start: 0, dur: 1 }], 120, null, 24));
    expect(midi.tracks[0]!.instrument.number).toBe(24);
  });

  it("puts drums on channel 10 (#47)", () => {
    const midi = new Midi(notesToMidi([{ pitch: 36, start: 0, dur: 1, drum: true }], 120));
    expect(midi.tracks[0]!.channel).toBe(9);
  });

  // #57① Transport化：スケジュール時刻の純関数（音は鳴らさず算出だけ検証）
  describe("chord pattern (CP2・進行に解決する和音版)", () => {
    const cp = (over: Partial<import("../src/music").ChordPatternContent> = {}) => ({
      mode: "strum" as const, voicing: { tones: ["R", "3", "5"] as ("R" | "3" | "5" | "7")[], openClose: "close" as const, octave: 0 }, steps: 16, hits: [{ step: 0, dur: 8 }, { step: 8, dur: 8 }], ...over,
    });
    it("strum：各 hit でコードを voicing して和音ブロック（C→[48,52,55]）", () => {
      const notes = resolveChordPattern(cp(), [{ root: 0, quality: "", start: 0, dur: 4 }], 0);
      const atStart = notes.filter((n) => n.start === 0).map((n) => n.pitch).sort((a, b) => a - b);
      expect(atStart).toEqual([48, 52, 55]); // C E G（close・octave0）
      expect(notes.filter((n) => n.start === 0).every((n) => n.dur === 2)).toBe(true); // 次hit(step8=2拍)まで
    });
    it("#29 P2 ChordHit.vel 無し ⇒ 出力に vel キーが生えない（deepStrictEqual/形状一致）", () => {
      const notes = resolveChordPattern(cp(), [{ root: 0, quality: "", start: 0, dur: 4 }], 0);
      expect(notes.every((n) => !("vel" in n))).toBe(true);
    });
    it("#29 P2 strum：vel が全声部＋オンベースへ伝播", () => {
      const chords = [{ root: 0, quality: "", start: 0, dur: 4, bass: 7 }]; // C/G（オンベース）
      const notes = resolveChordPattern(cp({ hits: [{ step: 0, dur: 8, vel: 112 }] }), chords, 0);
      expect(notes.length).toBeGreaterThanOrEqual(4); // R,3,5 + オンベース
      expect(notes.every((n) => n.vel === 112)).toBe(true); // 声部もオンベースも同値
    });
    it("#29 P2 arp：vel が各 arp 音へ伝播", () => {
      const notes = resolveChordPattern(
        cp({ mode: "arp", hits: [{ step: 0, dur: 4, vel: 64 }, { step: 4, dur: 4 }] }),
        [{ root: 0, quality: "", start: 0, dur: 4 }],
        0,
      );
      expect(notes[0]!.vel).toBe(64); // vel 付き hit
      expect("vel" in notes[1]!).toBe(false); // vel 無し hit は素通し（キー無し）
    });
    it("レジスタ安定（決定C）：C進行とB進行のcompingが近接＝ルートで跳ねない", () => {
      const lowOf = (rootPc: number) => {
        const notes = resolveChordPattern(cp({ hits: [{ step: 0, dur: 8 }] }), [{ root: rootPc, quality: "", start: 0, dur: 4 }], 0);
        return Math.min(...notes.map((n) => n.pitch));
      };
      const cLow = lowOf(0); // C
      const bLow = lowOf(11); // B（旧実装だと 48→59 で11半音跳ねた）
      expect(Math.abs(bLow - cLow)).toBeLessThanOrEqual(6); // アンカー最寄り＝近接
    });
    it("octave で大体の高さがシフト（+1 で約1オクターブ上）", () => {
      const low = (oct: number) => Math.min(...resolveChordPattern(cp({ voicing: { tones: ["R", "3", "5"], openClose: "close", octave: oct } }), [{ root: 0, quality: "", start: 0, dur: 4 }], 0).map((n) => n.pitch));
      expect(low(1) - low(0)).toBe(12);
    });
    it("arp：構成音を1つずつ巡回（各 hit 1音）", () => {
      const notes = resolveChordPattern(cp({ mode: "arp", hits: [{ step: 0, dur: 4 }, { step: 4, dur: 4 }, { step: 8, dur: 4 }] }), [{ root: 0, quality: "", start: 0, dur: 4 }], 0);
      expect(notes.length).toBe(3); // 3 hit = 3音
      expect(notes.map((n) => n.pitch)).toEqual([48, 52, 55]); // R,3,5 を巡回
    });
    it("arp駆け上がり幅：arpOctaves=3 で voiced を下方へ3oct積み増し＝複数オクターブを駆け上がる（ハープ・2026-07-13）", () => {
      const hits = Array.from({ length: 9 }, (_, i) => ({ step: i * 2, dur: 2 }));
      const notes = resolveChordPattern(cp({ mode: "arp", steps: 32, voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, arpDir: "up", arpOctaves: 3 }, hits }), [{ root: 0, quality: "", start: 0, dur: 8 }], 0);
      // voiced=[48,52,55] を下方へ [36,40,43]・[24,28,31] と積み増し→昇順プールを up で辿る。
      expect(notes.map((n) => n.pitch)).toEqual([24, 28, 31, 36, 40, 43, 48, 52, 55]);
      expect(Math.max(...notes.map((n) => n.pitch)) - Math.min(...notes.map((n) => n.pitch))).toBeGreaterThanOrEqual(24); // ≥2oct span
    });
    it("arp区切り：arpReset=1.5拍ごとに低音(pool頭)から駆け上がり直す（前半/後半で同じ上昇を反復・2026-07-13）", () => {
      // pool=voiced(C close=[48,52,55])を2oct下方拡張=[36,40,43,48,52,55]。1step=0.25拍ゆえ step6=1.5拍で区切り。
      const hits = [0, 2, 4, 6, 8, 10].map((step) => ({ step, dur: 2 })); // 0/0.5/1.0拍 ｜ 1.5/2.0/2.5拍
      const v = { tones: ["R", "3", "5"] as ("R" | "3" | "5" | "7")[], openClose: "close" as const, octave: 0, arpDir: "up" as const, arpOctaves: 2 };
      const withReset = resolveChordPattern(cp({ mode: "arp", steps: 16, voicing: { ...v, arpReset: 1.5 }, hits }), [{ root: 0, quality: "", start: 0, dur: 8 }], 0);
      expect(withReset.map((n) => n.pitch)).toEqual([36, 40, 43, 36, 40, 43]); // 各1.5拍窓が pool 頭から
      const noReset = resolveChordPattern(cp({ mode: "arp", steps: 16, voicing: v, hits }), [{ root: 0, quality: "", start: 0, dur: 8 }], 0);
      expect(noReset.map((n) => n.pitch)).toEqual([36, 40, 43, 48, 52, 55]); // 既定=区切りなし=連続で登り続ける(bit一致)
    });
    it("arp駆け上がり幅：既定(undefined)=1oct＝従来の voiced 巡回のまま＝bit一致（天井=topも不変）", () => {
      const hits = Array.from({ length: 3 }, (_, i) => ({ step: i * 2, dur: 2 }));
      const base = cp({ mode: "arp", steps: 32, voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, arpDir: "up" }, hits });
      const def = resolveChordPattern(base, [{ root: 0, quality: "", start: 0, dur: 8 }], 0);
      const one = resolveChordPattern(cp({ ...base, voicing: { ...base.voicing, arpOctaves: 1 } }), [{ root: 0, quality: "", start: 0, dur: 8 }], 0);
      expect(def.map((n) => n.pitch)).toEqual([48, 52, 55]); // 従来と同一
      expect(one.map((n) => n.pitch)).toEqual(def.map((n) => n.pitch)); // arpOctaves=1 も同一
      // 天井（最高音）は幅を広げても top 側で不変＝「トップは絶対の磁石」を保つ（下へ伸ばす設計）。
      const wide = resolveChordPattern(cp({ ...base, voicing: { ...base.voicing, arpOctaves: 4 }, hits: Array.from({ length: 12 }, (_, i) => ({ step: i * 2, dur: 2 })) }), [{ root: 0, quality: "", start: 0, dur: 8 }], 0);
      expect(Math.max(...wide.map((n) => n.pitch))).toBe(Math.max(...def.map((n) => n.pitch)));
    });
    it("コードチェンジに解決（後半は次コード G の voicing）", () => {
      const chords = [{ root: 0, quality: "", start: 0, dur: 2 }, { root: 7, quality: "", start: 2, dur: 2 }];
      const notes = resolveChordPattern(cp({ hits: [{ step: 0, dur: 8 }, { step: 8, dur: 8 }] }), chords, 0); // step8=2拍=G
      const atG = notes.filter((n) => n.start === 2).map((n) => ((n.pitch % 12) + 12) % 12).sort((a, b) => a - b);
      expect(atG).toEqual([2, 7, 11]); // G B D = pc 7,11,2
    });
    it("アンティシペーション：ダウンビートを跨ぐ食い(裏拍)は次コードを先取り（bass と同ロジック・2026-07-10 オーナーFB）", () => {
      // C(0-4拍) → G(4-8拍)。step14=3.5拍(裏)で dur4step=1拍＝4拍目を跨ぐ ⇒ そのコードは"次のG"を先取り。
      const chords = [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }];
      const synced = resolveChordPattern(cp({ steps: 32, hits: [{ step: 14, dur: 4 }] }), chords, 0);
      const pcs = synced.filter((n) => Math.abs(n.start - 3.5) < 1e-6).map((n) => ((n.pitch % 12) + 12) % 12).sort((a, b) => a - b);
      expect(pcs).toEqual([2, 7, 11]); // 3.5拍の食いは G(先取り)＝pc 7,11,2（旧: C=0,4,7 のまま鳴っていた）
      // ジャスト（跨がない）音は従来どおり start のコード＝C
      const just = resolveChordPattern(cp({ steps: 32, hits: [{ step: 8, dur: 4 }] }), chords, 0); // step8=2拍・1拍ぶん＝4拍跨がない
      const justPcs = just.filter((n) => Math.abs(n.start - 2) < 1e-6).map((n) => ((n.pitch % 12) + 12) % 12).sort((a, b) => a - b);
      expect(justPcs).toEqual([0, 4, 7]); // 2拍はまだ C（先取りしない）
    });
    it("合成(CP5)：section の進行に解決して鳴る（chord_progression→chord_pattern）", () => {
      const children = [
        { position: 0, node: { neta: { kind: "chord_progression", content: { chords: [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }] } } } },
        { position: 0, node: { neta: { kind: "chord_pattern", content: { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0 }, steps: 32, hits: [{ step: 0, dur: 16 }, { step: 16, dur: 16 }] } } } },
      ];
      const notes = compositeNotes(children, 0);
      const at0 = notes.filter((n) => n.start === 0 && n.program === 0).map((n) => ((n.pitch % 12) + 12) % 12).sort((a, b) => a - b);
      const at4 = notes.filter((n) => n.start === 4 && n.program === 0).map((n) => ((n.pitch % 12) + 12) % 12).sort((a, b) => a - b);
      expect(at0).toEqual([0, 4, 7]); // C E G
      expect(at4).toEqual([2, 7, 11]); // step16=4拍=G → G B D
    });
    it("トップ狙い音(絶対)：C→F→G でコンピングのトップが一定レジスタに保たれる（voice leading）", () => {
      const play = (root: number) =>
        resolveChordPattern(
          { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 67 }, steps: 16, hits: [{ step: 0, dur: 4 }] },
          [{ root, quality: "", start: 0, dur: 4 }],
          0,
        );
      const topOf = (root: number) => Math.max(...play(root).map((n) => n.pitch));
      const c = topOf(0), f = topOf(5), g = topOf(7);
      // 狙い 67(G4) の周り＝完全4度窓に収まる＝音域が跳ねない
      for (const t of [c, f, g]) {
        expect(t).toBeGreaterThanOrEqual(64);
        expect(t).toBeLessThanOrEqual(69);
      }
      expect(c).toBe(67); // C は G4 がトップ（一番近いコードトーン）
    });
    it("トップ狙い音は絶対＝調(コード)が変わってもトップ音域は動かない", () => {
      const topOf = (root: number) =>
        Math.max(
          ...resolveChordPattern(
            { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 67 }, steps: 16, hits: [{ step: 0, dur: 4 }] },
            [{ root, quality: "", start: 0, dur: 4 }],
            0,
          ).map((n) => n.pitch),
        );
      // E♭(root3) でも A(root9) でもトップは 67 付近＝絶対の磁石（相対なら上へズレる）
      for (const root of [3, 9, 10]) {
        const t = topOf(root);
        expect(t).toBeGreaterThanOrEqual(64);
        expect(t).toBeLessThanOrEqual(69);
      }
    });
    it("top 未指定は従来の anchor ベース（後退なし）", () => {
      const notes = resolveChordPattern(
        { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0 }, steps: 16, hits: [{ step: 0, dur: 4 }] },
        [{ root: 0, quality: "", start: 0, dur: 4 }],
        0,
      );
      expect(notes.filter((n) => n.start === 0).map((n) => n.pitch).sort((a, b) => a - b)).toEqual([48, 52, 55]); // C E G（従来通り）
    });
    it("構成音は自動＝top指定時はコードの質から全トーン（maj7 は7thも鳴る／手選択不要）", () => {
      const notes = resolveChordPattern(
        { mode: "strum", voicing: { tones: [], openClose: "close", octave: 0, top: 72 }, steps: 16, hits: [{ step: 0, dur: 4 }] },
        [{ root: 0, quality: "maj7", start: 0, dur: 4 }],
        0,
      );
      const pcs = new Set(notes.map((n) => ((n.pitch % 12) + 12) % 12));
      expect(pcs).toEqual(new Set([0, 4, 7, 11])); // C E G B（7thが自動で入る）
    });
    it("パワーコード＝R+5 の2音だけ（3rd を落とす・唯一の間引き）", () => {
      const at0 = resolveChordPattern(
        { mode: "strum", voicing: { tones: [], openClose: "close", octave: 0, top: 67, powerChord: true }, steps: 16, hits: [{ step: 0, dur: 4 }] },
        [{ root: 0, quality: "", start: 0, dur: 4 }],
        0,
      ).filter((n) => n.start === 0);
      expect(at0.length).toBe(2);
      expect(new Set(at0.map((n) => ((n.pitch % 12) + 12) % 12))).toEqual(new Set([0, 7])); // C G（E=3rd 無し）
    });
    it("アルペジオ向き：up と down で辿る順が逆（音域は voicing 継承）", () => {
      const play = (dir: "up" | "down") =>
        resolveChordPattern(
          { mode: "arp", voicing: { tones: [], openClose: "close", octave: 0, top: 72, arpDir: dir }, steps: 16, hits: [{ step: 0, dur: 2 }, { step: 2, dur: 2 }, { step: 4, dur: 2 }] },
          [{ root: 0, quality: "", start: 0, dur: 12 }],
          0,
        ).map((n) => n.pitch);
      const up = play("up"), down = play("down");
      expect(up[0]! < up[2]!).toBe(true); // 昇順で辿る
      expect(down[0]! > down[2]!).toBe(true); // 降順で辿る
      expect(up.slice().reverse()).toEqual(down); // 完全に逆順
    });
    it("セルタップ：頭=消す／伸びの上=長さ調整／末尾直後や空き=新規（applyCellTap）", async () => {
      const { applyCellTap } = await import("../src/music");
      const hits = [{ step: 0, dur: 4 }]; // step0-3 を占有
      expect(applyCellTap(hits, 0, 4)).toEqual({ hits: [], placed: false }); // 頭=消す
      expect(applyCellTap(hits, 2, 4)).toEqual({ hits: [{ step: 0, dur: 3 }], placed: false }); // 伸びの上(2)=dur 3に詰める
      // 末尾の直後(4=step+dur)は"空き"＝新規配置できる（隣接した音を打てる／伸ばしと衝突しない）
      expect(applyCellTap(hits, 4, 1)).toEqual({ hits: [{ step: 0, dur: 4 }, { step: 4, dur: 1 }], placed: true });
    });
    it("打ち込みテスト：x--- x--x .x-. x---（x=打点/-=伸ばし/.=休符）が1小節で組める", async () => {
      const { applyCellTap } = await import("../src/music");
      // x=length を選んで打点、- は自動の伸び、. は置かない。長さ: x---=4, x--=3(付点8分), 単x=1, x-=2。
      const taps: [number, number][] = [
        [0, 4], // x---（step0, dur4）
        [4, 3], // x--（step4, dur3＝付点8分）
        [7, 1], // x（step7, dur1）← 前の音の直後だが"新規"で置ける（旧・伸ばし食いバグの回帰防止）
        [9, 2], // .x-（step9, dur2／step8は休符=置かない）
        [12, 4], // x---（step12, dur4）
      ];
      let hits: { step: number; dur: number }[] = [];
      for (const [s, len] of taps) hits = applyCellTap(hits, s, len).hits;
      expect(hits).toEqual([
        { step: 0, dur: 4 },
        { step: 4, dur: 3 },
        { step: 7, dur: 1 },
        { step: 9, dur: 2 },
        { step: 12, dur: 4 },
      ]);
    });
    it("open は構成音を1つおきに広げる（close と異なる）", () => {
      const close = resolveChordPattern(cp(), [{ root: 0, quality: "", start: 0, dur: 4 }], 0).filter((n) => n.start === 0).map((n) => n.pitch);
      const open = resolveChordPattern(cp({ voicing: { tones: ["R", "3", "5"], openClose: "open", octave: 0 } }), [{ root: 0, quality: "", start: 0, dur: 4 }], 0).filter((n) => n.start === 0).map((n) => n.pitch).sort((a, b) => a - b);
      expect(open).not.toEqual(close.sort((a, b) => a - b)); // 広げる＝別配置
    });
  });

  describe("playback scheduling (#57)", () => {
    it("maps beats to Transport seconds (beat=quarter=1.0, spb=60/bpm)", () => {
      const ev = scheduleTimes([{ pitch: 60, start: 2, dur: 1, vel: 64 }], 120);
      expect(ev[0]!.time).toBeCloseTo(1.0); // 2拍 * 0.5s
      expect(ev[0]!.voice).toBe("poly");
      expect(ev[0]!.durSec).toBeCloseTo(0.5); // 1拍 * 0.5s
      expect(ev[0]!.vel).toBeCloseTo(64 / 127);
    });

    it("routes drums to membrane(<=41)/noise with fixed durations", () => {
      const ev = scheduleTimes(
        [
          { pitch: 36, start: 0, dur: 1, drum: true }, // kick
          { pitch: 42, start: 1, dur: 1, drum: true }, // hat
        ],
        120,
      );
      expect(ev[0]).toMatchObject({ voice: "membrane", durSec: 0.15 });
      expect(ev[1]).toMatchObject({ voice: "noise", durSec: 0.05 });
    });

    it("defaults velocity to 100/127 when missing", () => {
      expect(scheduleTimes([{ pitch: 60, start: 0, dur: 1 }], 120)[0]!.vel).toBeCloseTo(100 / 127);
    });

    it("#20 S6: carries the lens mark from Note to ScheduledNote (melodic and drum)", () => {
      const mel = scheduleTimes([{ pitch: 60, start: 0, dur: 1, lens: "fold" }], 120);
      expect(mel[0]!.lens).toBe("fold");
      const drum = scheduleTimes([{ pitch: 36, start: 0, dur: 1, drum: true, lens: "real" }], 120);
      expect(drum[0]!.lens).toBe("real");
      // lens 未指定は undefined（従来経路＝レンズ層を作らない）
      expect(scheduleTimes([{ pitch: 60, start: 0, dur: 1 }], 120)[0]!.lens).toBeUndefined();
    });

    it("totalSec ends past the last note; drums add their sound tail (ショット最後の打を切らない)", () => {
      expect(totalSec([{ pitch: 60, start: 0, dur: 2 }], 120)).toBeCloseTo(1.0); // 2拍*0.5
      // ドラムは start だけだと最後の打が発火前に止まる→発音長(膜0.15)を尾に足す
      expect(totalSec([{ pitch: 36, start: 4, dur: 1, drum: true }], 120)).toBeCloseTo(2.0 + 0.15);
      // ハット等(noise系 pitch>41)は 0.05
      expect(totalSec([{ pitch: 42, start: 4, dur: 1, drum: true }], 120)).toBeCloseTo(2.0 + 0.05);
    });

    it("loopRange defaults to 0..total, honors explicit beats", () => {
      const notes = [{ pitch: 60, start: 0, dur: 4 }];
      expect(loopRange(notes, 120)).toEqual({ start: 0, end: 2.0 });
      expect(loopRange(notes, 120, { startBeat: 2, endBeat: 6 })).toEqual({ start: 1.0, end: 3.0 });
    });

    it("barBeat formats beat as bar:beat (1始まり, 拍子で割る) (#59)", () => {
      expect(barBeat(0, 4)).toBe("1:1");
      expect(barBeat(3, 4)).toBe("1:4");
      expect(barBeat(4, 4)).toBe("2:1");
      expect(barBeat(7.5, 4)).toBe("2:4"); // 小数拍は切り捨て
      expect(barBeat(3, 3)).toBe("2:1"); // 3/4
      expect(barBeat(-1, 4)).toBe("1:1"); // 負はclamp
    });
  });

  // #55a SF2分岐：旋律はSF2があればそれ、無ければシンセ。ドラムは常にキット。
  describe("playEvent SF2 routing (#55a)", () => {
    const Tone = {
      Frequency: (p: number) => ({ toFrequency: () => p, toNote: () => `n${p}` }),
    };
    const mkKit = () => ({
      poly: { triggerAttackRelease: vi.fn() },
      membrane: { triggerAttackRelease: vi.fn() },
      noise: { triggerAttackRelease: vi.fn() },
    });

    it("melodic note uses SF2 (absolute time, vel 0..127) when loaded", () => {
      const kit = mkKit();
      const sf = { start: vi.fn() };
      playEvent({ time: 0, durSec: 0.5, voice: "poly", pitch: 60, vel: 0.5 }, 1.0, sf, kit, Tone);
      expect(sf.start).toHaveBeenCalledWith({ note: 60, time: 1.0, duration: 0.5, velocity: 64 });
      expect(kit.poly.triggerAttackRelease).not.toHaveBeenCalled();
    });

    it("melodic note falls back to poly synth without SF2", () => {
      const kit = mkKit();
      playEvent({ time: 0, durSec: 0.5, voice: "poly", pitch: 60, vel: 0.5 }, 1.0, null, kit, Tone);
      expect(kit.poly.triggerAttackRelease).toHaveBeenCalled();
    });

    it("drums fall back to the simple kit when no SF2 drum sampler matches", () => {
      const kit = mkKit();
      const sf = { start: vi.fn() };
      playEvent({ time: 0, durSec: 0.15, voice: "membrane", pitch: 36, vel: 0.8 }, 0, sf, kit, Tone);
      playEvent({ time: 0, durSec: 0.05, voice: "noise", pitch: 42, vel: 0.8 }, 0, sf, kit, Tone);
      expect(kit.membrane.triggerAttackRelease).toHaveBeenCalled();
      expect(kit.noise.triggerAttackRelease).toHaveBeenCalled();
      expect(sf.start).not.toHaveBeenCalled();
    });

    it("#55b/#84 drums use the matched SF2 drum sampler at note＋detune when available", () => {
      const kit = mkKit();
      const kick = { start: vi.fn() };
      // kick(36)→sampler note38＋detune0。snare(38)は未マッチ→簡易キット。
      const drumKits = new Map([[36, { sampler: kick, note: 38, detune: 0 }]]);
      playEvent({ time: 0, durSec: 0.15, voice: "membrane", pitch: 36, vel: 0.8 }, 2, null, kit, Tone, drumKits);
      playEvent({ time: 0, durSec: 0.05, voice: "noise", pitch: 38, vel: 0.8 }, 3, null, kit, Tone, drumKits);
      // 打楽器はワンショット＝loop:false＋ピッチ補正 detune
      expect(kick.start).toHaveBeenCalledWith({ note: 38, time: 2, velocity: 102, loop: false, detune: 0 });
      expect(kit.membrane.triggerAttackRelease).not.toHaveBeenCalled(); // kickはSF2へ
      expect(kit.noise.triggerAttackRelease).toHaveBeenCalled(); // snareは簡易へ
    });

    it("drumDetune compensates originalPitch→root (#84 S2)", async () => {
      const { drumDetune } = await import("../src/music");
      expect(drumDetune(60, 42)).toBe(1800); // HH閉: 60→42 で +1800cents → 実効0
      expect(drumDetune(60, 46)).toBe(1400); // HH開
      expect(drumDetune(60, 60)).toBe(0); // override無し（kick/snareは現状維持）
      expect(drumDetune(60, 53, 11, -46)).toBe(700 + 1100 - 46); // coarse/fineTune加味
    });
  });

  describe("drumNameFor (#55b GM番号→楽器名)", () => {
    const names = [
      "Concert Bass Drum",
      "Jazz Snare 1",
      "Orchestra Hi-Hats",
      "Brushed Toms_1",
      "Orchestral Ride",
      "Grand Piano",
    ];
    it("maps kick/snare/hihat/tom/ride to drum-like instrument names", async () => {
      const { drumNameFor } = await import("../src/music");
      expect(drumNameFor(36, names)).toBe("Concert Bass Drum");
      expect(drumNameFor(38, names)).toBe("Jazz Snare 1");
      expect(drumNameFor(42, names)).toBe("Orchestra Hi-Hats");
      expect(drumNameFor(45, names)).toBe("Brushed Toms_1");
      expect(drumNameFor(51, names)).toBe("Orchestral Ride");
    });
    it("returns null when nothing matches", async () => {
      const { drumNameFor } = await import("../src/music");
      expect(drumNameFor(36, ["Grand Piano", "Violin"])).toBeNull();
    });
  });
});

describe("♪仮歌（Section）＝vocalMelodyFromComposite / muteMelodyForVocal", () => {
  it("compositeNotes の**メロ声部だけ**を抽出し、複数配置/隙間/小節オフセットを絶対拍で連結する", async () => {
    const { compositeNotes, vocalMelodyFromComposite } = await import("../src/music");
    // メロを2箇所（position 0 と 4）に配置＋ベース＝連結は compositeNotes が担う（二重実装しない）。
    const children = [
      { position: 0, node: { neta: { kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1, syllable: "そ" }, { pitch: 62, start: 2, dur: 1, syllable: "ら" }] } } } },
      { position: 4, node: { neta: { kind: "melody", content: { notes: [{ pitch: 64, start: 0, dur: 1, syllable: "み" }] } } } },
      { position: 0, node: { neta: { kind: "bass", content: { notes: [{ pitch: 36, start: 0, dur: 4 }] } } } },
    ];
    const v = vocalMelodyFromComposite(compositeNotes(children, 0));
    // ベースは除外＝3音（メロのみ）。start は絶対拍（2つ目の配置は +4）。隙間（1〜2拍）は保たれる。
    expect(v.notes.map((n) => n.start)).toEqual([0, 2, 4]);
    expect(v.notes.map((n) => n.syllable)).toEqual(["そ", "ら", "み"]);
    expect(v.notes.some((n) => n.pitch === 36)).toBe(false); // bass は入らない
    expect(v.hasLyric).toBe(true);
    expect(v.minStartBeat).toBe(0); // 初音0拍
  });

  it("弱起（負start）はクランプせず保持し、minStartBeat は初音（負）＝再生 offset で楽器と揃える（旧v1クランプ撤去）", async () => {
    const { vocalMelodyFromComposite } = await import("../src/music");
    const composite = [
      { part: "melody" as const, pitch: 67, start: -0.5, dur: 0.25, syllable: "し" }, // 弱起（負start）＝潰さず保持
      { part: "melody" as const, pitch: 68, start: -0.25, dur: 0.25, syllable: "ず" }, // 弱起2つ目
      { part: "melody" as const, pitch: 72, start: 0, dur: 0.5, syllable: "み" }, // ダウンビート
    ];
    const v = vocalMelodyFromComposite(composite);
    expect(v.notes.map((n) => n.start)).toEqual([-0.5, -0.25, 0]); // 負start をそのまま保持（輪郭破壊なし）
    expect(v.notes.map((n) => n.dur)).toEqual([0.25, 0.25, 0.5]); // dur も保持（0.05へ潰さない）
    expect(v.minStartBeat).toBe(-0.5); // 初音＝弱起の頭（負）
  });

  it("初音が後方の時 minStartBeat は初音の拍（先頭休符/オフセットは再生側 vocalSourceSchedule が扱う）", async () => {
    const { vocalMelodyFromComposite } = await import("../src/music");
    const composite = [{ part: "melody" as const, pitch: 60, start: 8, dur: 1, syllable: "サ" }];
    expect(vocalMelodyFromComposite(composite).minStartBeat).toBe(8);
  });

  it("歌詞が1つも無ければ hasLyric=false（ボタン disabled の判定）", async () => {
    const { vocalMelodyFromComposite } = await import("../src/music");
    const composite = [
      { part: "melody" as const, pitch: 60, start: 0, dur: 1 },
      { part: "melody" as const, pitch: 62, start: 1, dur: 1, syllable: "  " }, // 空白のみ＝歌詞なし扱い
    ];
    expect(vocalMelodyFromComposite(composite).hasLyric).toBe(false);
  });

  it("singOf＝content.sing.enabled が true の時だけ設定を返す（未設定/false＝undefined＝従来楽器）", async () => {
    const { singOf } = await import("../src/music");
    expect(singOf({ notes: [], program: 73 })).toBeUndefined(); // sing 無し＝従来楽器
    expect(singOf({ sing: { enabled: false } })).toBeUndefined(); // false＝歌わない
    expect(singOf({ sing: { enabled: true } })).toEqual({ enabled: true });
    expect(singOf({ sing: { enabled: true, speaker: 3009 } })).toEqual({ enabled: true, speaker: 3009 });
    expect(singOf(null)).toBeUndefined();
  });

  it("muteMelodyForVocal はメロ声部だけ落とし、伴奏(counter/chord/bass/drums)は保つ", async () => {
    const { muteMelodyForVocal } = await import("../src/music");
    const notes = [
      { part: "melody" as const, pitch: 60, start: 0, dur: 1 },
      { part: "counter" as const, pitch: 64, start: 0, dur: 1 },
      { part: "chord" as const, pitch: 48, start: 0, dur: 1 },
      { part: "bass" as const, pitch: 36, start: 0, dur: 1 },
      { part: "drums" as const, pitch: 38, start: 0, dur: 1, drum: true },
    ];
    const out = muteMelodyForVocal(notes);
    expect(out.some((n) => n.part === "melody")).toBe(false);
    expect(out.map((n) => n.part)).toEqual(["counter", "chord", "bass", "drums"]);
  });
});
