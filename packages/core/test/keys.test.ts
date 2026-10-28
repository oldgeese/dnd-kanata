import { expect, test } from "vitest";
import { decodeKey, encodeKey } from "../src/keys";

test("禁止文字を可逆にエスケープする", () => {
  for (const n of ["a.b", "a$b", "a#b", "a[0]", "a/b", "a%b", "str_mod", "SPELLLV1_2_PREPEARD"]) {
    expect(encodeKey(n)).not.toMatch(/[.$#\[\]\/]/);
    expect(decodeKey(encodeKey(n))).toBe(n);
  }
  expect(encodeKey("str_mod")).toBe("str_mod");
});
