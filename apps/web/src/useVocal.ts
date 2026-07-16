// #13c 仮歌（メロの楽器＝歌声）の共有レンダリングフック。ネタ単体エディタと Section の両方で使う（再生の一本化）。
// - 「歌う仕事(job)」＝{key, notes(絶対拍・syllable付), bpm, firstNoteBeat}。key はメロ/テンポで決まる（変われば別 wav）。
// - ensure(jobs)＝未キャッシュの job だけ api.sing→decodeVocal でレンダ（「歌声を作っています…」busy）→ VocalPlay[] を返す。
//   同一入力は api 側 content-hash で合成スキップ＝速い。ここでも key で AudioBuffer をメモしデコードも一度きり。
// - peek(jobs)＝レンダ済みだけを同期で返す（未レンダは含めない）。再生押下前の表示用。
// buffer は ref（同期に読める）＝再生押下直後（await 後）に useTransport の getVocal が最新を掴める（state フラッシュ非依存）。
import { useCallback, useRef, useState } from "react";
import { api } from "./api";
import { decodeVocal } from "./audio";
import { type VocalPlay } from "./music";

export interface SingNote {
  pitch: number;
  start: number;
  dur: number;
  syllable?: string;
}

export interface VocalJob {
  key: string; // メロ+テンポで一意（変われば別 wav）
  notes: SingNote[]; // 絶対拍・syllable 付き（弱起=負start も保持）
  bpm: number;
  firstNoteBeat: number; // 歌の初音の絶対拍（弱起なら負）＝楽器と同座標
  speaker?: number;
}

export function useVocalRender() {
  // #13c buffer と一緒に leadRestSec（api /sing の実測先頭休符長）をキャッシュ＝カウントイン量の SSOT
  // （web の SING_LEAD_REST_BEATS 直参照を撤去）。leadRestBeats は再生時に leadRestSec/spb で換算。
  const cacheRef = useRef<Map<string, { buffer: AudioBuffer; leadRestSec: number }>>(new Map());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, bump] = useState(0); // レンダ完了で peek 依存の再描画を促す

  // job を VocalPlay へ（buffer がキャッシュにある前提）。leadRestBeats＝api 実測 leadRestSec を拍換算（床追従）。
  const toPlay = (j: VocalJob): VocalPlay => {
    const c = cacheRef.current.get(j.key)!;
    const spb = 60 / (j.bpm > 0 ? j.bpm : 120);
    return { buffer: c.buffer, firstNoteBeat: j.firstNoteBeat, leadRestBeats: c.leadRestSec / spb };
  };

  // 未キャッシュ job をレンダしてから、レンダ済み全 job の VocalPlay[] を返す（再生押下時）。
  const ensure = useCallback(async (jobs: VocalJob[]): Promise<VocalPlay[]> => {
    const missing = jobs.filter((j) => j.notes.length > 0 && !cacheRef.current.has(j.key));
    if (missing.length) {
      setBusy(true);
      setMsg(null);
      try {
        const notes: string[] = [];
        for (const j of missing) {
          const r = await api.sing(j.notes, j.bpm, j.speaker); // 同一入力は content-hash で合成スキップ
          const buf = await decodeVocal(await (await fetch(api.assetUrl(r.assetId))).arrayBuffer());
          cacheRef.current.set(j.key, { buffer: buf, leadRestSec: r.leadRestSec });
          if (r.shift) notes.push(`音域を${r.shift > 0 ? "+" : ""}${r.shift}半音移調`);
          if (r.clamped) notes.push(`${r.clamped}音を歌唱帯へクランプ`);
        }
        setMsg(notes.length ? Array.from(new Set(notes)).join("／") : null);
      } catch (e) {
        setMsg(`仮歌の生成に失敗：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
        bump((v) => v + 1);
      }
    }
    return jobs.filter((j) => cacheRef.current.has(j.key)).map(toPlay);
  }, []);

  // レンダ済みだけを同期で返す（未レンダは含めない）。null＝1本もレンダ済みでない（＝従来一致）。
  const peek = useCallback((jobs: VocalJob[]): VocalPlay[] | null => {
    const ready = jobs.filter((j) => cacheRef.current.has(j.key));
    return ready.length ? ready.map(toPlay) : null;
  }, []);

  return { ensure, peek, busy, msg, setMsg };
}
