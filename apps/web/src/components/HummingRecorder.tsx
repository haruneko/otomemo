import { useRef, useState } from "react";
import { api } from "../api";
import { detectPitchHz, hzToMidi, pitchTrackToNotes } from "../pitch";

// #56 ハミング録音→音高→melodyネタ。検出/分割ロジックは pitch.ts（テスト済）。ここはマイク捕獲のみ。
const FRAME_MS = 50;

export function HummingRecorder({ onCreated, projectTags = [] }: { onCreated?: () => void; projectTags?: string[] }) {
  const [recording, setRecording] = useState(false);
  const stopRef = useRef<null | (() => Promise<void>)>(null);

  async function start() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert("マイクを使えませんでした（権限を確認してください）");
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const frames: (number | null)[] = [];
    const id = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      const hz = detectPitchHz(buf, ctx.sampleRate);
      frames.push(hz ? hzToMidi(hz) : null);
    }, FRAME_MS);
    setRecording(true);
    stopRef.current = async () => {
      clearInterval(id);
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
      setRecording(false);
      stopRef.current = null;
      const notes = pitchTrackToNotes(frames, FRAME_MS / 1000, 120, 0.125);
      if (notes.length) {
        await api.createNeta({ kind: "melody", title: "ハミング", content: { notes }, tags: projectTags });
        onCreated?.();
      } else {
        alert("音程を取れませんでした（もう少しはっきり歌ってみてください）");
      }
    };
  }

  return (
    <button
      type="button"
      className={"import-btn" + (recording ? " accent" : "")}
      onClick={() => (recording ? void stopRef.current?.() : void start())}
    >
      {recording ? "● 停止してネタ化" : "ハミング録音"}
    </button>
  );
}
