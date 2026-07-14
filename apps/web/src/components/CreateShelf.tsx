import type { Dispatch, SetStateAction } from "react";
import { KindIcon } from "./KindIcon";
import { Icon } from "./Icon";
import { ImportPanel } from "./ImportPanel";

// 作成の棚（トップ再設計 S2・正準＝docs/research/2026-07-14-topview-redesign-fable.md §3.1/§7）。
// ＝ホームの作成タイル（PARTS/BUILD_TEXT・同じ絵/順）＋取込を1つの**ボトムシート**に集約。姉妹の
// TinkerSheet（いじる＝棚）と同じ設計言語。トップの `＋作る▾` 1ボタンで開く（トップから .create-tiles が消える）。
// state/API は App が唯一持ち、当コンポは器（JSX）のみ＝タイルtap＝既存 createBlank/newSong をそのまま呼ぶ
// （bit一致）→開いた棚は閉じる（onClose）。並び/絵/aria(toggle-import・create-tile 文言)は S1 抽出前と同一。
// ★トップ契約：新しい kind が増えても「この棚にタイル+1」で終わる＝トップの DOM は不変。
export type CreateShelfProps = {
  createBlank: (kind: string, title: string) => void;
  newSong: () => void;
  importOpen: boolean;
  setImportOpen: Dispatch<SetStateAction<boolean>>;
  reload: () => Promise<void>;
  projectTags: string[];
  onClose: () => void;
};

// 作成タイルの並び＝パーツ行(メロ/骨格/対旋律/コード/ベース/リズム/コード楽器/リフ/管弦)＋組み立て・文字行
// (セクション/曲/歌詞/テーマ)。順は絞り込み(FilterBar)と一致させ位置学習を保つ。
const PARTS = [
  ["melody", "メロ", "新しいメロ", "var(--k-melody)"],
  ["skeleton", "骨格", "新しい骨格", "var(--k-skeleton, #7fb8d4)"],
  ["counter", "対旋律", "新しい対旋律", "var(--k-counter)"],
  ["chord_progression", "コード", "新しいコード進行", "var(--k-chord)"],
  ["bass", "ベース", "新しいベース", "var(--k-bass)"],
  ["rhythm", "リズム", "新しいリズム", "var(--k-rhythm)"],
  ["chord_pattern", "コード楽器", "新しいコード楽器", "var(--k-chord)"],
  ["riff", "リフ", "新しいリフ", "var(--k-riff)"],
  ["section_inst", "管弦", "新しい管弦", "var(--k-section_inst)"],
] as const;
const BUILD_TEXT = [
  ["section", "セクション", "新しいセクション", "var(--k-section)"],
  ["song", "曲", "", "var(--k-song)"],
  ["lyric", "歌詞", "新しい歌詞", "var(--k-lyric)"],
  ["theme", "テーマ", "新しいテーマ", "var(--k-theme)"],
] as const;

// 棚のタイルが実際に作る kind の SSOT（並び順もタイルと同一）。検索合流の「＋『◯◯』を作る」
// はこの集合から前方一致で選ぶ＝棚に無い kind（bare chord / knowledge / other）を作らない（監査#4）。
// ★ chord_progression が chord より前＝「コード」検索は棚の「コード」タイルと同じ chord_progression に当たる。
export const SHELF_KINDS: readonly string[] = [...PARTS, ...BUILD_TEXT].map((t) => t[0]);

export function CreateShelf({ createBlank, newSong, importOpen, setImportOpen, reload, projectTags, onClose }: CreateShelfProps) {
  // タイルtap＝既存 createBlank/newSong を呼び棚を閉じる（現行2タップ主動線＝＋作る→タイル）。
  const create = (k: string, title: string) => {
    if (k === "song") void newSong();
    else void createBlank(k, title);
    onClose();
  };
  const tile = ([k, label, title, col]: readonly [string, string, string, string]) => (
    <button
      key={k}
      className="create-tile"
      style={{ ["--k" as string]: col }}
      onClick={() => create(k, title)}
    >
      <KindIcon kind={k} />
      <span>＋{label}</span>
    </button>
  );
  return (
    <>
      <div className="cm-sheet-backdrop" aria-hidden="true" onClick={onClose} />
      <div className="cm-sheet" role="dialog" aria-label="create-shelf">
        <div className="cm-sheet-head">
          <span className="sheet-grab" aria-hidden="true" />
          <b className="cm-sheet-title">作る</b>
          <button type="button" className="sheet-close" aria-label="close-create-shelf" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="cm-sheet-body">
          <div className="cm-shelf-lab">パーツ（tapで空のネタを作ってエディタへ）</div>
          <div className="create-tiles">
            <div className="ct-row ct-parts">{PARTS.map(tile)}</div>
            <div className="cm-shelf-lab">組み立て・文字</div>
            <div className="ct-row ct-buildtext">{BUILD_TEXT.map(tile)}</div>
            <div className="cm-shelf-lab">取込（過去資産）</div>
            <button
              className={"create-tile import-tile" + (importOpen ? " on" : "")}
              aria-label="toggle-import"
              aria-expanded={importOpen}
              style={{ ["--k" as string]: "var(--muted)" }}
              onClick={() => setImportOpen((v) => !v)}
            >
              <Icon name="inbox" size={22} />
              <span>取込 {importOpen ? "▲" : "▾"}</span>
            </button>
          </div>
          <ImportPanel importOpen={importOpen} setImportOpen={setImportOpen} reload={reload} projectTags={projectTags} />
        </div>
      </div>
    </>
  );
}
