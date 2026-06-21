import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

// #71 数値入力。controlled number だと「全消し→Number('')=0が居座る」体験が悪いので、
// 内部は文字列状態で編集中の空文字を許し、数値として有効な時だけ onChange を発火。
// blur で空/不正なら元値に戻す。外部 value の変化はフォーカス外のとき追従。
export function NumberField({
  value,
  onChange,
  ...rest
}: { value: number; onChange: (n: number) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
>) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw); // 空も許す（0を勝手に入れない）
        if (raw !== "" && !Number.isNaN(Number(raw))) onChange(Number(raw));
      }}
      onBlur={() => {
        focused.current = false;
        if (text === "" || Number.isNaN(Number(text))) setText(String(value)); // 空/不正は元値へ
      }}
    />
  );
}
