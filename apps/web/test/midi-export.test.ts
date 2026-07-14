import { describe, it, expect } from "vitest";
import { Midi } from "@tonejs/midi";
import { notesToMidi, tracksToMidi, trackProgramOf, prerollOffsetBeats, clampNegativeStarts } from "../src/music";

describe("MIDI出力の正しさ検証", () => {
  it("単一トラック：テンポ・拍子ヘッダ・音符の秒時刻・velocity（4/4）", () => {
    const notes = [
      { pitch: 60, start: 0, dur: 1, vel: 100 },
      { pitch: 64, start: 2, dur: 0.5, vel: 80 },
      { pitch: 67, start: 3, dur: 1 },
    ];
    const m = new Midi(notesToMidi(notes, 120, "4/4", 4).buffer as ArrayBuffer);
    expect(Math.round(m.header.tempos[0]!.bpm)).toBe(120);
    expect(m.header.timeSignatures[0]!.timeSignature).toEqual([4, 4]);
    const t = m.tracks[0]!;
    expect(t.instrument.number).toBe(4); // program (エレピ)
    const spb = 0.5; // 60/120
    expect(t.notes.length).toBe(3);
    expect(t.notes[0]!.midi).toBe(60);
    expect(t.notes[0]!.time).toBeCloseTo(0 * spb, 5);
    expect(t.notes[1]!.time).toBeCloseTo(2 * spb, 5); // start=2拍→1.0秒
    expect(t.notes[1]!.duration).toBeCloseTo(0.5 * spb, 5);
    expect(Math.round(t.notes[1]!.velocity * 127)).toBe(80);
    expect(t.notes[2]!.duration).toBeCloseTo(1 * spb, 5);
  });

  it("6/8：拍子ヘッダ[6,8]・音符時刻は秒絶対（拍子で不変）", () => {
    const notes = [{ pitch: 60, start: 0, dur: 3 }, { pitch: 62, start: 3, dur: 3 }];
    const m = new Midi(notesToMidi(notes, 100, "6/8").buffer as ArrayBuffer);
    expect(m.header.timeSignatures[0]!.timeSignature).toEqual([6, 8]);
    expect(Math.round(m.header.tempos[0]!.bpm)).toBe(100);
    const spb = 60 / 100;
    expect(m.tracks[0]!.notes[1]!.time).toBeCloseTo(3 * spb, 5); // 3拍=1.8秒
  });

  it("ドラム：ch10(=channel 9)＋kitがprogram", () => {
    const notes = [
      { pitch: 36, start: 0, dur: 0.25, drum: true, kit: 0 },
      { pitch: 38, start: 1, dur: 0.25, drum: true, kit: 0 },
    ];
    const m = new Midi(notesToMidi(notes, 120, "4/4").buffer as ArrayBuffer);
    expect(m.tracks[0]!.channel).toBe(9); // GM ch10
    expect(m.tracks[0]!.notes.map((n) => n.midi)).toEqual([36, 38]);
  });

  it("合成：ドラムとピッチ楽器が混在したら別トラックに分離（ピッチは非ch9・ドラムはch10）", () => {
    // 監査 SG-04：以前は1音でも drum があるとトラック全体を ch9 固定し、メロ/ベースがドラム音源で鳴った。
    const notes = [
      { pitch: 60, start: 0, dur: 1 }, // メロ
      { pitch: 64, start: 1, dur: 1 }, // メロ
      { pitch: 36, start: 0, dur: 0.25, drum: true, kit: 0 }, // キック
      { pitch: 38, start: 1, dur: 0.25, drum: true, kit: 0 }, // スネア
    ];
    const m = new Midi(notesToMidi(notes, 120, "4/4", 4).buffer as ArrayBuffer);
    expect(m.tracks.length).toBe(2); // ピッチ＋ドラムの2トラック
    const pitched = m.tracks.find((t) => t.channel !== 9)!;
    const drum = m.tracks.find((t) => t.channel === 9)!;
    expect(pitched.notes.map((n) => n.midi)).toEqual([60, 64]); // ピッチ楽器は非ch9
    expect(pitched.instrument.number).toBe(4); // program 反映
    expect(drum.notes.map((n) => n.midi)).toEqual([36, 38]); // ドラムは ch10
  });

  it("多トラック：レーン別にトラック分け＋名前＋program、ドラムのみch10、空レーンは省く", () => {
    const tracks = [
      { name: "Melody", program: 0, notes: [{ pitch: 72, start: 0, dur: 1 }] },
      { name: "Bass", program: 33, notes: [{ pitch: 40, start: 0, dur: 2 }] },
      { name: "Drums", drum: true, kit: 0, notes: [{ pitch: 36, start: 0, dur: 0.25, drum: true }] },
      { name: "Empty", notes: [] }, // 省かれる
    ];
    const m = new Midi(tracksToMidi(tracks, 120, "4/4").buffer as ArrayBuffer);
    expect(m.tracks.length).toBe(3); // 空レーン省略
    expect(m.tracks.map((t) => t.name)).toEqual(["Melody", "Bass", "Drums"]) // ASCII＝文字化けしない;
    expect(m.tracks[0]!.instrument.number).toBe(0);
    expect(m.tracks[1]!.instrument.number).toBe(33);
    expect(m.tracks[0]!.channel).not.toBe(9); // メロは非ドラム
    expect(m.tracks[2]!.channel).toBe(9); // リズムだけch10
  });

  // バグ#1修正（機能E2E監査 2026-07-13）：セクション分割書き出しが per-note program（compositeNotes 付与の
  // GM音色）をトラックに載せず全 program 0 になっていた＝コード楽器2(ハープ46)がピアノで出る。laneTracks が
  // 各レーンの composite notes から program を採る（trackProgramOf）ように是正。ここは採取ロジック＋保持を固定。
  describe("バグ#1：セクション分割書き出しが per-note program を保持（ハープ46 が失われない）", () => {
    it("trackProgramOf＝レーンの composite notes から最初の program を採る（drum は除外＝呼び出し側）", () => {
      expect(trackProgramOf([{ pitch: 60, start: 0, dur: 1, program: 46 }])).toBe(46);
      expect(trackProgramOf([{ pitch: 60, start: 0, dur: 1, program: 0 }, { pitch: 64, start: 1, dur: 1, program: 0 }])).toBe(0);
      expect(trackProgramOf([{ pitch: 60, start: 0, dur: 1 }])).toBeUndefined(); // program 無し＝undefined（track.program 未設定＝従来）
    });
    it("laneTracks 相当：piano(0)/harp(46) の2コード楽器レーン→MIDI が別 program で出る", () => {
      // laneTracks が composite notes（各ノートに program 付与）から trackProgramOf で採る流儀を再現。
      const keys1 = [{ pitch: 60, start: 0, dur: 1, program: 0 }]; // コード楽器1＝ピアノ
      const keys2 = [{ pitch: 67, start: 0, dur: 1, program: 46 }]; // コード楽器2＝ハープ
      const tracks = [
        { name: "Keys 1", notes: keys1, program: trackProgramOf(keys1) },
        { name: "Keys 2", notes: keys2, program: trackProgramOf(keys2) },
      ];
      const m = new Midi(tracksToMidi(tracks, 120, "6/8").buffer as ArrayBuffer);
      expect(m.tracks.map((t) => t.instrument.number)).toEqual([0, 46]); // 0=ピアノ / 46=ハープ（潰れない）
    });
  });
});

