import { JSDOM } from "jsdom";
import { afterAll, describe, expect, test } from "vitest";
import { computeDerived, DERIVED_FIELDS } from "../src/derive";
import { loadFixture, loadSourceJs } from "./loadFixture";

const html = loadFixture();
const sourceJs = loadSourceJs();

const SKILLS = [
  "ACROBATICS", "ANIMALHANDLING", "ARCANA", "ATHLETICS", "DECEPTION", "HISTORY", "INSIGHT", "INTIMIDATION", "INVESTIGATION",
  "MEDICINE", "NATURE", "PERCEPTION", "PERFORMANCE", "PERSUASION", "RELIGION", "SLEGHTOFHAND", "STEALTH", "SURVIVAL",
];
const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

type Form = HTMLFormElement;

// parseInputForm と同じ規則でフォーム現在値を取り出す
function readFormFields(form: Form): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of Array.from(form.elements) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[]) {
    const name = el.getAttribute("name");
    if (!name || name === "ID" || name === "UPDATE") continue;
    const type = (el as HTMLInputElement).type;
    if (el.tagName === "INPUT" && (type === "button" || type === "password")) continue;
    if (el.tagName === "INPUT" && type === "checkbox") {
      out[name] = (el as HTMLInputElement).checked ? el.getAttribute("value") ?? "on" : "";
    } else {
      out[name] = el.value;
    }
  }
  return out;
}

interface Case {
  label: string;
  set?: Record<string, string>;
  flip?: string[];
  remove?: string[]; // フォームから取り除く要素（片方の欄がない装備行など）
}

const cases: Case[] = [{ label: "unchanged" }];
for (const v of [...Array.from({ length: 30 }, (_, i) => String(i + 1)), "", "abc", "+2", " 3"]) cases.push({ label: `dex=${JSON.stringify(v)}`, set: { dex: v } });
for (let l = 1; l <= 20; l++) cases.push({ label: `level=${l}`, set: { char_level: String(l) } });
for (const v of ["", "0", "-1", "4.5", "17", "21", "abc", " 3", "+2", "0x10", "1.5"]) cases.push({ label: `level=${JSON.stringify(v)}`, set: { char_level: v } });
for (const v of ["NA", "MAX2", "ZERO", ""]) for (const dex of ["8", "14", "20"]) cases.push({ label: `armor=${JSON.stringify(v)} dex=${dex}`, set: { ARMOR_MOD_LIMIT: v, dex } });
for (const v of ["abc", " 12", "1e1", "-5", "0", "99"]) for (const s of ["str", "con", "int", "wis", "cha"]) cases.push({ label: `${s}=${JSON.stringify(v)}`, set: { [s]: v } });
for (const a of ABILITIES) cases.push({ label: `flip ${a} save`, flip: [`${a}_PROF_ST_CHK`] });
for (const s of SKILLS) cases.push({ label: `flip ${s}`, flip: [`S_PROF_${s}`] });
for (const c of ["PP", "GP", "EP", "SP", "CP"]) for (const v of ["0", "7", "12345", "1.5", ""]) cases.push({ label: `${c}=${JSON.stringify(v)}`, set: { [c]: v } });
for (let g = 1; g <= 40; g++) cases.push({ label: `GP=${g}.5 (floor edge)`, set: { GP: `${g}.5`, PP: "0", EP: "0", SP: "0", CP: "0" } });
for (const a of ABILITIES) for (const b of ["8", "14", "15"]) cases.push({ label: `${a.toLowerCase()}_base=${b}`, set: { [`${a.toLowerCase()}_base`]: b } });
cases.push({ label: "float rounding", set: { EQUIPMENTWEGIHT_0: "0.1", EQUIPMENTNUM_0: "3" } });
cases.push({ label: "float rounding 2", set: { EQUIPMENTWEGIHT_0: "0.1", EQUIPMENTNUM_0: "3", EQUIPMENTWEGIHT_1: "0.7", EQUIPMENTNUM_1: "3", GP: "13" } });
cases.push({ label: "str_base=7", set: { str_base: "7" } });
for (const b of ["8", "15", "16", ""]) cases.push({ label: `dex_base=${JSON.stringify(b)}`, set: { dex_base: b } });
for (const n of ["initiative_other_mod", "STR_OTHER_ST", "DEX_OTHER_ST", "S_MOD_PERCEPTION", "S_MOD_STEALTH", "PASSIVEWISDOMPERCEPTION_OTHER", "base_movement", "equip_movement", "item_movement", "other_movement", "ac_base", "ac_mod_armor", "ac_mod_shield", "ac_mod_other"])
  for (const v of ["2", "-1", "x"]) cases.push({ label: `${n}=${v}`, set: { [n]: v } });
