import { useEffect, useState } from "react";
import { api } from "../api";

// #83/#55 曲(song)の段階・次の一手パネル。song overlay を読み込み、編集して保存（blur時）。
// SectionEditor.tsx から機械分割（負債D6）＝挙動不変。
export function SongStatus({ netaId }: { netaId: string }) {
  const [stage, setStage] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let live = true;
    void api.getSong(netaId).then((s) => {
      if (live && s) {
        setStage(s.stage ?? "");
        setNextAction(s.next_action ?? "");
      }
    });
    return () => {
      live = false;
    };
  }, [netaId]);
  async function save() {
    await api.updateSong(netaId, { stage: stage || null, next_action: nextAction || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  return (
    <div className="song-status">
      <label>
        段階
        <input
          value={stage}
          placeholder="ラフ / アレンジ / 詞 / ミックス…"
          onChange={(e) => setStage(e.target.value)}
          onBlur={save}
        />
      </label>
      <label>
        次の一手
        <input
          value={nextAction}
          placeholder="サビのメロを詰める…"
          onChange={(e) => setNextAction(e.target.value)}
          onBlur={save}
        />
      </label>
      {saved && <span className="song-status-saved">✓</span>}
    </div>
  );
}
