// #S11改 研究(study)ビューア：主役＝曲ごとの「曲内で繰り返すコア・ループ」（=曲の顔）。共通進行は補助。
// study ネタ content = {topic, members, songs[], common, stats, prose}。
//   songs[].coreLoops[].example / common[].example = 弾ける実音コード列。
import { useRef, useState } from "react";
import { type Neta } from "../api";
import { playNotes, type PlaybackHandle } from "../audio";
import { notesForContent } from "../music";

type Slot = { root: number; quality: string; start: number; dur: number };
interface CoreLoop { degrees: string[]; example: Slot[]; length: number; count: number }
interface SongData { title: string; url?: string; key?: number | null; mode?: string | null; coreLoops: CoreLoop[] }
interface CommonEntry { degrees: string[]; example: Slot[]; songCount: number; songs: string[] }
interface Content {
  topic: string;
  members: { title: string; url?: string; key?: number | null; mode?: string | null }[];
  songs?: SongData[];   // ★主役＝曲ごとのコア・ループ
  common: CommonEntry[]; // 補助＝クロス曲頻度（汎用の繋ぎを拾いがち）
  stats: { songs: number; keys: Record<string, number>; modes: Record<string, number> };
  prose: string;
}

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const chordName = (c: { root: number; quality: string }) => `${ROOTS[((c.root % 12) + 12) % 12]}${c.quality}`;
const keyLabel = (key?: number | null, mode?: string | null) =>
  key != null ? `（${ROOTS[((key % 12) + 12) % 12]}${mode === "minor" ? "m" : ""}）` : "";

export function StudyView({ neta, onClose }: { neta: Neta; onClose: () => void }) {
  const c = (neta.content ?? {}) as Content;
  const songs = Array.isArray(c.songs) ? c.songs : [];
  const allCommon = Array.isArray(c.common) ? c.common : [];
  // 共通(補助)＝2曲以上に出るものだけ・上位24件。
  const common = allCommon.filter((e) => e.songCount >= 2).slice(0, 24);
  const members = Array.isArray(c.members) ? c.members : [];
  const handleRef = useRef<PlaybackHandle | null>(null);
  const [playKey, setPlayKey] = useState<string | null>(null); // 曲/共通を独立に鳴らせるよう文字列キー
  const [showProse, setShowProse] = useState(false); // 既定=畳む＝長い所見でも主役ループを最初に見せる

  function play(example: Slot[], key: string) {
    handleRef.current?.stop();
    if (playKey === key) { setPlayKey(null); return; }
    setPlayKey(key);
    const notes = notesForContent("chord_progression", { chords: example });
    void playNotes(notes, 100, { onEnd: () => setPlayKey(null) }).then((h) => (handleRef.current = h));
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

      {/* 内側スクロール body（.mainpane-editor は overflow:hidden の固定枠＝直下に流すと prose が潰れ下部が届かない）。 */}
      <div className="study-body">
      {/* 所見は既定で畳む＝主役の曲ごとループを最初に見せる（長文で下に埋もれない）。 */}
      {c.prose && (
        <button className="bs-btn study-prose-toggle" aria-label="toggle-prose" onClick={() => setShowProse((v) => !v)}>
          所見（手癖の考察）{showProse ? "▲" : "▼"}
        </button>
      )}
      {c.prose && showProse && <div className="study-prose chat-md">{c.prose}</div>}

      {/* ★主役：曲ごとのコア・ループ（曲内で繰り返す＝曲の顔） */}
      {songs.length > 0 && (
        <>
          <div className="study-section-h">曲ごとのコア・ループ（曲内で繰り返す＝曲の顔）</div>
          <div className="study-commons">
            {songs.map((s, si) => {
              const loop = s.coreLoops?.[0]; // count 降順→length 降順の先頭＝一番回るループ
              const key = `song-${si}`;
              return (
                <div key={key} className="study-common study-song">
                  <div className="study-song-l">
                    <div className="study-songname">{s.title}{keyLabel(s.key, s.mode)}</div>
                    <div className="study-prog">
                      {loop ? loop.example.map(chordName).join(" → ") : <span className="muted">反復ループなし</span>}
                    </div>
                  </div>
                  {loop && <span className="study-song-count">{loop.length}和音<br />×{loop.count}回</span>}
                  {loop && (
                    <button className={"bs-btn study-play" + (playKey === key ? " on" : "")} aria-label={`play-song-${si}`} onClick={() => play(loop.example, key)}>
                      {playKey === key ? "■" : "▶"} 試聴
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 補助：クロス曲の共通進行（どの曲にも出がち＝汎用の繋ぎに注意） */}
      <div className="study-section-h">共通コード進行（補助・何曲に出るか）{allCommon.length > common.length ? ` ・上位${common.length}/${allCommon.length}件` : ""}</div>
      <div className="study-commons">
        {common.length === 0 && <p className="muted">共通進行は見つかりませんでした</p>}
        {common.map((e, i) => {
          const key = `common-${i}`;
          return (
            <div key={key} className="study-common">
              <div className="study-prog">{e.example.map(chordName).join(" → ")}</div>
              <div className="study-prog-meta">
                <span className="study-count">{e.songCount}曲</span>
                <span className="study-songs">{e.songs.slice(0, 3).join(" / ")}{e.songs.length > 3 ? "…" : ""}</span>
              </div>
              <button className={"bs-btn study-play" + (playKey === key ? " on" : "")} aria-label={`play-common-${i}`} onClick={() => play(e.example, key)}>
                {playKey === key ? "■" : "▶"} 試聴
              </button>
            </div>
          );
        })}
      </div>

      <div className="study-section-h">対象曲（{members.length}）</div>
      <ul className="study-members">
        {members.map((m, i) => <li key={i}>{m.title}{keyLabel(m.key, m.mode)}</li>)}
      </ul>
      </div>
    </div>
  );
}
