import { describe, it, expect } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { midiToNeta } from "../src/ingest-midi";

// S6-b：MIDI→library melody。合成MIDI（ch0に順次旋律10音）で取り込みを検証。
function seqMidi(pitches: number[], division = 96): Uint8Array {
  const trk: number[] = [];
  for (const p of pitches) {
    trk.push(0, 0x90, p, 64); // delta0 note on
    trk.push(48, 0x80, p, 64); // delta48(半拍) note off
  }
  trk.push(0, 0xff, 0x2f, 0x00);
  const len = trk.length;
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (division >> 8) & 0xff, division & 0xff,
    0x4d, 0x54, 0x72, 0x6b, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff,
    ...trk,
  ]);
}

describe("midiToNeta（MIDI→library melody）", () => {
  it("順次旋律→ library melody（Cへ正規化・style タグ）", () => {
    const core = new Core(openDb(":memory:"));
    // D メジャー上の順次旋律（D E F# G A B…）→ 正規化で C 起点へ
    // D メジャー（C#=73 を含め調を一意に）の順次旋律 → 主音正規化で C 起点へ
    const input = midiToNeta(seqMidi([62, 64, 66, 67, 69, 71, 73, 71, 69, 67]), "Falcom Test", "game")!;
    expect(input).toBeTruthy();
    expect(input.kind).toBe("melody");
    expect(input.scope).toBe("library");
    expect(input.tags).toContain("game");
    const n = core.createNeta(input);
    const notes = (core.getNeta(n.id)!.content as { notes: { pitch: number }[] }).notes;
    expect(notes.length).toBe(10);
    expect(notes[0]!.pitch).toBe(60); // D(62) を主音正規化→ C(60)
  });

  it("短すぎ（<8音）は null", () => {
    expect(midiToNeta(seqMidi([60, 62, 64]), "x", "game")).toBeNull();
  });

  it("音域広すぎ（旋律でない）は null", () => {
    // 1.5oct超を跳ね回る＝伴奏/誤抽出扱いで除外
    expect(midiToNeta(seqMidi([48, 84, 50, 86, 52, 88, 54, 90, 56, 92]), "x", "game")).toBeNull();
  });
});
