import { describe, expect, it } from "vitest";
import { applyDamage, applyHeal, parseAmount } from "./hp";

describe("applyDamage", () => {
  it("takes damage from temp HP first and the rest from current HP", () => {
    expect(applyDamage({ current: "20", temp: "5" }, 13)).toEqual({ current: "12", temp: "0" });
  });

  it("leaves current HP alone when temp HP absorbs all the damage", () => {
    expect(applyDamage({ current: "20", temp: "5" }, 3)).toEqual({ current: "20", temp: "2" });
  });

  it("leaves an empty current HP empty when temp HP absorbs all the damage", () => {
    expect(applyDamage({ current: "", temp: "5" }, 3)).toEqual({ current: "", temp: "2" });
  });

  it("leaves an empty temp HP empty", () => {
    expect(applyDamage({ current: "20", temp: "" }, 3)).toEqual({ current: "17", temp: "" });
  });

  it("does not go below 0", () => {
    expect(applyDamage({ current: "2", temp: "" }, 13)).toEqual({ current: "0", temp: "" });
  });

  it("treats an empty current HP as 0", () => {
    expect(applyDamage({ current: "", temp: "" }, 3)).toEqual({ current: "0", temp: "" });
  });

  it("treats a non-numeric current HP as 0", () => {
    expect(applyDamage({ current: "abc", temp: "" }, 3)).toEqual({ current: "0", temp: "" });
  });
});

describe("applyHeal", () => {
  it("adds to current HP", () => {
    expect(applyHeal({ current: "7", max: "20" }, 5)).toBe("12");
  });

  it("stops at max HP", () => {
    expect(applyHeal({ current: "12", max: "20" }, 13)).toBe("20");
  });

  it("has no upper limit when max HP is empty", () => {
    expect(applyHeal({ current: "12", max: "" }, 13)).toBe("25");
  });

  it("does not lower a current HP that is already above max HP", () => {
    expect(applyHeal({ current: "25", max: "20" }, 3)).toBe("25");
  });

  it("treats an empty current HP as 0", () => {
    expect(applyHeal({ current: "", max: "20" }, 5)).toBe("5");
    expect(applyHeal({ current: "", max: "3" }, 5)).toBe("3");
  });
});

describe("parseAmount", () => {
  it("accepts a positive integer", () => {
    expect(parseAmount("13")).toBe(13);
  });

  it("accepts full-width digits", () => {
    expect(parseAmount("１３")).toBe(13);
  });

  it.each(["", " ", "0", "-3", "1.5", "abc", "1e3", "99999999999999999999"])("rejects %j", (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });
});
