import { useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Empty, isComposing, type EditableProps } from "./inline";

// 全角スペース以外の空白で区切る。全角スペースは単語の一部として扱う（前後のものだけ取り除く）
const SEPARATOR = /[^\S　]+/;
const LAST_WORD = /[\S　]*$/;

function splitWords(text: string): string[] {
  return text
    .split(SEPARATOR)
    .map((w) => w.replace(/^　+|　+$/g, ""))
    .filter(Boolean);
}

export function EditableTags({ label, value, onChange, readOnly }: EditableProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tags = [...new Set(splitWords(value))];

  function add(text: string) {
    const next = new Set(tags);
    for (const w of splitWords(text)) next.add(w);
    // 増えないときは保存値を書き換えない
    if (next.size > tags.length) onChange([...next].join(" "));
  }

  // 区切りより前を確定し、最後の単語は入力中のまま残す
  function applyText(text: string) {
    const i = text.search(LAST_WORD);
    add(text.slice(0, i));
    setDraft(text.slice(i));
  }

  function confirmDraft() {
    add(draft);
    setDraft("");
  }

  function remove(tag: string, ev: MouseEvent) {
    onChange(tags.filter((t) => t !== tag).join(" "));
    // キーボード操作ならフォーカスを失わないようにする（タップでは画面キーボードを開かない）
    if (ev.detail === 0) inputRef.current?.focus();
  }

  function onInputChange(ev: ChangeEvent<HTMLInputElement>) {
    // 変換中は分割せず、変換が終わってから区切る
    if ((ev.nativeEvent as InputEvent).isComposing) setDraft(ev.target.value);
    else applyText(ev.target.value);
  }

  function onPaste(ev: ClipboardEvent<HTMLInputElement>) {
    const pasted = ev.clipboardData.getData("text");
    if (!SEPARATOR.test(pasted)) return;
    ev.preventDefault();
    const { selectionStart, selectionEnd } = ev.currentTarget;
    add(draft.slice(0, selectionStart ?? draft.length) + pasted + draft.slice(selectionEnd ?? draft.length));
    setDraft("");
  }

  function onKeyDown(ev: KeyboardEvent<HTMLInputElement>) {
    if (isComposing(ev)) return;
    if (ev.key === "Enter") {
      ev.preventDefault();
      confirmDraft();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      setDraft("");
    }
  }

  if (readOnly && tags.length === 0)
    return (
      <span className="ev" aria-label={label}>
        <Empty />
      </span>
    );

  return (
    <div className="tags">
      {tags.length > 0 && (
        <ul className="tag-list" aria-label={label}>
          {tags.map((t) => (
            <li key={t} className="tag">
              <span>{t}</span>
              {!readOnly && (
                <button type="button" className="tag-remove" aria-label={`${t} を削除`} onClick={(ev) => remove(t, ev)}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <input
          ref={inputRef}
          className="ei tag-input"
          aria-label={label}
          placeholder="半角スペースか Enter で追加"
          value={draft}
          onChange={onInputChange}
          onCompositionEnd={(ev) => applyText(ev.currentTarget.value)}
          onPaste={onPaste}
          onBlur={(ev) => {
            // ウィンドウやタブの切り替えでは確定しない（入力の続きができるように）
            if (document.activeElement !== ev.currentTarget) confirmDraft();
          }}
          onKeyDown={onKeyDown}
        />
      )}
    </div>
  );
}
