import { useEffect, useState } from "react";
import { api, type Asset } from "../api";

// #77: SoundFont(GM音色)をアップロードしてサーバ asset に保存し、全体で1個を選ぶ。
// 直リンクURLは廃止（行儀＋privacy）。localStorage には選択中 asset id のみ。
const KEY = "cm.soundfont"; // 選択中の asset id

export function loadSoundFontId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function SoundFontSettings() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<string | null>(loadSoundFontId());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function reload() {
    try {
      const list = await api.listAssets("soundfont");
      setAssets(list);
      // 選択が消えていたら最新を採用（全体で1個）
      if (list.length && !list.some((a) => a.id === selected)) select(list[0]!.id);
    } catch {
      /* オフライン等 */
    }
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function select(id: string) {
    localStorage.setItem(KEY, id);
    setSelected(id);
  }

  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const a = await api.uploadAsset(file, "soundfont");
      select(a.id); // 新しくアップしたものを全体採用
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message.slice(0, 120) : "アップロード失敗");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await api.deleteAsset(id).catch(() => {});
    if (selected === id) {
      localStorage.removeItem(KEY);
      setSelected(null);
    }
    await reload();
  }

  return (
    <section className="sf-settings" aria-label="soundfont-settings">
      <h3>SoundFont（GM音色）</h3>
      <p className="muted">
        .sf2 をアップロードして全体の音源にします（1個）。再生↔MIDI書き出しは GM の音色で一致。
      </p>
      <label className="import-btn">
        {busy ? "アップロード中…" : "SF2をアップロード"}
        <input
          type="file"
          accept=".sf2,audio/x-soundfont"
          aria-label="sf-upload"
          hidden
          disabled={busy}
          onChange={async (e) => {
            await upload(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </label>
      {err && <p className="muted sf-err">{err}</p>}
      <ul className="sf-list">
        {assets.length === 0 && <li className="muted">まだ音源がありません</li>}
        {assets.map((a) => (
          <li key={a.id} className={"sf-item" + (a.id === selected ? " on" : "")}>
            <button
              type="button"
              className="sf-pick"
              aria-label={`sf-select-${a.id}`}
              onClick={() => select(a.id)}
            >
              {a.id === selected ? "●" : "○"} {a.name ?? a.id.slice(0, 8)}
              {a.size != null && <span className="muted"> （{Math.round(a.size / 1e6)}MB）</span>}
            </button>
            <button
              type="button"
              className="danger"
              aria-label={`sf-delete-${a.id}`}
              onClick={() => void remove(a.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
