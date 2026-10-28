import { useState } from "react";
import type { Derived } from "@dnd-kanata/core/browser";
import { Empty } from "./inline";

export function formatParts(parts: Derived["parts"]): string | undefined {
  return parts?.map((p) => `${p.label}${p.value.startsWith("-") ? "" : "+"}${p.value}`).join(" / ");
}

// 編集不可の派生値。内訳はマウスを重ねると title で、タップすると下に表示する。
export function DerivedValue({ label, derived, className }: { label: string; derived: Derived; className?: string }) {
  const [open, setOpen] = useState(false);
  const breakdown = formatParts(derived.parts);
  const cls = `dv ${className ?? ""}`.trim();
  const content = derived.value === "" ? <Empty /> : derived.value;
  if (!breakdown)
    return (
      <span className={cls} aria-label={label}>
        {content}
      </span>
    );
  return (
    <span className="dv-wrap">
      <button type="button" className={cls} aria-label={label} title={breakdown} aria-expanded={open} onClick={() => setOpen(!open)}>
        {content}
      </button>
      {open && <span className="dv-parts">{breakdown}</span>}
    </span>
  );
}
