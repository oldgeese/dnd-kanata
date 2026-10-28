import { Display, Empty, isComposing, useInlineEdit, type EditableProps } from "./inline";

export function EditableText(props: EditableProps & { inputMode?: "numeric" | "text"; className?: string }) {
  const e = useInlineEdit(props);
  if (!e.editing)
    return (
      <Display label={props.label} readOnly={props.readOnly} onStart={e.start} displayRef={e.displayRef} className={props.className}>
        {props.value === "" ? <Empty /> : props.value}
      </Display>
    );
  return (
    <input
      className={`ei ${props.className ?? ""}`.trim()}
      aria-label={props.label}
      autoFocus
      inputMode={props.inputMode}
      value={e.draft}
      onChange={(ev) => e.setDraft(ev.target.value)}
      onBlur={() => e.commit()}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" && !isComposing(ev)) {
          ev.preventDefault();
          e.commit(true);
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          e.cancel(true);
        }
      }}
    />
  );
}
