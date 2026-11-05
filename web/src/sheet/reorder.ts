import type { Fields } from "@dnd-kanata/core/browser";

/**
 * 番号付きスロットに入った行を並べ替える。元サイトは行をスロット番号で持つので、
 * 行の並びを変えたあと、元のスロット番号へ順に値を入れ直す（書き戻しもこの順になる）。
 * 値が変わる項目だけを返す。
 */
export function reorderSlots(args: {
  slots: number[]; // 表示中の行のスロット番号（表示順）
  from: number; // 動かす行の位置（slots の添字）
  to: number; // 動かした先の位置
  cols: (slot: number) => string[]; // 1 行に属する項目名（どのスロットでも同じ並び）
  fields: Fields;
}): Fields {
  const { slots, from, to, cols, fields } = args;
  const rows = slots.map((s) => cols(s).map((c) => fields[c] ?? ""));
  const [moved] = rows.splice(from, 1);
  rows.splice(to, 0, moved);
  const out: Fields = {};
  slots.forEach((s, i) =>
    cols(s).forEach((c, j) => {
      if ((fields[c] ?? "") !== rows[i][j]) out[c] = rows[i][j];
    }),
  );
  return out;
}