// 装備行の重さ・個数のどちらかがない行は合計に入れない
for (const [i, missing] of [[2, "EQUIPMENTNUM"], [20, "EQUIPMENTWEGIHT"], [38, "EQUIPMENTNUM"]] as const)
  cases.push({
    label: `equipment row ${i} without ${missing}`,
    set: { [`EQUIPMENTWEGIHT_${i}`]: "2.5", [`EQUIPMENTNUM_${i}`]: "4" },
    remove: [`${missing}_${i}`],
  });
cases.push({ label: "equipment row 38 without both", remove: ["EQUIPMENTWEGIHT_38", "EQUIPMENTNUM_38"] });
for (const v of ["", "garbage"]) cases.push({ label: `stale ac_mod_ability ${JSON.stringify(v)} with unknown armor`, set: { ARMOR_MOD_LIMIT: "", ac_mod_ability: v } });

describe("computeDerived vs original dddb5e.js", () => {
  test("case count", () => expect(cases.length).toBeGreaterThan(200));

  // JSDOM と dddb5e.js の読み込みは重いので 1 回だけ行い、ケースごとにフォームを初期値へ戻して使い回す。
  // 自前の計算はフォームから読んだ値だけを入力にするので、元の JS に状態が残っても一致を誤って通すことはない
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  const w = dom.window as unknown as Window & Record<string, any>;
  w.alert = () => {};
  w.confirm = () => true;
  const form = w.document.forms.namedItem("F") as Form;

  // jsdom の form は名前付きプロパティ（document.F.str など）を持たないため、ブラウザ同様に要素名で解決できるようにする
  // （HTMLFormElement は [LegacyOverrideBuiltIns] なので、名前付き要素が組み込みプロパティより優先される）。
  // 毎回 namedItem で引くと遅いので要素を先に引いておき、取り除いた要素は namedItem と同じく null にする
  for (const el of Array.from(form.elements)) {
    const name = el.getAttribute("name");
    if (!name) continue;
    const found = form.elements.namedItem(name) as Element;
    Object.defineProperty(form, name, { get: () => (found.isConnected ? found : null), configurable: true });
  }
  // jsdom の getElementsByName は呼ぶたびに文書全体を走査し、dddb5e.js の技能計算で 1 ケース 100ms 以上かかる。
  // 要素の並びはケース間で変わらない（取り除いた要素は除く）ので、名前ごとの結果を使い回す
  const byName = new Map<string, Element[]>();
  const getElementsByName = w.document.getElementsByName.bind(w.document);
  Object.defineProperty(w.document, "getElementsByName", {
    value: (name: string) => {
      if (!byName.has(name)) byName.set(name, Array.from(getElementsByName(name)));
      return byName.get(name)!.filter((el) => el.isConnected);
    },
    configurable: true,
  });
  w.eval(sourceJs);
  type Ctl = HTMLInputElement;
  const initial = (Array.from(form.elements) as Ctl[]).map((el) => ({ el, parent: el.parentNode!, next: el.nextSibling, value: el.value, checked: el.checked }));
  function reset() {
    for (const s of initial) {
      if (!s.el.isConnected) s.parent.insertBefore(s.el, s.next);
      s.el.value = s.value;
      s.el.checked = s.checked;
    }
  }
  afterAll(() => dom.window.close());

  test.each(cases.map((c) => [c.label, c] as const))("%s", (_label, c) => {
    reset();
    for (const [k, v] of Object.entries(c.set ?? {})) {
      (form.elements.namedItem(k) as HTMLInputElement).value = v;
    }
    for (const k of c.flip ?? []) {
      const el = form.elements.namedItem(k) as HTMLInputElement;
      el.checked = !el.checked;
    }
    for (const k of c.remove ?? []) (form.elements.namedItem(k) as HTMLInputElement).remove();

    const input = readFormFields(form);
    w.eval("calc_all(); CGP(); divideChange();");
    const mine = computeDerived(input);

    const diffs: string[] = [];
    for (const name of DERIVED_FIELDS) {
      const el = form.elements.namedItem(name) as HTMLInputElement | null;
      if (!el) {
        diffs.push(`${name}: not in form`);
        continue;
      }
      if (mine[name]?.value !== el.value) diffs.push(`${name}: mine=${JSON.stringify(mine[name]?.value)} original=${JSON.stringify(el.value)}`);
    }
    expect(diffs).toEqual([]);
  });
});
