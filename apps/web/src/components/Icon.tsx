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
    case "gear": {
      // 歯付きの歯車（外周に歯＋中央ハブ）。設定ボタン専用＝金属的なアンバー→オレンジのグラデで
      // 他のヘッダアイコン(muted)より"効く"色に（オーナー「歯車の色をリッチに」）。
      const g = "gearGrad";
      return (
        <svg {...s}>
          <defs>
            <linearGradient id={g} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#f4d06b" />
              <stop offset="0.55" stopColor="#e8a13c" />
              <stop offset="1" stopColor="#d9772e" />
            </linearGradient>
          </defs>
          <circle {...st} stroke={`url(#${g})`} cx="12" cy="12" r="5.4" />
          <circle cx="12" cy="12" r="1.9" fill={`url(#${g})`} />
          <path
            {...st}
            stroke={`url(#${g})`}
            d="M12 3.6v2.2M12 18.2v2.2M3.6 12h2.2M18.2 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"
          />
        </svg>
      );
    }
    case "chat":
      return (
        <svg {...s}>
          <path {...st} d="M5 5h14v11H9l-4 4z" />
        </svg>
      );
    case "sliders": // 機材（ミキサーのフェーダー）
      return (
        <svg {...s}>
          <path {...st} d="M6 4v16M12 4v16M18 4v16" />
          <circle {...st} cx="6" cy="9" r="1.9" />
          <circle {...st} cx="12" cy="14" r="1.9" />
          <circle {...st} cx="18" cy="7" r="1.9" />
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
    case "wand": // ツール（キラッ＝補助/生成系のまとまり）
      return (
        <svg {...s}>
          <path d="M12 3l1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4z" fill="currentColor" />
          <path d="M18 13l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="currentColor" opacity="0.8" />
          <path d="M6 14l.6 1.6L8.2 16l-1.6.6L6 18.2l-.6-1.6L3.8 16l1.6-.4z" fill="currentColor" opacity="0.7" />
        </svg>
      );
    case "eraser": // 消しゴム（斜めのブロック＋下線）
      return (
        <svg {...s}>
          <path {...st} d="M8 18.5 3.8 14.3a1.6 1.6 0 0 1 0-2.3l7.9-7.9a1.6 1.6 0 0 1 2.3 0l4.2 4.2a1.6 1.6 0 0 1 0 2.3L12.5 18.5z" />
          <path {...st} d="M8.5 8.5 15 15M7.5 18.5H21" />
        </svg>
      );
    case "check-circle": // 保存済（丸チェック）
      return (
        <svg {...s}>
          <circle {...st} cx="12" cy="12" r="9" />
          <path {...st} d="M8 12.4l2.6 2.6L16 9" />
        </svg>
      );
    case "circle": // 未保存/保存中（丸）
      return (
        <svg {...s}>
          <circle {...st} cx="12" cy="12" r="9" />
        </svg>
      );
    case "waveform": // 🎵 音源アナリーゼ（波形＝音源を解析）
      return (
        <svg {...s}>
          <path {...st} d="M4 10v4M8 6v12M12 9v6M16 4v16M20 8v8" />
        </svg>
      );
    case "pin": // 指示ピン
      return (
        <svg {...s}>
          <path {...st} d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
          <path {...st} d="M12 14v6" />
        </svg>
      );
    case "volume": // 🔉 スピーカー＋音波（音量ミキサー）
      return (
        <svg {...s}>
          <path {...st} d="M4 9v6h3l5 4V5L7 9z" />
          <path {...st} d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8 8 0 0 1 0 12" />
        </svg>
      );
    case "mute": // 🔇 スピーカー＋×（レーンミュート・再生のみ）
      return (
        <svg {...s}>
          <path {...st} d="M4 9v6h3l5 4V5L7 9z" />
          <path {...st} d="M16 9.5l5 5M21 9.5l-5 5" />
        </svg>
      );
    case "dice": // 🎲 ノブをランダムに振る（tofu回避・SVG化）
      return (
        <svg {...s}>
          <rect {...st} x="4" y="4" width="16" height="16" rx="3" />
          <circle cx="9" cy="9" r="1.4" fill="currentColor" />
          <circle cx="15" cy="9" r="1.4" fill="currentColor" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" />
          <circle cx="9" cy="15" r="1.4" fill="currentColor" />
          <circle cx="15" cy="15" r="1.4" fill="currentColor" />
        </svg>
      );
    case "lock": // 🔒 値を固定（サイコロから守る）
      return (
        <svg {...s}>
          <rect {...st} x="5" y="11" width="14" height="9" rx="2" />
          <path {...st} d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case "unlock": // 🔓 固定なし（サイコロ対象）
      return (
        <svg {...s}>
          <rect {...st} x="5" y="11" width="14" height="9" rx="2" />
          <path {...st} d="M8 11V7a4 4 0 0 1 7-2" />
        </svg>
      );
    default:
      return null;
  }
}
