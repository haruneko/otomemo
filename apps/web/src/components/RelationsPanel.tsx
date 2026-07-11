// 編集画面の連関パネル（共通パーツ CP2）：このネタから生成/関連したネタ一覧。
// realized_from（design #20 S2）＝骨格⇄表面メロの見える化。タップで相手を開く。
import type { Neta } from "../api";
import { KIND_LABEL } from "../kinds";

// realized_from のラベル＝相手が骨格なら「← 元の骨格」、メロなら「→ 吹いたメロ」（向きを相手の種類で判定）。
function relLabel(r: { type: string; neta: Neta }): string {
  if (r.type === "realized_from") return r.neta.kind === "skeleton" ? "← 元の骨格" : "→ 吹いたメロ";
  return KIND_LABEL[r.neta.kind] ?? r.neta.kind;
}

export function RelationsPanel({ rels, onOpenNeta }: { rels: { type: string; neta: Neta | null }[]; onOpenNeta?: (n: Neta) => void }) {
  if (!rels.length) return null;
  return (
    <div className="relations">
      <span className="rel-label">関連</span>
      {rels.map(
        (r, i) =>
          r.neta && (
            <button
              key={i}
              type="button"
              className={"rel-item" + (r.type === "realized_from" ? " realized" : "")}
              aria-label={`relation-${r.type}-${r.neta.id}`}
              disabled={!onOpenNeta}
              onClick={() => onOpenNeta?.(r.neta!)}
            >
              {relLabel({ type: r.type, neta: r.neta })}: {(r.neta.title ?? r.neta.text ?? "(無題)").slice(0, 16)}
            </button>
          ),
      )}
    </div>
  );
}
