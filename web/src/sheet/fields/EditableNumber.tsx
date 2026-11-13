import { EditableText } from "./EditableText";
import type { EditableProps } from "./inline";

/** 整数として読めれば数値、空欄は 0、それ以外（"2/3" など）は null（全角数字も可） */
export function parseStepValue(value: string): number | null {
  const s = value.normalize("NFKC").trim();
  if (s === "") return 0;
  return /^-?\d+$/.test(s) ? Number(s) : null;
}

// 所持金・呪文スロットの使用数用。± ボタンで 1 ずつ増減する。
// 整数でない値は上書きで失われるので、そのときは ± を使えなくする。
// min・max を越える方向へは増減しない（範囲の外にある値を範囲へ近づける向きには動かせる）。
export function EditableNumber(props: EditableProps & { min?: number; max?: number }) {
  const { min, max, ...rest } = props;
  const n = parseStepValue(props.value);
  const canStep = (d: number) => n !== null && !(d < 0 && min !== undefined && n <= min) && !(d > 0 && max !== undefined && n >= max);
  // disabled にすると押した直後に上限・下限へ達したときフォーカスが外れるので、aria-disabled にして押しても何もしない
  const button = (d: number, text: string, verb: string) => (
    <button
      type="button"
      className="step"
      aria-label={`${props.label} を 1 ${verb}`}
      aria-disabled={!canStep(d) || undefined}
      onClick={() => canStep(d) && props.onChange(String(n! + d))}
    >
      {text}
    </button>
  );
  return (
    <span className="num">
      {!props.readOnly && button(-1, "−", "減らす")}
      <EditableText {...rest} inputMode="numeric" className="num-value" />
      {!props.readOnly && button(1, "+", "増やす")}
    </span>
  );
}
