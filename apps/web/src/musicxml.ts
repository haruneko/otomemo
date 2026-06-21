// #56 楽譜入力：MusicXML を C基準のノート列へ。最初の part（旋律）を対象に v1。
// <divisions>=四分音符あたりtick。<chord/> は直前と同時発音（startを進めない）。<rest/> は時間だけ進める。
import type { Note } from "./music";

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MusicXML 文字列 → Note[]（pitch=実音MIDI, start/dur=拍）。最初の part のみ。 */
export function parseMusicXml(xml: string): Note[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("MusicXML の解析に失敗しました");
  const part = doc.querySelector("part");
  if (!part) return [];
  const notes: Note[] = [];
  let divisions = 1; // 四分音符あたり tick（measure ごとに変わりうる）
  let t = 0; // 現在時刻（拍）
  let prevStart = 0; // 直近の非chordノートの開始（chordはここに重ねる）
  for (const measure of Array.from(part.querySelectorAll("measure"))) {
    const div = measure.querySelector("attributes > divisions");
    if (div?.textContent) divisions = parseInt(div.textContent) || divisions;
    for (const note of Array.from(measure.querySelectorAll("note"))) {
      const durTicks = parseInt(note.querySelector("duration")?.textContent ?? "0") || 0;
      const durBeats = durTicks / divisions;
      const isChord = note.querySelector("chord") !== null;
      const isRest = note.querySelector("rest") !== null;
      const start = isChord ? prevStart : t;
      if (!isRest) {
        const step = note.querySelector("pitch > step")?.textContent ?? "C";
        const octave = parseInt(note.querySelector("pitch > octave")?.textContent ?? "4");
        const alter = parseInt(note.querySelector("pitch > alter")?.textContent ?? "0") || 0;
        const pitch = (octave + 1) * 12 + (STEP[step] ?? 0) + alter;
        if (durBeats > 0) notes.push({ pitch, start, dur: durBeats });
      }
      if (!isChord) {
        prevStart = t;
        t += durBeats;
      }
    }
  }
  return notes;
}
