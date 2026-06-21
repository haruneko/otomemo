// #56 音声入力（ハミング→音高）。自己相関(ACF)でピッチ検出→音高列→ノート分割。
// 検出/分割は純関数でテスト可能（合成正弦波で検証）。マイク捕獲だけが副作用。
import type { Note } from "./music";

/** 1フレームの基本周波数(Hz)を自己相関で推定。無音/非周期は null。 */
export function detectPitchHz(buf: Float32Array, sampleRate: number): number | null {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i]! * buf[i]!;
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return null; // 無音ゲート

  const MAX = Math.floor(SIZE / 2);
  let bestOffset = -1;
  let bestCorr = 0;
  let foundGoodCorrelation = false;
  let lastCorr = 1;
  for (let offset = 8; offset < MAX; offset++) {
    let corr = 0;
    for (let i = 0; i < MAX; i++) corr += buf[i]! * buf[i + offset]!;
    corr /= MAX;
    if (corr > 0.9 * bestCorr && corr > lastCorr) {
      foundGoodCorrelation = true;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestOffset = offset;
      }
    } else if (foundGoodCorrelation) {
      break; // 最初のピークを過ぎたら確定
    }
    lastCorr = corr;
  }
  if (bestOffset <= 0 || bestCorr < 0.01) return null;
  return sampleRate / bestOffset;
}

/** Hz → 最寄りMIDIノート番号。0Hz以下は null。 */
export function hzToMidi(hz: number): number | null {
  if (hz <= 0) return null;
  return Math.round(69 + 12 * Math.log2(hz / 440));
}

/** (time秒, midi|null) フレーム列 → ノート列。連続する同一MIDIを1音にまとめ、null/変化で区切る。
 * frameDur=1フレームの秒数、bpm で拍へ換算、minBeat 未満の音は捨てる（チャタリング除去）。 */
export function pitchTrackToNotes(
  frames: (number | null)[],
  frameDur: number,
  bpm = 120,
  minBeat = 0.125,
): Note[] {
  const spb = 60 / bpm; // 1拍の秒数
  const notes: Note[] = [];
  let cur: number | null = null;
  let startFrame = 0;
  const flush = (endFrame: number) => {
    if (cur === null) return;
    const startSec = startFrame * frameDur;
    const durSec = (endFrame - startFrame) * frameDur;
    const durBeat = durSec / spb;
    if (durBeat >= minBeat) notes.push({ pitch: cur, start: startSec / spb, dur: durBeat });
  };
  for (let i = 0; i < frames.length; i++) {
    const m = frames[i]!;
    if (m !== cur) {
      flush(i);
      cur = m;
      startFrame = i;
    }
  }
  flush(frames.length);
  return notes;
}
