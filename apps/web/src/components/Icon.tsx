// UIクローム用アイコン（SVG・currentColor で色追従）。絵文字の □ 化(tofu)を避ける（design Slice C）。
// KindIcon はネタ種別用、こちらはヘッダ/プロジェクト画面のボタン用。
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const s = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true as const, fill: "none" as const };
  const st = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "home":
      return (
        <svg {...s}>
          <path {...st} d="M4 11.5 12 4l8 7.5" />
          <path {...st} d="M6 10.5V20h12v-9.5" />
        </svg>
      );
    case "inbox": // 受け取りトレイ（下向き＝届く）
      return (
        <svg {...s}>
          <path {...st} d="M4 13h4l1.5 2.5h5L16 13h4" />
          <path {...st} d="M4 13 6 5h12l2 8v6H4z" />
        </svg>
      );
    case "gear": // 歯付きの歯車（太陽と紛れないよう外周に歯＋中央ハブ）
      return (
        <svg {...s}>
          <circle {...st} cx="12" cy="12" r="5.4" />
          <circle cx="12" cy="12" r="1.9" fill="currentColor" />
          <path
            {...st}
            d="M12 3.6v2.2M12 18.2v2.2M3.6 12h2.2M18.2 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"
          />
        </svg>
      );
    case "chat":
      return (
        <svg {...s}>
          <path {...st} d="M5 5h14v11H9l-4 4z" />
        </svg>
      );
    case "edit": // 鉛筆
      return (
        <svg {...s}>
          <path {...st} d="M14 5.5 18.5 10 8 20.5 3.5 21l.5-4.5z" />
          <path {...st} d="M13 6.5 17.5 11" />
        </svg>
      );
    case "trash":
      return (
        <svg {...s}>
          <path {...st} d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
        </svg>
      );
    case "library": // 参考素材の池＝積み重なったコレクション
      return (
        <svg {...s}>
          <rect {...st} x="8" y="4" width="12" height="12" rx="2" />
          <path {...st} d="M16 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2" />
        </svg>
      );
    case "play":
      return (
        <svg {...s} fill="currentColor">
          <path d="M7 5l12 7-12 7z" />
        </svg>
      );
    case "pause":
      return (
        <svg {...s} fill="currentColor">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      );
    case "rewind": // 頭出し（|◀）
      return (
        <svg {...s} fill="currentColor">
          <rect x="5" y="5" width="2.4" height="14" rx="1" />
          <path d="M20 5l-11 7 11 7z" />
        </svg>
      );
    case "loop": // 🔁 ループ
      return (
        <svg {...s}>
          <path {...st} d="M4 9a5 5 0 0 1 5-5h8l-2.5-2.5M20 15a5 5 0 0 1-5 5H7l2.5 2.5" />
        </svg>
      );
    case "undo":
      return (
        <svg {...s}>
          <path {...st} d="M9 7 4 12l5 5" />
          <path {...st} d="M4 12h10a6 6 0 0 1 0 12h-1" />
        </svg>
      );
    case "redo":
      return (
        <svg {...s}>
          <path {...st} d="m15 7 5 5-5 5" />
          <path {...st} d="M20 12H10a6 6 0 0 0 0 12h1" />
        </svg>
      );
    case "pin": // 指示ピン
      return (
        <svg {...s}>
          <path {...st} d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
          <path {...st} d="M12 14v6" />
        </svg>
      );
    default:
      return null;
  }
}
