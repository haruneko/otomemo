// MIDI(SMF) → library melody 取り込み（S6-b コーパス・ゲーム音楽/Falcom）。
// 流れ：parseMidi → leadChannelMelody(リード抽出) → 品質ゲート → detectKey→normalizeToC → createNeta(library, style)。
// 著作権：Falcom 等は「使用OK・MIDI再配布NG」。本取り込みはエッセンス/抽象(度数列)を手元で作るのみ＝MIDIは再配布しない。
import type { Core } from "./core";
import type { NetaInput } from "./types";
import { parseMidi, leadChannelMelody, skylineMelody, notesOfTrackNamed } from "./music/midi";
import { detectKeyFromNotes } from "./music";
import { normalizeToC } from "./music/melodyEssence";

// 1 MIDI → library 投入用 NetaInput。Cへ正規化。
// opts.track 指定時＝そのラベル付きtrack(POP909 "MELODY"等)を信頼して抽出（品質ゲート不要）。
// 無指定＝lead ch 推定＋旋律らしさの品質ゲート（Falcom 等の多声アレンジ向け）。
export function midiToNeta(buf: Uint8Array, title: string, style: string, opts?: { track?: string }): NetaInput | null {
  const parsed = parseMidi(buf);
  let mel: { pitch: number; start: number; dur: number }[];
  if (opts?.track) {
    const tn = notesOfTrackNamed(parsed, opts.track);
    if (tn.length < 8) return null;
    mel = skylineMelody(tn); // 信頼track＝偶発重なりだけ skyline で潰す
  } else {
    mel = leadChannelMelody(parsed.notes, parsed.programs);
    if (mel.length < 8) return null;
    const ps = mel.map((n) => n.pitch);
    const range = Math.max(...ps) - Math.min(...ps);
    const iv = ps.slice(1).map((p, i) => Math.abs(p - ps[i]!));
    const step = iv.length ? iv.filter((d) => d <= 2).length / iv.length : 0;
    if (range > 26 || step < 0.25) return null; // 旋律らしくない抽出（伴奏/アルペジオ誤選択）は除外
  }
  if (mel.length < 8) return null;
  const k = detectKeyFromNotes(mel);
  const notesC = normalizeToC(mel, k.key);
  return { kind: "melody", title, content: { notes: notesC }, scope: "library", tags: ["取込", style] };
}
