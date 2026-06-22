// 小節数コントロール（メロ/ベース/リズムで共有＝同じ操作感）。1〜max小節を −/＋ で。
export function BarsControl({ bars, max = 4, onChange }: { bars: number; max?: number; onChange: (n: number) => void }) {
  const clamp = (n: number) => Math.max(1, Math.min(max, n));
  return (
    <div className="bars-control">
      <span className="muted">小節</span>
      <button type="button" aria-label="bars-dec" disabled={bars <= 1} onClick={() => onChange(clamp(bars - 1))}>
        −
      </button>
      <span aria-label="bars-count">{bars}</span>
      <button type="button" aria-label="bars-inc" disabled={bars >= max} onClick={() => onChange(clamp(bars + 1))}>
        ＋
      </button>
    </div>
  );
}
