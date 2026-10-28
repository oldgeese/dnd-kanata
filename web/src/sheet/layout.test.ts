import { describe, expect, it } from "vitest";
import type { FormSchema } from "@dnd-kanata/core/browser";
import { buildLayout } from "./layout";

// scripts/gen-schema-fixture.ts（vitest の globalSetup）が生成する。gitignore 済みのため glob で読む。
const fixture = import.meta.glob<FormSchema>("./__fixtures__/schema.json", { eager: true, import: "default" });
const schema = fixture["./__fixtures__/schema.json"];
if (!schema) throw new Error("schema.json がありません。pnpm fixtures を実行してください");

describe("buildLayout", () => {
  const sections = buildLayout(schema);

  it("places every non-hidden field in exactly one section", () => {
    const seen = new Map<string, string[]>();
    for (const s of sections) for (const f of s.fields) seen.set(f, [...(seen.get(f) ?? []), s.id]);
    const expected = Object.keys(schema).filter((k) => schema[k].kind !== "hidden");
    expect(expected.length).toBeGreaterThan(500);
    const missing = expected.filter((k) => !seen.has(k));
    const duplicated = [...seen].filter(([, ids]) => ids.length > 1);
    const unknown = [...seen.keys()].filter((k) => !(k in schema) || schema[k].kind === "hidden");
    expect({ missing, duplicated, unknown }).toEqual({ missing: [], duplicated: [], unknown: [] });
  });

  it("orders sections like the source site", () => {
    expect(sections.map((s) => s.title)).toEqual([
      "基本情報",
      "能力値",
      "セーヴ",
      "技能",
      "戦闘",
      "攻撃",
      "人物像",
      "所持品",
      "特徴・特技",
      "呪文",
    ]);
  });

  it("collects numbered fields in schema order", () => {
    const equip = sections.find((s) => s.id === "equipment")!.fields.filter((f) => f.startsWith("EQUIPMENT_"));
    expect(equip).toHaveLength(39);
    expect(equip[0]).toBe("EQUIPMENT_0");
    expect(equip[38]).toBe("EQUIPMENT_38");
    const spells = sections.find((s) => s.id === "spells")!.fields;
    expect(spells.indexOf("SPELLLV1_SLOTTOTAL")).toBeLessThan(spells.indexOf("SPELLLV1_0"));
    expect(spells.indexOf("SPELLLV1_0")).toBeLessThan(spells.indexOf("SPELLLV2_0"));
  });

  it("ignores fields missing from the schema", () => {
    const s = buildLayout({ char_name: { kind: "text", order: 0 }, last_update: { kind: "hidden", order: 1 } });
    expect(s.flatMap((x) => x.fields)).toEqual(["char_name"]);
  });
});
