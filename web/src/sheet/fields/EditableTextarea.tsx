import { useLayoutEffect, useRef } from "react";
import { Display, Empty, useInlineEdit, type EditableProps } from "./inline";

export function EditableTextarea(props: EditableProps) {
  const e = useInlineEdit(props);
  const ta = useRef<HTMLTextAreaElement>(null);

  // 内容に合わせて高さを伸ばす
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [e.editing, e.draft]);

  if (!e.editing)
    return (
      <Display label={props.label} readOnly={props.readOnly} onStart={e.start} displayRef={e.displayRef} className="multiline">
        {props.value === "" ? <Empty /> : props.value}
      </Display>
    );
  return (
    <textarea
      ref={ta}
      className="ei multiline"
      aria-label={props.label}
      autoFocus
      value={e.draft}
      onChange={(ev) => e.setDraft(ev.target.value)}
      onBlur={() => e.commit()}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          e.cancel(true);
        }
      }}
    />
  );
}
