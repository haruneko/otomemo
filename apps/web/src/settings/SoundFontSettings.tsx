import { useEffect, useState } from "react";
import { api, type Asset } from "../api";
import { setActiveSoundFont, probeSoundFont } from "../music";
import { previewNote } from "../audio";

// 試聴パレット＝読み込んだSF2の音色を耳で確かめる（GM program 別・ドラムも）。
// メロ系はCメジャー三和音、ベースは低いC、ドラムはキック→スネア。
const AUDITION: { label: string; program?: number; bass?: boolean; drum?: boolean }[] = [
  { label: "ピアノ", program: 0 },
  { label: "エレピ", program: 4 },
  { label: "ギター", program: 24 },
  { label: "ベース", program: 33, bass: true },
  { label: "ストリングス", program: 48 },
  { label: "ドラム", drum: true },
];
function audition(a: (typeof AUDITION)[number]): void {
  if (a.drum) {
    void previewNote({ pitch: 36, start: 0, dur: 0.3, drum: true, kit: 0 }); // キック
    setTimeout(() => void previewNote({ pitch: 38, start: 0, dur: 0.3, drum: true, kit: 0 }), 220); // スネア
    return;
  }
  if (a.bass) {
    void previewNote({ pitch: 36, start: 0, dur: 0.7, program: a.program }); // C2
    return;
  }
  for (const pitch of [60, 64, 67]) void previewNote({ pitch, start: 0, dur: 0.7, program: a.program }); // Cメジャー
}

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

// 選択を保存＋再生に反映（null=解除）。App起動の自己修復・設定の選択で共用。
export function applySoundFontSelection(id: string | null): void {
  if (id) {
    localStorage.setItem(KEY, id);
    setActiveSoundFont(api.assetUrl(id));
  } else {
    localStorage.removeItem(KEY);
    setActiveSoundFont(null);
  }
}

// 起動時：保存中のidがサーバに在れば使い、無ければ最新を採用（消えたSF2の永久フォールバック防止）。
// オフライン等で一覧が取れなければ保存値をそのまま使う。
export async function initSoundFont(): Promise<void> {
  const stored = loadSoundFontId();
  try {
    const list = await api.listAssets("soundfont");
    const valid = list.find((a) => a.id === stored) ?? list[0] ?? null;
    applySoundFontSelection(valid ? valid.id : null);
  } catch {
    if (stored) setActiveSoundFont(api.assetUrl(stored));
  }
}

export function SoundFontSettings() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<string | null>(loadSoundFontId());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState<string>("");

  async function test() {
    setStatus("読込中…");
    try {
      const r = await probeSoundFont();
      setStatus(r.ok ? `✓ 読込OK（${r.instruments}楽器）。再生に使用中。` : `✗ 読込失敗: ${r.error}`);
    } catch (e) {
      setStatus(`✗ 読込失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

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
    if (loadSoundFontId()) void test(); // 起動中の音源で楽器数を自動表示（テスト押下不要に）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function select(id: string) {
    setSelected(id);
    applySoundFontSelection(id); // #55a 保存＋再生に反映
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
      setActiveSoundFont(null); // 簡易シンセに戻る
    }
    await reload();
  }

  const ok = status.startsWith("✓");
  const bad = status.startsWith("✗");
  return (
    <section className="sf-settings" aria-label="soundfont-settings">
      <div className="sf-head">
        <h3>SoundFont（GM音色）</h3>
        {selected && (
          <span className={"sf-status-pill" + (ok ? " ok" : bad ? " bad" : "")} aria-label="sf-status">
            {status || "…"}
          </span>
        )}
      </div>
      <p className="muted">
        .sf2 をアップロードして全体の音源にします（1個）。再生↔MIDI書き出しは GM の音色で一致。
      </p>

      <ul className="sf-list">
        {assets.length === 0 && <li className="sf-empty muted">まだ音源がありません。下からアップロード。</li>}
        {assets.map((a) => (
          <li key={a.id} className={"sf-item" + (a.id === selected ? " on" : "")}>
            <button
              type="button"
              className="sf-pick"
              aria-label={`sf-select-${a.id}`}
              onClick={() => select(a.id)}
            >
              <span className="sf-dot" aria-hidden="true" />
              <span className="sf-name">{a.name ?? a.id.slice(0, 8)}</span>
              {a.size != null && <span className="sf-size muted">{Math.round(a.size / 1e6)}MB</span>}
              {a.id === selected && <span className="sf-badge">使用中</span>}
            </button>
            <button
              type="button"
              className="sf-del"
              aria-label={`sf-delete-${a.id}`}
              title="削除"
              onClick={() => void remove(a.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <label className="sf-upload-btn">
        {busy ? "アップロード中…" : "＋ SF2をアップロード"}
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

      {/* 試聴＝読み込んだ音源を耳で確かめる（GM program 別・SF2 未設定なら簡易シンセ）。 */}
      <div className="sf-audition" aria-label="sf-audition">
        <span className="sf-audition-head muted">試聴 — タップで鳴らす</span>
        <div className="sf-chips">
          {AUDITION.map((a) => (
            <button
              key={a.label}
              type="button"
              className="sf-chip"
              aria-label={`sf-audition-${a.label}`}
              onClick={() => audition(a)}
            >
              ♪ {a.label}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="sf-actions">
          <button type="button" className="bs-btn" aria-label="sf-test" onClick={() => void test()}>
            読み込みを確認
          </button>
        </div>
      )}
    </section>
  );
}
