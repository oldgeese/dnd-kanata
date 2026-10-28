import type { Derived, Fields } from "./types";

// dddb5e.js の calc_all() → CGP() → divideChange() を純粋関数に移植したもの。
// フォームの値は常に文字列であり、数値を代入すると String(number) になる点まで元 JS と合わせる。

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
type Ability = (typeof ABILITIES)[number];

// CSKILL() の対応表（綴りは元のまま）
const SKILLS: readonly (readonly [string, Ability])[] = [
  ["ACROBATICS", "DEX"],
  ["ANIMALHANDLING", "WIS"],
  ["ARCANA", "INT"],
  ["ATHLETICS", "STR"],
  ["DECEPTION", "CHA"],
  ["HISTORY", "INT"],
  ["INSIGHT", "WIS"],
  ["INTIMIDATION", "CHA"],
  ["INVESTIGATION", "INT"],
  ["MEDICINE", "WIS"],
  ["NATURE", "INT"],
  ["PERCEPTION", "WIS"],
  ["PERFORMANCE", "CHA"],
  ["PERSUASION", "CHA"],
  ["RELIGION", "INT"],
  ["SLEGHTOFHAND", "DEX"],
  ["STEALTH", "DEX"],
  ["SURVIVAL", "WIS"],
];

export const DERIVED_FIELDS: readonly string[] = [
  ...ABILITIES.map((a) => `${a.toLowerCase()}_mod`),
  "initiative_dex_mod",
  "initiative",
  "ac_mod_ability",
  "ac",
  "profeciency_bonus",
  ...ABILITIES.map((a) => `${a}_MOD_ST`),
  ...ABILITIES.map((a) => `${a}_PFOF_ST`),
  ...ABILITIES.map((a) => `${a}_ST`),
  ...SKILLS.flatMap(([s]) => [`S_ABILITY_${s}`, `S_PROF_MOD_${s}`, `SKILL_${s}`]),
  "PASSIVEWISDOMPERCEPTION",
  "movement",
  "COINWEIGHT",
  "COINANDEQUIPMENTWEIGHT",
  "ability_points",
];

function intval(v: string): number {
  const r = parseInt(v);
  return isNaN(r) ? 0 : r;
}
function floatval(v: string): number {
  const r = parseFloat(v);
  return isNaN(r) ? 0 : r;
}
// 元 JS は数値を暗黙に文字列化して parseInt/parseFloat に渡す
const intvalN = (n: number) => intval(String(n));
const floatvalN = (n: number) => floatval(String(n));

function ability2mod(val: string): number | "" {
  if (val === "") return "";
  return parseInt(String(Math.ceil((Number(val) - 11) / 2)));
}

function getAbilityPoint(ability: string): number {
  const n = Number(ability); // `ability == 8` は文字列を数値化して比較される
  if (n === 8) return 0;
  if (n === 9) return 1;
  if (n === 10) return 2;
  if (n === 11) return 3;
  if (n === 12) return 4;
  if (n === 13) return 5;
  if (n === 14) return 7;
  if (n === 15) return 9;
  return NaN; // undefined を返す元 JS は足し算で NaN になる
}

