import { describe, expect, it } from "vitest";
import { reorderSlots } from "./reorder";

const cols = (i: number) => [`a_${i}`, `b_${i}`];

describe("reorderSlots", () => {
  it("行を動かすと、元のスロット番号へ順に値を入れ直す", () => {
    const fields = { a_0: "A", b_0: "1", a_1: "B", b_1: "2", a_2: "C", b_2: "3" };
    expect(reorderSlots({ slots: [0, 1, 2], from: 2, to: 0, cols, fields })).toEqual({
      a_0: "C",
      b_0: "3",
      a_1: "A",
      b_1: "1",
      a_2: "B",
      b_2: "2",
    });
  });

  it("値が変わらない項目は返さない", () => {
    const fields = { a_0: "A", b_0: "x", a_1: "B", b_1: "x" };
    expect(reorderSlots({ slots: [0, 1], from: 0, to: 1, cols, fields })).toEqual({ a_0: "B", a_1: "A" });
  });

  it("スロット番号が飛んでいても、表示中のスロットの中で入れ替える", () => {
    const fields = { a_1: "A", a_4: "B", a_7: "C", a_2: "untouched" };
    expect(reorderSlots({ slots: [1, 4, 7], from: 0, to: 2, cols: (i) => [`a_${i}`], fields })).toEqual({
      a_1: "B",
      a_4: "C",
      a_7: "A",
    });
  });

  it("未設定の項目は空文字として扱う", () => {
    const fields = { a_0: "A" };
    expect(reorderSlots({ slots: [0, 1], from: 0, to: 1, cols, fields })).toEqual({ a_0: "", a_1: "A" });
  });

  it("同じ位置へ動かしたときは何も返さない", () => {
    expect(reorderSlots({ slots: [0, 1], from: 1, to: 1, cols, fields: { a_0: "A", a_1: "B" } })).toEqual({});
  });
});
