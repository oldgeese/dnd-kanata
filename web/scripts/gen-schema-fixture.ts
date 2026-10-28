// layout.test 用に、元サイトのフォーム（fixtures/input_form_54555.html, CP932）から schema を JSON にする。
// vitest の globalSetup として実行する。生成物は gitignore 済み。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import iconv from "iconv-lite";
import { parseInputForm } from "@dnd-kanata/core";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../fixtures/input_form_54555.html");
const out = resolve(here, "../src/sheet/__fixtures__/schema.json");

export default function setup(): void {
  if (!existsSync(src)) throw new Error(`${src} がありません。pnpm fixtures を実行してください`);
  const { schema } = parseInputForm(iconv.decode(readFileSync(src), "cp932"));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(schema, null, 1) + "\n");
}
