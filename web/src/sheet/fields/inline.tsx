import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";

export interface EditableProps {
  label: string;
  value: string;
  onChange(value: string): void;
  readOnly?: boolean;
}

export const Empty = () => <span className="empty">—</span>;

// 表示モード⇄編集モードの切り替え。下書きは編集モードに入った時点の値から始め、
// 編集中にリモートの値が変わっても上書きしない。
export function useInlineEdit({ value, onChange, readOnly }: EditableProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const done = useRef(false);
  const refocus = useRef(false);
  const displayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      displayRef.current?.focus();
    }
  }, [editing]);

  function start() {
    if (readOnly) return;
    done.current = false;
    setDraft(value);
    setEditing(true);
  }
  function finish(next: string | null, byKeyboard: boolean) {
    if (done.current) return; // Enter で確定した後の blur などを無視する
    done.current = true;
    refocus.current = byKeyboard;
    setEditing(false);
    if (next !== null && next !== value) onChange(next);
  }
  return {
    editing,
    draft,
    setDraft,
    start,
    displayRef,
    commit: (byKeyboard = false) => finish(draft, byKeyboard),
    commitValue: (v: string) => finish(v, true),
    cancel: (byKeyboard = false) => finish(null, byKeyboard),
  };
}

export function isComposing(e: KeyboardEvent): boolean {
  // 日本語入力の変換確定の Enter では確定しない
  return e.nativeEvent.isComposing || e.keyCode === 229;
}

export function Display(props: {
  label: string;
  readOnly?: boolean;
  onStart(): void;
  displayRef: Ref<HTMLButtonElement>;
  className?: string;
  children: ReactNode;
}) {
  const cls = `ev ${props.className ?? ""}`.trim();
  if (props.readOnly)
    return (
      <span className={cls} aria-label={props.label}>
        {props.children}
      </span>
    );
  return (
    <button type="button" ref={props.displayRef} className={cls} aria-label={props.label} onClick={props.onStart}>
      {props.children}
    </button>
  );
}
