// 音価ピッカー（#10⑤ 共通部品）：16/8/4/2/1 の音価ボタン＋付点(．)トグルを1本化。
// PianoRoll(メロ/ベース絶対)・BassStepEditor(相対)・ChordPatternEditor で共有。
// 値の単位(拍 or step)は呼び出し側に委ねる＝options の v をそのまま採用（unit 非依存）。
// controlled：value/dotted を親が保持し、選択・付点トグルをコールバックで返す。dur の ×1.5 は親が適用。
export function NoteValuePicker({
  options,
  value,
  dotted,
  onChange,
  onToggleDotted,
  label = "音長",
}: {
  options: { label: string; v: number }[];
  value: number;
  dotted: boolean;
  onChange: (v: number) => void;
  onToggleDotted: () => void;
  label?: string;
}) {
  return (
    <>
      <span className="muted">{label}</span>
      {options.map((o) => (
        // aria-label は付けない＝可視テキスト("16"等)がそのままアクセシブル名（従来挙動・テスト互換）。
        <button
          key={o.v}
          type="button"
          className={"len" + (value === o.v ? " on" : "")}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
      <button
        type="button"
        aria-label="dotted"
        title="付点（×1.5）"
        className={"len dot" + (dotted ? " on" : "")}
        onClick={onToggleDotted}
      >
        ．
      </button>
    </>
  );
}
