// 音価の音符イラスト（SVG・絵文字□化を避ける）。16=尻尾2本/8=1本/4=符頭のみ/2=白玉/1=全音符。
// dotted で四分付点などの付点を表現。currentColor で親の文字色に追従。
export function NoteGlyph({ note, dotted = false }: { note: string; dotted?: boolean }) {
  const filled = note === "16" || note === "8" || note === "4";
  const hasStem = note !== "1"; // 全音符は棒なし
  const flags = note === "16" ? 2 : note === "8" ? 1 : 0;
  return (
    <svg width="20" height="24" viewBox="0 0 22 26" aria-hidden="true" role="img" style={{ display: "block" }}>
      {/* 符頭 */}
      <ellipse
        cx="7"
        cy="19"
        rx="5"
        ry="3.6"
        transform="rotate(-22 7 19)"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {hasStem && <line x1="11.4" y1="18" x2="11.4" y2="3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
      {/* 尻尾（旗）：8分=1本・16分=2本 */}
      {flags >= 1 && <path d="M11.4 3 c 6 1.2, 6.5 6, 2.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
      {flags >= 2 && <path d="M11.4 7 c 6 1.2, 6.5 6, 2.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
      {/* 付点 */}
      {dotted && <circle cx="16.5" cy="19.5" r="1.7" fill="currentColor" />}
    </svg>
  );
}
