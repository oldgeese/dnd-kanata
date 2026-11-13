import { EditableText } from "./EditableText";
import type { EditableProps } from "./inline";

/** 整数として読めれば数値、空欄は 0、それ以外（"2/3" や、丸められてしまう大きな数など）は null（全角数字も可） */
export function parseStepValue(value: string): number | null {
  const s = value.normalize("NFKC").trim();
  if (s === "") return 0;
  const n = Number(s);
  return /^-?\d+$/.test(s) && Number.isSafeInteger(n) ? n : null;
}

// 所持金・呪文スロットの使用数用。± ボタンで 1 ずつ増減する。
// 整数でない値は上書きで失われるので、そのときは ± を使えなくする。
// min・max を越える方向へは増減しない（範囲の外にある値を範囲へ近づける向きには動かせる）。
export interface StepRange {
  min?: number;
  max?: number;
}

/** value を d だけ増減した値。整数でない・範囲を越える方向・丸められる値なら null */
export function stepValue(value: string, d: number, { min, max }: StepRange = {}): string | null {
  const n = parseStepValue(value);
  if (n === null || !Number.isSafeInteger(n + d)) return null;
  if ((d < 0 && min !== undefined && n <= min) || (d > 0 && max !== undefined && n >= max)) return null;
  return String(n + d);
}

export function EditableNumber(props: EditableProps & StepRange) {
  const { min, max, ...rest } = props;
  // disabled にすると押した直後に上限・下限へ達したときフォーカスが外れるので、aria-disabled にして押しても何もしない
  const button = (d: number, text: string, verb: string) => {
    const next = stepValue(props.value, d, { min, max });
    return (
      <button
        type="button"
        className="step"
        aria-label={`${props.label} を 1 ${verb}`}
        aria-disabled={next === null || undefined}
        onClick={() => next !== null && props.onChange(next)}
      >
        {text}
      </button>
    );
  };
  return (
    <span className="num">
      {!props.readOnly && button(-1, "−", "減らす")}
      <EditableText {...rest} inputMode="numeric" className="num-value" />
      {!props.readOnly && button(1, "+", "増やす")}
    </span>
  );
}
