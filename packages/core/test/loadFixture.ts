import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import iconv from "iconv-lite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(name: string): Buffer {
  const p = resolve(root, "fixtures", name);
  if (!existsSync(p)) throw new Error(`${p} がありません。npm run fixtures を実行してください`);
  return readFileSync(p);
}

export function loadFixture(): string {
  return iconv.decode(read("input_form_54555.html"), "cp932");
}

export function loadSourceJs(): string {
  return iconv.decode(read("dddb5e.js"), "cp932");
}
