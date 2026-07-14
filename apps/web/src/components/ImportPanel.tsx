import { useState, type Dispatch, type SetStateAction } from "react";
import { api } from "../api";
import { parseMusicXml } from "../musicxml";
import { HummingRecorder } from "./HummingRecorder";
import { Icon } from "./Icon";

// 過去資産の取込パネル（MIDI/楽譜/音源アナリーゼ/URL/歌詞/ハミング）。App.tsx から機械分割
// （負債D6）＝挙動不変。importing/URL入力の状態とハンドラを自己完結で持ち、開閉(importOpen)と
// 一覧再読込(reload)・所属タグ(projectTags)だけ親から受け取る。
export function ImportPanel({
  importOpen,
  setImportOpen,
  reload,
  projectTags,
}: {
  importOpen: boolean;
  setImportOpen: Dispatch<SetStateAction<boolean>>;
  reload: () => Promise<void>;
  projectTags: string[];
}) {
  const [importing, setImporting] = useState(false);
  const [analyzeUrlText, setAnalyzeUrlText] = useState(""); // ① 音源アナリーゼの URL 入力
  const [urlError, setUrlError] = useState(""); // URLアナリーゼ起動失敗の可視フィードバック（監査#7・alert不可）
  const [midiSlow, setMidiSlow] = useState(false); // MIDI取込が12秒で完了しない＝無言で解除せず「裏で続く」と知らせる（2026-07-15）

  // #10/#81 MIDIはworker(mido)でトラック×チャンネル分割→melody/rhythmネタ化。base64でジョブに載せ、
  // 分割→reaperがネタ化。jobのdoneを待って一覧へ反映。
  async function importMidi(files: FileList | null) {
    if (!files) return;
    setImporting(true);
    setMidiSlow(false);
    try {
      const ids: string[] = [];
      for (const file of Array.from(files)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        for (const b of bytes) bin += String.fromCharCode(b);
        const job = await api.createJob({
          intent: "import_midi",
          params: { midi_b64: btoa(bin), filename: file.name },
        });
        ids.push(job.id);
      }
      // 分割→reaper反映を待つ（mido は速い・reaperは5s間隔）。最大~12s、毎秒reload。
      let finished = false;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        await reload();
        const st = await Promise.all(
          ids.map((id) => api.getJob(id).then((j) => j.status).catch(() => "")),
        );
        if (st.every((s) => s === "done" || s === "failed")) {
          await new Promise((r) => setTimeout(r, 600));
          await reload();
          finished = true;
          break;
        }
      }
      // 12秒待っても完了しない＝無言で importing 解除だと「押しても何も起きなかった」に見える。
      // 実際は裏で reaper が処理を続ける（jobは生きている）＝そう明示する（2026-07-15 オーナー承認）。
      if (!finished) setMidiSlow(true);
    } finally {
      setImporting(false);
    }
  }
  // ① 音源アナリーゼ：ファイル or URL → audio_analyze job（裏で分離+MIR+Claude統合）→ 受信トレイに知見ネタ。
  // 音源は解析後にサーバ側で削除（著30-4＝派生事実のみ残す）。
  async function analyzeAudio(files: FileList | null) {
    if (!files || !files.length) return;
    setImporting(true);
    try {
      for (const file of Array.from(files)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        for (const b of bytes) bin += String.fromCharCode(b);
        await api.createJob({ intent: "audio_analyze", params: { audio_b64: btoa(bin), filename: file.name } });
      }
      setImportOpen(false);
    } finally {
      setImporting(false);
    }
  }
  async function analyzeAudioUrl() {
    const u = analyzeUrlText.trim();
    if (!u) return;
    setUrlError("");
    // 実機監査A4＝不正URL（htp://x等）が無検証でジョブ化され無言でfailedに落ちていた。
    // 送信前にクライアント側で軽く弾く（http/https以外・URLとしてパース不能）。入力は保持しパネルは閉じない。
    let parsed: URL | null = null;
    try {
      parsed = new URL(u);
    } catch {
      parsed = null;
    }
    if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
      setUrlError("URLの形式が正しくありません");
      return;
    }
    try {
      await api.createJob({ intent: "audio_analyze", params: { url: u } });
    } catch {
      // ジョブ投入に失敗＝無通知だと「押しても何も起きない」に見える。パネル内に文言で知らせる（alert不可）。
      setUrlError("解析を開始できませんでした");
      return;
    }
    setAnalyzeUrlText("");
    setImportOpen(false);
  }

  // #56 楽譜(MusicXML)取込：ローカルで解析→melodyネタ化（worker不要）。
  async function importScore(files: FileList | null) {
    if (!files) return;
    setImporting(true);
    try {
      for (const file of Array.from(files)) {
        try {
          const notes = parseMusicXml(await file.text());
          if (notes.length) {
            await api.createNeta({
              kind: "melody",
              title: file.name.replace(/\.(musicxml|xml)$/i, ""),
              content: { notes },
              tags: projectTags,
            });
          }
        } catch {
          /* 1ファイルの失敗で全体を止めない */
        }
      }
      await reload();
    } finally {
      setImporting(false);
    }
  }
  async function importLyrics(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const parts = (await file.text())
        .split(/\n\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const p of parts) await api.createNeta({ kind: "lyric", text: p, tags: projectTags });
    }
    await reload();
  }

  if (!importOpen) return null;
  return (
    <div className="notebook-actions">
      <label className="import-btn">
        {importing ? "取り込み中…" : "MIDI取込"}
        <input
          type="file"
          accept=".mid,.midi"
          multiple
          hidden
          disabled={importing}
          onChange={async (e) => {
            await importMidi(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {midiSlow && (
        <span className="import-url-error" role="status">
          時間がかかっています。完了すると受け取りトレイに届きます
        </span>
      )}
      <label className="import-btn">
        楽譜取込
        <input
          type="file"
          accept=".musicxml,.xml"
          multiple
          hidden
          disabled={importing}
          onChange={async (e) => {
            await importScore(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <HummingRecorder onCreated={() => void reload()} projectTags={projectTags} />
      <label className="import-btn" title="音源を分離→BPM/調/コード/音域を解析しアナリーゼ文を受信トレイへ（音源は解析後に削除）">
        {importing ? "解析中…" : <><Icon name="waveform" size={15} /> 音源アナリーゼ</>}
        <input
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
          hidden
          disabled={importing}
          onChange={async (e) => {
            await analyzeAudio(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <input
        className="import-url"
        aria-label="analyze-url"
        placeholder="URLでアナリーゼ(YouTube等・best-effort)"
        value={analyzeUrlText}
        onChange={(e) => {
          setAnalyzeUrlText(e.target.value);
          if (urlError) setUrlError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void analyzeAudioUrl();
        }}
      />
      {urlError && (
        <span className="import-url-error" role="alert">
          {urlError}
        </span>
      )}
      <label className="import-btn">
        歌詞取込
        <input
          type="file"
          accept=".txt,text/plain"
          multiple
          hidden
          onChange={async (e) => {
            await importLyrics(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
