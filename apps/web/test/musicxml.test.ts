import { describe, it, expect } from "vitest";
import { parseMusicXml } from "../src/musicxml";

// 最小 MusicXML：4/4・divisions=1。C4(全音符は割愛) → C4四分・D4四分・休符四分・E4+G4(和音)四分。
const XML = `<?xml version="1.0"?>
<score-partwise>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><rest/><duration>1</duration></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration></note>
    </measure>
  </part>
</score-partwise>`;

describe("musicxml import (#56)", () => {
  it("parses pitches, beats, rests, and chords", () => {
    const notes = parseMusicXml(XML);
    // C4=60 @0, D4=62 @1, (休符@2は無し), E4=64 @3, G4=67 @3(和音=同start)
    expect(notes.map((n) => [n.pitch, n.start, n.dur])).toEqual([
      [60, 0, 1],
      [62, 1, 1],
      [64, 3, 1],
      [67, 3, 1],
    ]);
  });

  it("applies alter (sharp/flat)", () => {
    const xml = `<score-partwise><part id="P1"><measure>
      <attributes><divisions>2</divisions></attributes>
      <note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration></note>
    </measure></part></score-partwise>`;
    const notes = parseMusicXml(xml);
    expect(notes[0]?.pitch).toBe(61); // C#4
    expect(notes[0]?.dur).toBe(1); // duration2 / divisions2 = 1拍
  });
});
