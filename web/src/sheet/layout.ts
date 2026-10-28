import type { FormSchema } from "@dnd-kanata/core/browser";

export interface Section {
  id: string;
  title: string;
  fields: string[];
}

// 項目名そのもの、または正規表現（一致した項目を schema の order 順に集める）
type Matcher = string | RegExp;

const SECTIONS: { id: string; title: string; match: (schema: FormSchema) => Matcher[] }[] = [
  {
    id: "basic",
    title: "基本情報",
    match: (schema) => [...orderRange(schema, "char_name", "memo"), "img_url", "tag", "no_list"],
  },
  {
    id: "abilities",
    title: "能力値",
    match: () => [/^(str|dex|con|int|wis|cha)(_base|_race|_gain|_mod)?$/, "ability_points", "inspiration", "profeciency_bonus"],
  },
  { id: "saves", title: "セーヴ", match: () => [/^(STR|DEX|CON|INT|WIS|CHA)_(ST|MOD_ST|OTHER_ST|PFOF_ST|PROF_ST_CHK)$/] },
  { id: "skills", title: "技能", match: () => [/^(SKILL|S_ABILITY|S_PROF|S_PROF_MOD|S_MOD)_[A-Z]+$/, /^PASSIVEWISDOMPERCEPTION/] },
  {
    id: "combat",
    title: "戦闘",
    match: () => [/^ac(_|$)/, "ARMOR_MOD_LIMIT", /^initiative/, /movement$/, "max_hp", "current_hp", "temp_hp", "hitdice", /^die_(suc|fail)\d+$/],
  },
  { id: "attacks", title: "攻撃", match: () => [/^attacks_/, "ATTACKSANDSPELLCASTING_TEXT"] },
  { id: "persona", title: "人物像", match: () => ["background", "PERSONALITYTRAITS", "IDEALS", "BONDS", "FLAWS", "SETTING"] },
  {
    id: "equipment",
    title: "所持品",
    match: () => ["PP", "GP", "EP", "SP", "CP", "COINWEIGHT", /^EQUIPMENT(WEGIHT|NUM)?_\d+$/, "COINANDEQUIPMENTWEIGHT"],
  },
  { id: "features", title: "特徴・特技", match: () => ["OTHERPROFICIENCIESANDLANGUAGES", "FEATURESANDTRAITS"] },
  { id: "spells", title: "呪文", match: () => [/^SPELLCASTING/, "SPELLSAVEDC", "SPELLATTACKBONUS", /^SPELLLV/] },
];

// from 〜 to の order にある項目名（元サイトでの並び）
function orderRange(schema: FormSchema, from: string, to: string): string[] {
  const lo = schema[from]?.order;
  const hi = schema[to]?.order;
  if (lo === undefined || hi === undefined) return [from, to];
  return byOrder(schema, Object.keys(schema).filter((k) => schema[k].order >= lo && schema[k].order <= hi));
}

function byOrder(schema: FormSchema, names: string[]): string[] {
  return names.sort((a, b) => schema[a].order - schema[b].order);
}

export function buildLayout(schema: FormSchema): Section[] {
  const visible = Object.keys(schema).filter((k) => schema[k].kind !== "hidden");
  const used = new Set<string>();
  const take = (name: string, out: string[]) => {
    if (used.has(name) || !(name in schema) || schema[name].kind === "hidden") return;
    used.add(name);
    out.push(name);
  };

  const sections: Section[] = SECTIONS.map(({ id, title, match }) => {
    const fields: string[] = [];
    for (const m of match(schema)) {
      if (typeof m === "string") take(m, fields);
      else for (const name of byOrder(schema, visible.filter((k) => m.test(k)))) take(name, fields);
    }
    return { id, title, fields };
  });

  // 元サイトの項目が増えたときに画面から消えないよう、どこにも入らなかった項目を最後に置く
  const rest = byOrder(schema, visible.filter((k) => !used.has(k)));
  if (rest.length) sections.push({ id: "other", title: "その他", fields: rest });
  return sections;
}
