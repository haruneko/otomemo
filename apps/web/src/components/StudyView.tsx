// #S11 研究(study)ビューア：横断研究の共通コード進行＋所見を見る。作家/ジャンルの"手癖"の置き場。
// study ネタ content = {topic, members, common, stats, prose}。common[].example は弾ける実音コード列。
import { useRef, useState } from "react";
import { type Neta } from "../api";
import { playNotes, type PlaybackHandle } from "../audio";
import { notesForContent } from "../music";

interface CommonEntry { degrees: string[]; example: { root: number; quality: string; start: number; dur: number }[]; songCount: number; songs: string[] }
interface Content {
  topic: string;
  members: { title: string; url?: string; key?: number | null; mode?: string | null }[];
  common: CommonEntry[];
  stats: { songs: number; keys: Record<string, number>; modes: Record<string, number> };
  prose: string;
}

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const chordName = (c: { root: number; quality: string }) => `${ROOTS[((c.root % 12) + 12) % 12]}${c.quality}`;

export function StudyView({ neta, onClose }: { neta: Neta; onClose: () => void }) {
  const c = (neta.content ?? {}) as Content;
  const allCommon = Array.isArray(c.common) ? c.common : [];
  // ★"共通"＝2曲以上に出るものだけ（songCount>=2）。長い進行は1曲固有になりがち＝それを共通扱いしない。
  // 並びは既に songCount 降順→長さ降順なので、真の共通(長め優先)が上に来る。上位24件に頭打ち。
  const common = allCommon.filter((e) => e.songCount >= 2).slice(0, 24);
  const members = Array.isArray(c.members) ? c.members : [];
  const handleRef = useRef<PlaybackHandle | null>(null);
  const [playingIdx, setPlayingIdx] = useState(-1);

  function playExample(ex: CommonEntry["example"], idx: number) {
    handleRef.current?.stop();
    if (playingIdx === idx) { setPlayingIdx(-1); return; }
    setPlayingIdx(idx);
    const notes = notesForContent("chord_progression", { chords: ex });
    void playNotes(notes, 100, { onEnd: () => setPlayingIdx(-1) }).then((h) => (handleRef.current = h));
  }

  const modeStr = Object.entries(c.stats?.modes ?? {}).map(([m, n]) => `${m === "minor" ? "短調" : m === "major" ? "長調" : m}${n}`).join("・");

  return (
    <div className="mainpane-editor study-view" style={{ ["--k" as string]: "var(--k-study)" }}>
      <div className="editor-bar">
        <button className="bs-btn" onClick={onClose}>← 戻る</button>
        <strong className="study-title">{neta.title ?? `研究: ${c.topic ?? ""}`}</strong>
        <span className="spacer" />
        <span className="meta">{c.stats?.songs ?? members.length}曲 · {modeStr}</span>
      </div>

      {c.prose && <div className="study-prose chat-md">{c.prose}</div>}

      <div className="study-section-h">共通コード進行（何曲に出るか）{allCommon.length > common.length ? ` ・上位${common.length}/${allCommon.length}件` : ""}</div>
      <div className="study-commons">
        {common.length === 0 && <p className="muted">共通進行は見つかりませんでした</p>}
        {common.map((e, i) => (
          <div key={i} className="study-common">
            <div className="study-prog">{e.example.map(chordName).join(" → ")}</div>
            <div className="study-prog-meta">
              <span className="study-count">{e.songCount}曲</span>
              <span className="study-songs">{e.songs.slice(0, 3).join(" / ")}{e.songs.length > 3 ? "…" : ""}</span>
            </div>
            <button className={"bs-btn study-play" + (playingIdx === i ? " on" : "")} aria-label={`play-common-${i}`} onClick={() => playExample(e.example, i)}>
              {playingIdx === i ? "■" : "▶"} 試聴
            </button>
          </div>
        ))}
      </div>

      <div className="study-section-h">対象曲（{members.length}）</div>
      <ul className="study-members">
        {members.map((m, i) => <li key={i}>{m.title}{m.key != null ? `（${ROOTS[m.key]}${m.mode === "minor" ? "m" : ""}）` : ""}</li>)}
      </ul>
    </div>
  );
}
