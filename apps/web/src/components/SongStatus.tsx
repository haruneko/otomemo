import { useEffect, useState } from "react";
import { api } from "../api";

// #83/#55 曲(song)の段階・次の一手。#28 で1行チップ化＝一等地を「書く頻度（セッション1回）」に見合う密度へ。
// 既定＝1行の読み物チップ（段階 · 次の一手 ＋「編集」）。タップで入力欄を展開して編集→blur/閉じるで保存。
export function SongStatus({ netaId }: { netaId: string }) {
  const [stage, setStage] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
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

  if (!editing) {
    // 読み物チップ（1行）＝前回の自分からの申し送りを開いた瞬間に読ませる。空なら誘い文。
    const empty = !stage && !nextAction;
    return (
      <button type="button" className="song-status-chip" aria-label="song-status-chip" onClick={() => setEditing(true)}>
        {empty ? (
          <span className="muted">段階・次の一手を書く…</span>
        ) : (
          <>
            {stage && <><b>段階</b> {stage}</>}
            {stage && nextAction && <span className="ss-dot" aria-hidden="true" />}
            {nextAction && <><b>次の一手</b> {nextAction}</>}
          </>
        )}
        <span className="ss-edit muted">編集</span>
      </button>
    );
  }

  return (
    <div className="song-status" aria-label="song-status-edit">
      <label>
        段階
        <input
          value={stage}
          placeholder="ラフ / アレンジ / 詞 / ミックス…"
          onChange={(e) => setStage(e.target.value)}
          onBlur={save}
          autoFocus
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
      <button type="button" className="song-status-done" aria-label="song-status-done" onClick={() => { void save(); setEditing(false); }}>
        閉じる
      </button>
    </div>
  );
}
