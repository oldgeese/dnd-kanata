import { expect, test } from "vitest";
import { computeDerived } from "../src/derive";

const base = { str: "11", dex: "18", con: "10", int: "", wis: "12", cha: "10", char_level: "10", ARMOR_MOD_LIMIT: "MAX2", ac_base: "10", S_PROF_STEALTH: "on", PP: "1", GP: "100", EP: "", SP: "", CP: "" };

test("computeDerived basics", () => {
  const d = computeDerived(base);
  expect(d.dex_mod.value).toBe("4");
  expect(d.int_mod.value).toBe("0");
  expect(d.INT_MOD_ST.value).toBe("");
  expect(d.profeciency_bonus.value).toBe("4");
  expect(d.ac_mod_ability.value).toBe("2");
  expect(d.SKILL_STEALTH.value).toBe("8");
  expect(d.SKILL_STEALTH.parts).toEqual([{ label: "DEX", value: "4" }, { label: "習熟", value: "4" }, { label: "その他", value: "0" }]);
  expect(d.COINWEIGHT.value).toBe("2.02");
  expect(computeDerived({ ...base, char_level: "" }).profeciency_bonus.value).toBe("");
});
