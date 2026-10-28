import type { EditableProps } from "./inline";

// チェック時は checkedValue（"on" や "true"）、未チェック時は ""。クリックで即座に反映する。
export function EditableCheckbox(props: EditableProps & { checkedValue: string }) {
  const checked = props.value !== "";
  return (
    <input
      type="checkbox"
      className="ec"
      aria-label={props.label}
      checked={checked}
      disabled={props.readOnly}
      onChange={() => {
        if (!props.readOnly) props.onChange(checked ? "" : props.checkedValue);
      }}
    />
  );
}