// 弱起（負start）ノートの書き出しプリロール（実機監査 2026-07-15・オーナー方針）：弱起メロを section の
// bar0(position 0)に置くと負start が残り、@tonejs/midi が負tick で throw → DL 無言失敗。書き出し境界で
// 全ノートを**小節単位に切り上げたオフセット**だけ後ろへシフト（-0.5拍→+1小節/-5拍→+2小節）＝DAW 小節整合。
// シフトでほぼ全 start>=0 になるが、想定外の残り負は clampNegativeStarts で t=0 保険。合成側は不変。
describe("弱起（負start）の書き出しプリロール：小節単位シフト", () => {
  it("prerollOffsetBeats：小節単位の切り上げ（4/4=bpb4／6/8=bpb3・境界ちょうどは足さない）", () => {
    expect(prerollOffsetBeats(-0.5, 4)).toBe(4); // -0.5拍 → +1小節
    expect(prerollOffsetBeats(-5, 4)).toBe(8); // -5拍 → +2小節
    expect(prerollOffsetBeats(-4, 4)).toBe(4); // ちょうど1小節ぶん→+1小節（余分な2小節にしない）
    expect(prerollOffsetBeats(-0.5, 3)).toBe(3); // 6/8：-0.5拍 → +1小節(3拍)
    expect(prerollOffsetBeats(-5, 3)).toBe(6); // 6/8：-5拍 → +2小節(6拍)
    expect(prerollOffsetBeats(0, 4)).toBe(0); // 負start無し＝シフト無し
    expect(prerollOffsetBeats(2, 4)).toBe(0);
  });

  it("notesToMidi：負start があっても throw せず、全イベント time>=0", () => {
    const notes = [
      { pitch: 60, start: -0.5, dur: 1 }, // 弱起（0 をまたぐ）
      { pitch: 64, start: 1, dur: 1 },
    ];
    let bytes!: Uint8Array;
    expect(() => { bytes = notesToMidi(notes, 120, "4/4", 0); }).not.toThrow();
    const m = new Midi(bytes.buffer as ArrayBuffer);
    for (const t of m.tracks) for (const n of t.notes) expect(n.time).toBeGreaterThanOrEqual(0);
  });

  it("notesToMidi：弱起は +1小節ぶん後ろへシフト＝元の拍位置+オフセットで小節整合（dur 不変）", () => {
    const spb = 60 / 120;
    const notes = [
      { pitch: 60, start: -0.5, dur: 1 }, // 弱起
      { pitch: 64, start: 1, dur: 1 },
    ];
    const m = new Midi(notesToMidi(notes, 120, "4/4", 0).buffer as ArrayBuffer);
    const ns = m.tracks[0]!.notes;
    // 4/4・minStart=-0.5 → offset=+4拍。全ノートが元の拍位置 +4 へ。
    expect(ns[0]!.time).toBeCloseTo((-0.5 + 4) * spb, 4); // 弱起は前小節の裏（3.5拍）に居る＝小節線保持
    expect(ns[0]!.duration).toBeCloseTo(1 * spb, 4); // dur は縮まない（シフトのみ）
    expect(ns[1]!.time).toBeCloseTo((1 + 4) * spb, 4); // 相対関係も保持（5拍）
  });

  it("notesToMidi：-5拍の深い弱起は +2小節（4/4）／6/8 は +1小節=3拍でシフト", () => {
    const spb = 60 / 120;
    const deep = [{ pitch: 48, start: -5, dur: 1 }];
    const m = new Midi(notesToMidi(deep, 120, "4/4", 0).buffer as ArrayBuffer);
    expect(m.tracks[0]!.notes[0]!.time).toBeCloseTo((-5 + 8) * spb, 4); // +2小節=8拍 → 3拍
    // 6/8（bpb=3）：-0.5拍 → +1小節=3拍
    const m68 = new Midi(notesToMidi([{ pitch: 60, start: -0.5, dur: 1 }], 120, "6/8").buffer as ArrayBuffer);
    expect(m68.tracks[0]!.notes[0]!.time).toBeCloseTo((-0.5 + 3) * spb, 4);
  });

  it("notesToMidi：シフトぶんループマーカーも後ろへ（startBar/endBar に +offsetBars）", () => {
    // 4/4・弱起 -0.5拍 → offset=+4拍=+1小節。loop {startBar:0,endBar:8} → {1,9}。
    const notes = [{ pitch: 60, start: -0.5, dur: 1 }];
    const m = new Midi(notesToMidi(notes, 120, "4/4", 0, null, { startBar: 0, endBar: 8 }).buffer as ArrayBuffer);
    const markers = m.header.meta.filter((e) => e.type === "marker");
    expect(markers.find((e) => e.text === "LOOPSTART")!.ticks).toBe(1 * 4 * m.header.ppq); // startBar0→1
    expect(markers.find((e) => e.text === "LOOPEND")!.ticks).toBe(9 * 4 * m.header.ppq); // endBar8→9
  });

  it("tracksToMidi（分割書出）：全トラック共通オフセットで揃ってシフト＝縦がズレない", () => {
    const spb = 60 / 120;
    const tracks = [
      { name: "Melody", program: 0, notes: [{ pitch: 72, start: -0.25, dur: 0.5 }, { pitch: 74, start: 1, dur: 1 }] },
      { name: "Bass", program: 33, notes: [{ pitch: 40, start: 0, dur: 1 }] }, // 負なし。共通 offset で一緒に動く
    ];
    let bytes!: Uint8Array;
    expect(() => { bytes = tracksToMidi(tracks, 120, "4/4"); }).not.toThrow();
    const m = new Midi(bytes.buffer as ArrayBuffer);
    for (const t of m.tracks) for (const n of t.notes) expect(n.time).toBeGreaterThanOrEqual(0);
    // 全トラック横断の minStart=-0.25 → offset=+4拍（1小節）。両トラックとも +4 へ。
    const mel = m.tracks.find((t) => t.name === "Melody")!;
    const bass = m.tracks.find((t) => t.name === "Bass")!;
    expect(mel.notes[0]!.time).toBeCloseTo((-0.25 + 4) * spb, 4); // 弱起は前小節の裏
    expect(bass.notes[0]!.time).toBeCloseTo((0 + 4) * spb, 4); // ベースも同じ +4＝縦の相対関係を保持
  });

  it("正常notes（全 start>=0）はシフト非介入＝従来出力と bit 一致", () => {
    const notes = [{ pitch: 60, start: 0, dur: 1 }, { pitch: 64, start: 2, dur: 0.5, vel: 80 }];
    // シフト導入後も、負start が無ければ offset=0＝同一バイト列（回帰なし）。基準は同一入力の再エンコード。
    const a = notesToMidi(notes, 120, "4/4", 4);
    const b = notesToMidi([...notes], 120, "4/4", 4);
    expect(Array.from(a)).toEqual(Array.from(b));
    const tr = [{ name: "M", program: 0, notes }];
    const ta = tracksToMidi(tr, 120, "4/4");
    const tb = tracksToMidi([{ name: "M", program: 0, notes: [...notes] }], 120, "4/4");
    expect(Array.from(ta)).toEqual(Array.from(tb));
  });
});

