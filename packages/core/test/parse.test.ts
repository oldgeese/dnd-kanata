import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { parseInputForm } from "../src/parse";
import { loadFixture } from "./loadFixture";

describe("parseInputForm", () => {
  test("fixture", () => {
    const r = parseInputForm(loadFixture());
    expect(r.id).toBe("54555");
    // last_update changes whenever the live source sheet is saved, so check only its format.
    expect(r.lastUpdate).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(r.fields.str).toBe("11");
    expect(r.fields.str_base).toBe("9");
    expect(r.fields.char_level).toBe("10");
    expect(r.fields.ARMOR_MOD_LIMIT).toBe("MAX2");
    expect(r.schema.DEX_PROF_ST_CHK).toMatchObject({ kind: "checkbox", checkedValue: "on" });
    expect(r.fields.DEX_PROF_ST_CHK).toBe("on");
    expect(r.fields.STR_PROF_ST_CHK).toBe("");
    expect(r.schema.no_list.checkedValue).toBe("true");
    expect(r.schema.alignment.options).toHaveLength(9);
    expect(r.schema.str_mod.readonly).toBe(true);
    expect(r.fields).not.toHaveProperty("password");
    expect(r.fields).not.toHaveProperty("ID");
    expect(r.fields).not.toHaveProperty("UPDATE");
    expect(Object.keys(r.schema)).toHaveLength(582);
  });

  test("textarea entities, select default, order", () => {
    const r = parseInputForm(
      `<form name="F"><input name="a" value="1"><textarea name="t">&lt;x&gt; &amp;</textarea>` +
        `<select name="s"><option value="p">P</option><option value="q">Q</option></select></form>`,
    );
    expect(r.fields).toEqual({ a: "1", t: "<x> &", s: "p" });
    expect(r.schema.t).toMatchObject({ kind: "textarea", order: 1 });
    expect(r.schema.s.options).toEqual([{ value: "p", label: "P" }, { value: "q", label: "Q" }]);
  });

  test("matches the browser's parse (jsdom): names, order, values", () => {
    const html = loadFixture();
    const r = parseInputForm(html);
    const form = new JSDOM(html).window.document.forms.namedItem("F")!;
    const expected: Record<string, string> = {};
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      const name = el.getAttribute("name");
      if (!name || name === "ID" || name === "UPDATE" || el.type === "button" || el.type === "password") continue;
      expected[name] = el.type === "checkbox" ? (el.checked ? el.getAttribute("value") ?? "on" : "") : el.value;
    }
    expect(Object.keys(r.fields)).toEqual(Object.keys(expected));
    expect(r.fields).toEqual(expected);
    expect(Object.values(r.schema).map((d) => d.order)).toEqual(Object.keys(expected).map((_, i) => i));
  });
});
