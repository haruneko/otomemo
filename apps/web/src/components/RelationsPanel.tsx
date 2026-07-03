// 編集画面の連関パネル（共通パーツ CP2）：このネタから生成/関連したネタ一覧。
import type { Neta } from "../api";
import { KIND_LABEL } from "../kinds";

export function RelationsPanel({ rels }: { rels: { type: string; neta: Neta | null }[] }) {
  if (!rels.length) return null;
  return (
    <div className="relations">
      <span className="rel-label">関連</span>
      {rels.map(
        (r, i) =>
          r.neta && (
            <span key={i} className="rel-item">
              {KIND_LABEL[r.neta.kind] ?? r.neta.kind}: {(r.neta.title ?? r.neta.text ?? "(無題)").slice(0, 16)}
            </span>
          ),
      )}
    </div>
  );
}