// 再生の弱起丸め（Task1b）：Tone.Transport は負時刻イベントを発火しないので、playNotes 入口で負start を
// t=0 へ丸めて鳴らす（＝書き出し保険と同じ clampNegativeStarts）。この純関数規則を単体で固定する。
describe("clampNegativeStarts：再生入口/書き出し保険の丸め規則", () => {
  it("0 をまたぐ弱起は t=0・end(start+dur)を保って dur を縮める", () => {
    const out = clampNegativeStarts([{ pitch: 60, start: -0.5, dur: 1 }]); // end=0.5拍
    expect(out).toEqual([{ pitch: 60, start: 0, dur: 0.5 }]);
  });
  it("end<=0（完全に0より前）は落とす／端は min dur 0.05・正常 start>=0 は同一参照で素通し", () => {
    const keep = { pitch: 62, start: 2, dur: 1 };
    const out = clampNegativeStarts([
      { pitch: 48, start: -2, dur: 1 }, // end=-1 → 落ちる
      { pitch: 61, start: -0.02, dur: 0.02 }, // end=0 → 落ちる（end<=0）
      { pitch: 63, start: -0.01, dur: 0.03 }, // end=0.02>0 → 残る・dur min0.05
      keep, // start>=0 は素通し（同一参照）
    ]);
    expect(out.map((n) => n.pitch)).toEqual([63, 62]);
    expect(out[0]!.dur).toBeCloseTo(0.05, 6); // min dur
    expect(out[1]).toBe(keep); // 参照そのまま（bit一致の担保）
  });
  it("負start が無ければ全て同一参照で素通し", () => {
    const notes = [{ pitch: 60, start: 0, dur: 1 }, { pitch: 64, start: 1, dur: 1 }];
    const out = clampNegativeStarts(notes);
    expect(out[0]).toBe(notes[0]);
    expect(out[1]).toBe(notes[1]);
  });
});

