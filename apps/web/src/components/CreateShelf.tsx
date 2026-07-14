import type { Dispatch, SetStateAction } from "react";
import { KindIcon } from "./KindIcon";
import { Icon } from "./Icon";
import { ImportPanel } from "./ImportPanel";

// 作成の棚（トップ再設計 S1 機械抽出・正準＝docs/research/2026-07-14-topview-redesign-fable.md §7）。
// ＝ホームの作成タイル（PARTS/BUILD_TEXT・同じ絵/順）＋取込トグル＋ImportPanel を App.tsx から
// **そのまま**切り出したコンポ。state/API は App が唯一持ち、当コンポは器（JSX）のみ＝タイルtap＝
// 既存 createBlank/newSong をそのまま呼ぶ（bit一致）。DOM/aria は抽出前と完全同一（回帰ネット＝App.test の toggle-import）。
// S2 でこの棚をボトムシート化する（＋作る▾ で開く）。
export type CreateShelfProps = {
  createBlank: (kind: string, title: string) => void;
  newSong: () => void;
  importOpen: boolean;
  setImportOpen: Dispatch<SetStateAction<boolean>>;
  reload: () => Promise<void>;
  projectTags: string[];
};

// 作成タイルの並び＝パーツ行(メロ/骨格/対旋律/コード/ベース/リズム/コード楽器/リフ/管弦)＋組み立て・文字行
// (セクション/曲/歌詞/テーマ)。順は絞り込み(FilterBar)/棚(S2)と一致させ位置学習を保つ。
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

export function CreateShelf({ createBlank, newSong, importOpen, setImportOpen, reload, projectTags }: CreateShelfProps) {
  const tile = ([k, label, title, col]: readonly [string, string, string, string]) => (
    <button
      key={k}
      className="create-tile"
      style={{ ["--k" as string]: col }}
      onClick={() => (k === "song" ? void newSong() : void createBlank(k, title))}
    >
      <KindIcon kind={k} />
      <span>＋{label}</span>
    </button>
  );
  return (
    <>
      {/* 作成タイル＝グループ分け（案A・2026-07-04）＝パーツ/組み立て・文字/取込。
          section と song を別タイルに分離＝「パーツを組む1ブロック(section)」と「並べる(song)」の混乱を解消。 */}
      <div className="create-tiles">
        {/* グループ見出し(パーツ/組み立て/文字)は撤去＝ラベルはタイル自身が持つので冗長(オーナー)。 */}
        <div className="ct-row ct-parts">{PARTS.map(tile)}</div>
        <div className="ct-row ct-buildtext">{BUILD_TEXT.map(tile)}</div>
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
    </>
  );
}
