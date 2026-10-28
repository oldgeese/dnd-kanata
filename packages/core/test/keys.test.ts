import { expect, test } from "vitest";
import { decodeKey, decodeRecord, encodeKey, encodeRecord } from "../src/keys";

test("禁止文字を可逆にエスケープする", () => {
  for (const n of ["a.b", "a$b", "a#b", "a[0]", "a/b", "a%b", "%41", "a%2Eb", "str_mod", "SPELLLV1_2_PREPEARD"]) {
    expect(encodeKey(n)).not.toMatch(/[.$#\[\]\/]/);
    expect(decodeKey(encodeKey(n))).toBe(n);
  }
  expect(encodeKey("str_mod")).toBe("str_mod");
});

test("%XX のような名前もエスケープして元に戻せる", () => {
  expect(encodeKey("%41")).toBe("%2541");
  expect(decodeKey("%2541")).toBe("%41");
  expect(decodeKey(encodeKey("a%2Eb"))).toBe("a%2Eb");
});

test("encodeRecord / decodeRecord はキーだけを変換し、値はそのまま", () => {
  const r = { "a.b": "1", "%41": "2", plain: "3.4" };
  const enc = encodeRecord(r);
  expect(enc).toEqual({ "a%2Eb": "1", "%2541": "2", plain: "3.4" });
  expect(decodeRecord(enc)).toEqual(r);
});