import { feelOf, isCompoundMeter } from "../src/music";
describe("フィール層＝書き出し境界で applyFeel（スイング・非破壊）", () => {
  const spb = 60 / 120;
  it("feel なし＝ストレート（8分裏 x.5 のまま）", () => {
    const notes = [{ pitch: 60, start: 0, dur: 0.5 }, { pitch: 62, start: 0.5, dur: 0.5 }];
    const m = new Midi(notesToMidi(notes, 120, "4/4").buffer as ArrayBuffer);
    const times = m.tracks[0]!.notes.map((n) => n.time);
    expect(times[1]).toBeCloseTo(0.5 * spb, 4); // 0.5拍のまま
  });
  it("feel.swing=1＝8分裏が 2/3 拍へ跳ねる（notes 自体は不変・書き出し時のみ）", () => {
    const notes = [{ pitch: 60, start: 0, dur: 0.5 }, { pitch: 62, start: 0.5, dur: 0.5 }];
    const m = new Midi(notesToMidi(notes, 120, "4/4", 0, { swing: 1 }).buffer as ArrayBuffer);
    const times = m.tracks[0]!.notes.map((n) => n.time);
    expect(times[1]).toBeCloseTo((2 / 3) * spb, 3); // 0.5→2/3 に跳ねる
    expect(notes[1]!.start).toBe(0.5); // 入力 notes は不変（純関数・SSOTストレート維持）
  });
  it("6/8（compound）＝スイングskip（書き出しストレート）", () => {
    const notes = [{ pitch: 60, start: 0.5, dur: 0.5 }];
    const m = new Midi(notesToMidi(notes, 120, "6/8", 0, { swing: 1 }).buffer as ArrayBuffer);
    expect(m.tracks[0]!.notes[0]!.time).toBeCloseTo(0.5 * spb, 4);
  });
  it("feelOf＝content.feel を読む／isCompoundMeter", () => {
    expect(feelOf({ notes: [], feel: { swing: 0.6 } })).toEqual({ swing: 0.6 });
    expect(feelOf({ notes: [] })).toBeUndefined();
    expect(isCompoundMeter("6/8")).toBe(true);
    expect(isCompoundMeter("4/4")).toBe(false);
  });

  // WP-X2 ゲームBGMループマーカー（marker メタ 0xFF 0x06＝LOOPSTART/LOOPEND）。
  const hasBytes = (buf: Uint8Array, seq: number[]): boolean => {
    for (let i = 0; i + seq.length <= buf.length; i++) {
      let ok = true;
      for (let k = 0; k < seq.length; k++) if (buf[i + k] !== seq[k]) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  };
  // "LOOPSTART" の ASCII 前置＝marker イベント本体（0xFF 0x06 <len> "LOOPSTART"）を素バイトで探す。
  const LOOPSTART_BYTES = [0xff, 0x06, 9, ...[..."LOOPSTART"].map((c) => c.charCodeAt(0))];

  it("loop 未指定＝マーカー無し・bit一致（明示 undefined と同一バイト）", () => {
    const notes = [{ pitch: 60, start: 0, dur: 1 }];
    const a = notesToMidi(notes, 120, "4/4", 0);
    const b = notesToMidi(notes, 120, "4/4", 0, null, undefined); // loop 明示 undefined
    expect(Array.from(a)).toEqual(Array.from(b)); // 既存出力と bit 一致
    expect(hasBytes(a, [0xff, 0x06])).toBe(false); // marker メタが1つも無い
    const m = new Midi(a.buffer as ArrayBuffer);
    expect(m.header.meta.filter((e) => e.type === "marker").length).toBe(0);
  });

  it("loop 指定＝LOOPSTART/LOOPEND marker が正しい tick に載る（4/4・ppq480）", () => {
    const notes = [{ pitch: 60, start: 0, dur: 1 }];
    const bytes = notesToMidi(notes, 120, "4/4", 0, null, { startBar: 0, endBar: 8 });
    expect(hasBytes(bytes, LOOPSTART_BYTES)).toBe(true); // 生バイトに marker(0xFF06)+"LOOPSTART"
    const m = new Midi(bytes.buffer as ArrayBuffer);
    const markers = m.header.meta.filter((e) => e.type === "marker");
    const start = markers.find((e) => e.text === "LOOPSTART")!;
    const end = markers.find((e) => e.text === "LOOPEND")!;
    expect(start.ticks).toBe(0); // startBar0 → 0 tick
    expect(end.ticks).toBe(8 * 4 * m.header.ppq); // endBar8 × 4拍 × 480
  });

  it("6/8：LOOPEND tick は beatsPerBar=3 で換算＋tailBars で LOOPTAILEND", () => {
    const bytes = tracksToMidi([{ notes: [{ pitch: 60, start: 0, dur: 1 }] }], 120, "6/8", null, { startBar: 0, endBar: 4, tailBars: 1 });
    const m = new Midi(bytes.buffer as ArrayBuffer);
    const markers = m.header.meta.filter((e) => e.type === "marker");
    expect(markers.find((e) => e.text === "LOOPEND")!.ticks).toBe(4 * 3 * m.header.ppq); // 6/8=1小節3拍(四分換算)
    expect(markers.find((e) => e.text === "LOOPTAILEND")!.ticks).toBe(5 * 3 * m.header.ppq); // endBar+tailBars=5小節
  });

  it("多トラック（分割書出）＝loop 未指定はマーカー無しで bit一致", () => {
    const tracks = [{ notes: [{ pitch: 60, start: 0, dur: 1 }], name: "melody" }];
    const a = tracksToMidi(tracks, 120, "4/4");
    const b = tracksToMidi(tracks, 120, "4/4", null, undefined);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(hasBytes(a, [0xff, 0x06])).toBe(false);
  });
});