export function computeDerived(fields: Fields): Record<string, Derived> {
  // 入力値のコピー。元 JS が書き込む項目はここへ文字列で上書きしていく。
  const f: Record<string, string> = { ...fields };
  const get = (name: string): string => f[name] ?? "";
  const set = (name: string, v: string | number): void => {
    f[name] = String(v);
  };
  const exists = (name: string): boolean => name in f;

  // --- onCStat ---
  const rawMod = {} as Record<Ability, number | "">;
  for (const a of ABILITIES) rawMod[a] = ability2mod(get(a.toLowerCase()));
  for (const a of ABILITIES) set(`${a.toLowerCase()}_mod`, intvalN(rawMod[a] as number));
  const modOf = (a: Ability) => get(`${a.toLowerCase()}_mod`);

  set("initiative_dex_mod", modOf("DEX"));
  set("initiative", intval(get("initiative_dex_mod")) + intval(get("initiative_other_mod")));

  const limit = get("ARMOR_MOD_LIMIT");
  if (limit === "NA" || limit === "") set("ac_mod_ability", modOf("DEX"));
  if (limit === "MAX2") {
    let tmp: string | number = modOf("DEX");
    if (Number(tmp) >= 2) tmp = 2;
    set("ac_mod_ability", tmp);
  }
  if (limit === "ZERO") set("ac_mod_ability", 0);
  // それ以外のとき ac_mod_ability は入力値のまま

  const level = Number(get("char_level"));
  if (level >= 1 && level <= 4) set("profeciency_bonus", "2");
  else if (level >= 5 && level <= 8) set("profeciency_bonus", "3");
  else if (level >= 9 && level <= 12) set("profeciency_bonus", "4");
  else if (level >= 13 && level <= 16) set("profeciency_bonus", "5");
  else if (level >= 17) set("profeciency_bonus", "6");
  // 範囲外のとき profeciency_bonus は入力値のまま

  // chk_cb
  const checked = (name: string) => get(name) !== "";
  for (const a of ABILITIES) {
    set(`${a}_PFOF_ST`, checked(`${a}_PROF_ST_CHK`) ? get("profeciency_bonus") : "");
  }
  // CST
  set(
    "ac",
    intval(get("ac_base")) +
      intval(get("ac_mod_ability")) +
      intval(get("ac_mod_armor")) +
      intval(get("ac_mod_shield")) +
      intval(get("ac_mod_other")),
  );
  for (const a of ABILITIES) set(`${a}_MOD_ST`, rawMod[a]); // "" か数値（NaN もそのまま）
  for (const a of ABILITIES) {
    set(`${a}_ST`, intvalN(rawMod[a] as number) + intval(get(`${a}_OTHER_ST`)) + intval(get(`${a}_PFOF_ST`)));
  }

  // CSKILL
  for (const [s, a] of SKILLS) set(`S_ABILITY_${s}`, intvalN(rawMod[a] as number));
  for (const [s] of SKILLS) {
    set(`S_PROF_MOD_${s}`, checked(`S_PROF_${s}`) ? get("profeciency_bonus") : "");
    set(`SKILL_${s}`, intval(get(`S_ABILITY_${s}`)) + intval(get(`S_PROF_MOD_${s}`)) + intval(get(`S_MOD_${s}`)));
  }
  set("PASSIVEWISDOMPERCEPTION", intval(get("SKILL_PERCEPTION")) + 10 + intval(get("PASSIVEWISDOMPERCEPTION_OTHER")));

  // CSPEED
  set(
    "movement",
    intval(get("base_movement")) + intval(get("equip_movement")) + intval(get("item_movement")) + intval(get("other_movement")),
  );
  const movementSq = intvalN(intval(get("movement")) / 5);
  set("movement", `${get("movement")}ft./${movementSq}sq.`);

  // --- CGP（COINWEIGHT）→ CWEIGHT ---
  set(
    "COINWEIGHT",
    floatvalN(Number(get("PP")) * 0.02) +
      floatvalN(Number(get("GP")) * 0.02) +
      floatvalN(Number(get("EP")) * 0.02) +
      floatvalN(Number(get("SP")) * 0.02) +
      floatvalN(Number(get("CP")) * 0.02),
  );
  set("COINWEIGHT", Math.floor(Number(get("COINWEIGHT")) * 100) / 100);

  let normalItemW = 0;
  for (let i = 0; i < 39; i++) {
    if (exists(`EQUIPMENTWEGIHT_${i}`) && exists(`EQUIPMENTNUM_${i}`)) {
      normalItemW = floatvalN(normalItemW) + floatvalN(Number(get(`EQUIPMENTWEGIHT_${i}`)) * Number(get(`EQUIPMENTNUM_${i}`)));
    }
  }
  const gpW = floatval(get("COINWEIGHT"));
  set("COINANDEQUIPMENTWEIGHT", floatvalN(normalItemW) + floatvalN(gpW));
  set("COINANDEQUIPMENTWEIGHT", Math.floor(Number(get("COINANDEQUIPMENTWEIGHT")) * 100) / 100);

  // --- divideChange ---
  set(
    "ability_points",
    27 -
      (getAbilityPoint(get("str_base")) +
        getAbilityPoint(get("dex_base")) +
        getAbilityPoint(get("con_base")) +
        getAbilityPoint(get("int_base")) +
        getAbilityPoint(get("wis_base")) +
        getAbilityPoint(get("cha_base"))),
  );

  // --- 出力 ---
  const out: Record<string, Derived> = {};
  for (const name of DERIVED_FIELDS) out[name] = { value: get(name) };

  const part = (label: string, name: string) => ({ label, value: String(intval(get(name))) });
  out.ac.parts = [
    part("基本", "ac_base"),
    part("能力値", "ac_mod_ability"),
    part("鎧", "ac_mod_armor"),
    part("盾", "ac_mod_shield"),
    part("その他", "ac_mod_other"),
  ];
  out.initiative.parts = [part("DEX", "initiative_dex_mod"), part("その他", "initiative_other_mod")];
  for (const a of ABILITIES) {
    out[`${a}_ST`].parts = [part(a, `${a.toLowerCase()}_mod`), part("習熟", `${a}_PFOF_ST`), part("その他", `${a}_OTHER_ST`)];
  }
  for (const [s, a] of SKILLS) {
    out[`SKILL_${s}`].parts = [part(a, `S_ABILITY_${s}`), part("習熟", `S_PROF_MOD_${s}`), part("その他", `S_MOD_${s}`)];
  }
  out.PASSIVEWISDOMPERCEPTION.parts = [
    { label: "基本", value: "10" },
    part("知覚", "SKILL_PERCEPTION"),
    part("その他", "PASSIVEWISDOMPERCEPTION_OTHER"),
  ];
  return out;
}
