import { EditableText } from "./EditableText";
import type { EditableProps } from "./inline";

// 所持金用。± ボタンで 1 ずつ増減する。数値でない値は 0 とみなす。
export function EditableNumber(props: EditableProps) {
  const step = (d: number) => {
    const n = parseInt(props.value);
    props.onChange(String((isNaN(n) ? 0 : n) + d));
  };
  return (
    <span className="num">
      {!props.readOnly && (
        <button type="button" className="step" aria-label={`${props.label} を 1 減らす`} onClick={() => step(-1)}>
          −
        </button>
      )}
      <EditableText {...props} inputMode="numeric" className="num-value" />
      {!props.readOnly && (
        <button type="button" className="step" aria-label={`${props.label} を 1 増やす`} onClick={() => step(1)}>
          +
        </button>
      )}
    </span>
  );
}
