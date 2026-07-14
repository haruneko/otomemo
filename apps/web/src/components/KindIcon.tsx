// kind 別のアイコン（作成タイル用・SVG・currentColor で色追従）。絵文字□化を避ける。
export function KindIcon({ kind }: { kind: string }) {
  const s = { width: 22, height: 22, viewBox: "0 0 24 24", "aria-hidden": true as const };
  switch (kind) {
    case "melody": // 四分音符
      return (
        <svg {...s}>
          <ellipse cx="8" cy="17" rx="3.2" ry="2.3" fill="currentColor" />
          <rect x="10.6" y="5" width="1.7" height="12.2" fill="currentColor" />
          <path d="M12.3 5c3 .8 4 2.4 3.4 4.6-.5-1.4-1.7-2.2-3.4-2.3z" fill="currentColor" />
        </svg>
      );
    case "bass": // 低い音符（太い下線で低域を示す）
      return (
        <svg {...s}>
          <ellipse cx="8" cy="14" rx="3.2" ry="2.3" fill="currentColor" />
          <rect x="10.6" y="4" width="1.7" height="10.2" fill="currentColor" />
          <rect x="4" y="19" width="16" height="2.2" rx="1.1" fill="currentColor" opacity="0.9" />
        </svg>
      );
    case "chord":
    case "chord_progression": // 積み和音（3本の線）
      return (
        <svg {...s}>
          <rect x="5" y="7" width="14" height="2.4" rx="1.2" fill="currentColor" />
          <rect x="5" y="11" width="14" height="2.4" rx="1.2" fill="currentColor" />
          <rect x="5" y="15" width="14" height="2.4" rx="1.2" fill="currentColor" />
        </svg>
      );
    case "chord_pattern": // コード楽器（積み＋刻み点）
      return (
        <svg {...s}>
          <rect x="4" y="7" width="10" height="2.2" rx="1.1" fill="currentColor" />
          <rect x="4" y="11" width="10" height="2.2" rx="1.1" fill="currentColor" />
          <rect x="4" y="15" width="10" height="2.2" rx="1.1" fill="currentColor" />
          <circle cx="18" cy="8.1" r="1.4" fill="currentColor" />
          <circle cx="18" cy="12.1" r="1.4" fill="currentColor" />
          <circle cx="18" cy="16.1" r="1.4" fill="currentColor" />
        </svg>
      );
    case "skeleton": // 骨格＝構造線（節点を結ぶ折れ線・design #20）
      return (
        <svg {...s}>
          <path d="M4 16 L10 8 L15 13 L20 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
          <circle cx="4" cy="16" r="2" fill="currentColor" />
          <circle cx="10" cy="8" r="2" fill="currentColor" />
          <circle cx="15" cy="13" r="2" fill="currentColor" />
          <circle cx="20" cy="6" r="2" fill="currentColor" />
        </svg>
      );
    case "counter": // 対旋律＝主線に絡む従属の第2声（2本の波が交差）
      return (
        <svg {...s}>
          <path d="M3 8 C7 5 10 11 14 8 C17 5.5 19 7 21 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
          <path d="M3 16 C7 13 10 19 14 16 C17 13.5 19 15 21 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "riff": // リフ＝反復核（同じ図形が繰り返す・ループ矢印）
      return (
        <svg {...s}>
          <rect x="4" y="10" width="3" height="4" rx="1" fill="currentColor" />
          <rect x="8.5" y="7" width="3" height="7" rx="1" fill="currentColor" />
          <rect x="13" y="10" width="3" height="4" rx="1" fill="currentColor" opacity="0.6" />
          <rect x="17.5" y="7" width="3" height="7" rx="1" fill="currentColor" opacity="0.6" />
          <path d="M4 18 h13 M14 16 l3 2 l-3 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
        </svg>
      );
    case "rhythm": // ステップグリッド（4マス）
      return (
        <svg {...s}>
          {[3, 9, 15, 21].map((x) => (
            <rect key={x} x={x - 1.5} y="9.5" width="4" height="5" rx="1" fill="currentColor" opacity={x === 3 || x === 15 ? 1 : 0.5} />
          ))}
        </svg>
      );
    case "lyric": // 歌詞＝テキスト行
      return (
        <svg {...s}>
          <rect x="5" y="7" width="14" height="2.2" rx="1.1" fill="currentColor" />
          <rect x="5" y="11" width="14" height="2.2" rx="1.1" fill="currentColor" />
          <rect x="5" y="15" width="9" height="2.2" rx="1.1" fill="currentColor" />
        </svg>
      );
    case "theme": // テーマ＝星
      return (
        <svg {...s}>
          <path d="M12 3l2.5 5.6 6 .5-4.6 4 1.5 5.9L12 21l-5.4 3-.1-.1 1.5-5.9-4.6-4 6-.5z" fill="currentColor" />
        </svg>
      );
    case "section":
    case "song": // 曲＝重ねたレイヤー
      return (
        <svg {...s}>
          <rect x="4" y="6" width="16" height="4" rx="1.4" fill="currentColor" opacity="0.5" />
          <rect x="4" y="11.5" width="16" height="4" rx="1.4" fill="currentColor" />
          <rect x="4" y="17" width="11" height="3.4" rx="1.4" fill="currentColor" opacity="0.7" />
        </svg>
      );
    default:
      return null;
  }
}
