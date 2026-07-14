import { KindIcon } from "./KindIcon";
import { KIND_LABEL, kindColor, KINDS } from "../kinds";

// capturable=false の kind（reference/analysis/study）は作成タイルが無い＝「作れば現れる」は嘘。
// 取込・解析で件数が増えたら初めて出る、と実態に合う文言へ分岐する（監査#9）。
function zeroHint(k: string): string {
  const label = KIND_LABEL[k] ?? k;
  return KINDS.includes(k)
    ? `${label}：まだ0件（作ればトップのタイルに現れる）`
    : `${label}：まだ0件（取込・解析で増えると現れる）`;
}

// 種別ミニタイル（トップ再設計 S3・正準＝docs/research/2026-07-14-topview-redesign-fable.md §10）。
// オーナーFB「作る側(タイル)に絵を寄せたい」を受け、種別フィルタを作成タイルと同じ視覚言語のミニタイル
// （KindIcon絵柄・レーン色・角丸）へ。件数はタイル右上の**小バッジ**（未読バッジ隠喩）。
// ・variant="row"  … トップの種別行（上位6・横スクロール1行固定・トップ契約§2.2）
// ・variant="grid" … 絞る引き出しの3列格子（全種別・「まだ0件」は破線ゴースト）
// 弁別＝作る棚のタイルは「＋」付き／絞りタイルは「＋」無し・件数バッジ・選択でレーン色リング。
// aria(kind-filter-*) と選択ロジック(kindFilter)は S1/S2 のまま不変＝見た目だけの差分。
export type KindTilesProps = {
  entries: [string, number][]; // 表示する [kind, 件数]（呼び側で件数降順・上位6等に整形済み）
  kindFilter: string;
  setKindFilter: (k: string) => void;
  variant: "row" | "grid";
  onPick?: () => void; // 引き出し内＝選択したら閉じる等
  zeroKinds?: string[]; // grid のみ＝「まだ0件」の破線ゴースト（作ればチップに現れる）
};

export function KindTiles({ entries, kindFilter, setKindFilter, variant, onPick, zeroKinds }: KindTilesProps) {
  const pick = (k: string) => {
    setKindFilter(kindFilter === k ? "" : k);
    onPick?.();
  };
  return (
    <div className={"kind-tiles " + (variant === "row" ? "kt-row" : "kt-grid")} role="group" aria-label="kind-filter">
      {entries.map(([k, n]) => (
        <button
          key={k}
          type="button"
          className={"kind-tile" + (kindFilter === k ? " on" : "")}
          style={{ ["--k" as string]: kindColor(k) }}
          aria-label={`kind-filter-${k}`}
          aria-pressed={kindFilter === k}
          title={`${KIND_LABEL[k] ?? k}で絞る（${n}件）`}
          onClick={() => pick(k)}
        >
          <span className="kt-badge" aria-hidden="true">{n}</span>
          <KindIcon kind={k} />
          <span className="kt-label">{KIND_LABEL[k] ?? k}</span>
        </button>
      ))}
      {variant === "grid" &&
        zeroKinds?.map((k) => (
          <div
            key={k}
            className="kind-tile kt-zero"
            style={{ ["--k" as string]: kindColor(k) }}
            aria-label={`kind-zero-${k}`}
            title={zeroHint(k)}
          >
            <KindIcon kind={k} />
            <span className="kt-label">{KIND_LABEL[k] ?? k}</span>
            <span className="kt-zerolab">0件</span>
          </div>
        ))}
    </div>
  );
}
