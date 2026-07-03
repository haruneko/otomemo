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
    it("コードチェンジに解決（後半は次コード G の voicing）", () => {
      const chords = [{ root: 0, quality: "", start: 0, dur: 2 }, { root: 7, quality: "", start: 2, dur: 2 }];
      const notes = resolveChordPattern(cp({ hits: [{ step: 0, dur: 8 }, { step: 8, dur: 8 }] }), chords, 0); // step8=2拍=G
      const atG = notes.filter((n) => n.start === 2).map((n) => ((n.pitch % 12) + 12) % 12).sort((a, b) => a - b);
      expect(atG).toEqual([2, 7, 11]); // G B D = pc 7,11,2
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
    it("セルタップ：頭=消す／伸び=長さ調整／末尾直後=1つ伸ばす／空き=新規（applyCellTap）", async () => {
      const { applyCellTap } = await import("../src/music");
      const hits = [{ step: 0, dur: 4 }]; // step0-3 を占有
      // 頭(0)＝消す
      expect(applyCellTap(hits, 0, 4)).toEqual({ hits: [], placed: false });
      // 伸びの上(2)＝終わりを2に＝dur 3（詰める）
      expect(applyCellTap(hits, 2, 4)).toEqual({ hits: [{ step: 0, dur: 3 }], placed: false });
      // 末尾直後(4=step+dur)＝1つ伸ばす＝dur 5
      expect(applyCellTap(hits, 4, 4)).toEqual({ hits: [{ step: 0, dur: 5 }], placed: false });
      // 離れた空き(8)＝新規配置（長さツール4）
      expect(applyCellTap(hits, 8, 4)).toEqual({ hits: [{ step: 0, dur: 4 }, { step: 8, dur: 4 }], placed: true });
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
