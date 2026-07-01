// 音価ピッカー（#10⑤ 共通部品）：16/8/4/2/1 の音価ボタン＋付点(．)トグルを1本化。
// PianoRoll(メロ/ベース絶対)・BassStepEditor(相対)・ChordPatternEditor で共有。
// 値の単位(拍 or step)は呼び出し側に委ねる＝options の v をそのまま採用（unit 非依存）。
// controlled：value/dotted を親が保持し、選択・付点トグルをコールバックで返す。dur の ×1.5 は親が適用。
import { NoteGlyph } from "./NoteGlyph";

export function NoteValuePicker({
  options,
  value,
  dotted,
  onChange,
  onToggleDotted,
  label = "長さ(分)", // 全エディタ統一（数字16/8/4/2/1=分音符）。ChordEditor は拍/小節なので「長さ」。
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
        // 可視は音符イラスト(NoteGlyph)。アクセシブル名は aria-label で保つ（テスト/読み上げ互換）。
        <button
          key={o.v}
          type="button"
          aria-label={o.label}
          title={`${o.label}分音符`}
          className={"len glyph" + (value === o.v ? " on" : "")}
          onClick={() => onChange(o.v)}
        >
          <NoteGlyph note={o.label} />
        </button>
      ))}
      {/* 付点は音価とは別（修飾）＝縦線で区切って少し離す。 */}
      <span className="nv-divider" aria-hidden="true" />
      <button
        type="button"
        aria-label="dotted"
        title="付点（長さ×1.5）"
        className={"len glyph" + (dotted ? " on" : "")}
        onClick={onToggleDotted}
      >
        <NoteGlyph note="4" dotted />
      </button>
    </>
  );
}
