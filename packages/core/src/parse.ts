import { parse, type HTMLElement, type Node } from "node-html-parser";
import type { FieldDef, Fields, FormSchema } from "./types";

// 元 HTML は </option> を省略しているため option も void 扱いにして、直後のテキストをラベルとして拾う
const VOID_TAGS = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr", "option"];

const EXCLUDED_NAMES = new Set(["ID", "UPDATE"]);

export function parseInputForm(html: string): { fields: Fields; schema: FormSchema; id: string; lastUpdate: string } {
  const root = parse(html, { parseNoneClosedTags: true, voidTag: { tags: VOID_TAGS } });
  const form = root.querySelectorAll("form").find((f) => f.getAttribute("name") === "F");
  if (!form) throw new Error("form[name=F] not found");

  const fields: Fields = {};
  const schema: FormSchema = {};
  let id = "";
  let order = 0;

  for (const el of form.querySelectorAll("input, textarea, select")) {
    const name = el.getAttribute("name");
    if (!name) continue;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    if (tag === "input" && (type === "button" || type === "password")) continue;
    if (name === "ID") id = el.getAttribute("value") ?? "";
    if (EXCLUDED_NAMES.has(name)) continue;

    const def: FieldDef = { kind: "text", order: order++ };
    if (el.hasAttribute("readonly")) def.readonly = true;
    let value: string;

    if (tag === "textarea") {
      def.kind = "textarea";
      value = el.text.replace(/\r\n?/g, "\n").replace(/^\n/, ""); // textarea.value と同じく改行は LF に正規化
    } else if (tag === "select") {
      def.kind = "select";
      const opts = readOptions(el.childNodes);
      def.options = opts.map((o) => ({ value: o.value, label: o.label }));
      const chosen = opts.find((o) => o.selected) ?? opts[0];
      value = chosen ? chosen.value : "";
    } else if (type === "checkbox") {
      def.kind = "checkbox";
      def.checkedValue = el.getAttribute("value") ?? "on";
      value = el.hasAttribute("checked") ? def.checkedValue : "";
    } else {
      def.kind = type === "hidden" ? "hidden" : "text";
      value = el.getAttribute("value") ?? "";
    }
    fields[name] = value;
    schema[name] = def;
  }

  return { fields, schema, id, lastUpdate: fields.last_update ?? "" };
}

function readOptions(nodes: Node[]): { value: string; label: string; selected: boolean }[] {
  const out: { value: string; label: string; selected: boolean; el: HTMLElement }[] = [];
  const walk = (list: Node[]) => {
    for (const n of list) {
      if ("tagName" in n) {
        const el = n as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === "optgroup") walk(el.childNodes);
        else if (tag === "option") out.push({ value: "", label: el.text, selected: el.hasAttribute("selected"), el });
      } else if (out.length > 0) {
        out[out.length - 1].label += n.text;
      }
    }
  };
  walk(nodes);
  return out.map((o) => {
    // Like the browser's option.text: strip and collapse ASCII whitespace only (keep U+3000 and NBSP).
    const label = o.label.replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
    return { value: o.el.getAttribute("value") ?? label, label, selected: o.selected };
  });
}
