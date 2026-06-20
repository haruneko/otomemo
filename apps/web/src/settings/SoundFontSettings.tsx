import { useState } from "react";

// #47: SoundFont(GM音色)の登録画面。再生に使う音色セットを設定から登録する。
// 実際のSF2再生の配線は後続。ここでは登録(URL/名前)を保持する。
const KEY = "cm.soundfont";
export type SoundFontReg = { name: string; url: string };

export function loadSoundFont(): SoundFontReg | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as SoundFontReg) : null;
  } catch {
    return null;
  }
}

export function SoundFontSettings() {
  const cur = loadSoundFont();
  const [name, setName] = useState(cur?.name ?? "");
  const [url, setUrl] = useState(cur?.url ?? "");
  const [saved, setSaved] = useState(false);

  function save() {
    localStorage.setItem(KEY, JSON.stringify({ name: name.trim(), url: url.trim() }));
    setSaved(true);
  }
  function clear() {
    localStorage.removeItem(KEY);
    setName("");
    setUrl("");
    setSaved(false);
  }

  return (
    <section className="sf-settings" aria-label="soundfont-settings">
      <h3>SoundFont（GM音色）</h3>
      <p className="muted">
        再生に使う音色セットを登録（URL）。MIDI書き出しは各ネタの音色(program)で出力されます。
      </p>
      <label className="meta">
        名前
        <input
          aria-label="sf-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          placeholder="例: FluidR3 GM"
        />
      </label>
      <label className="meta">
        URL
        <input
          aria-label="sf-url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setSaved(false);
          }}
          placeholder="https://… (.sf2 / soundfont)"
        />
      </label>
      <div className="sf-actions">
        <button className="primary" onClick={save} disabled={!url.trim()}>
          登録
        </button>
        {cur && (
          <button className="danger" onClick={clear}>
            解除
          </button>
        )}
        {saved && <span className="muted">登録しました</span>}
      </div>
    </section>
  );
}
