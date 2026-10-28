import { useEffect, useRef } from "react";
import { Display, Empty, useInlineEdit, type EditableProps } from "./inline";

export function EditableSelect(props: EditableProps & { options: { value: string; label: string }[] }) {
  const e = useInlineEdit(props);
  const sel = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!e.editing) return;
    try {
      sel.current?.showPicker?.(); // 対応ブラウザではタップ 1 回で選択肢を開く
    } catch {
      // ユーザー操作の直後でない等で開けないときはフォーカスだけ
    }
  }, [e.editing]);

  if (!e.editing) {
    const opt = props.options.find((o) => o.value === props.value);
    const text = opt ? opt.label || opt.value : props.value;
    return (
      <Display label={props.label} readOnly={props.readOnly} onStart={e.start} displayRef={e.displayRef}>
        {text === "" ? <Empty /> : text}
      </Display>
    );
  }
  return (
    <select
      ref={sel}
      className="ei"
      aria-label={props.label}
      autoFocus
      value={props.value}
      onChange={(ev) => e.commitValue(ev.target.value)}
      onBlur={() => e.cancel()}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          e.cancel(true);
        }
      }}
    >
      {!props.options.some((o) => o.value === props.value) && <option value={props.value}>{props.value}</option>}
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label || o.value || "—"}
        </option>
      ))}
    </select>
  );
}
