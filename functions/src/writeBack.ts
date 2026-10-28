import iconv from "iconv-lite";
import { computeDerived, type Fields, type FormSchema } from "@dnd-kanata/core";

type BuildResult = { ok: true; body: Buffer } | { ok: false; unencodable: string[] };

const SAFE = /[A-Za-z0-9*\-._]/;

// Code points that IMEs/macOS emit but CP932 only has under a different code point.
const CP932_VARIANTS: Record<string, string> = {
  "\u301C": "\uFF5E",
  "\u2016": "\u2225",
  "\u2212": "\uFF0D",
  "\u00A2": "\uFFE0",
  "\u00A3": "\uFFE1",
  "\u00AC": "\uFFE2",
};
export function normalizeForCp932(s: string): string {
  return s.replace(/[\u301C\u2016\u2212\u00A2\u00A3\u00AC]/g, (c) => CP932_VARIANTS[c]);
}

function encodeCp932(s: string): Buffer | null {
  const bytes = iconv.encode(s, "cp932");
  return iconv.decode(bytes, "cp932") === s ? bytes : null;
}

function percentEncode(bytes: Buffer): string {
  let out = "";
  for (const b of bytes) {
    const c = String.fromCharCode(b);
    if (b === 0x20) out += "+";
    else if (b < 0x80 && SAFE.test(c)) out += c;
    else out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

// Never log anything here: the password passes through this function.
export function buildWriteBackBody(args: {
  id: number;
  fields: Fields;
  schema: FormSchema;
  password: string;
  lastUpdate: string;
}): BuildResult {
  const { id, fields, schema, password, lastUpdate } = args;
  const values: Fields = { ...fields };
  for (const [name, d] of Object.entries(computeDerived(fields))) {
    if (name in schema) values[name] = d.value;
  }
  if ("last_update" in schema) values.last_update = lastUpdate;

  const names = Object.keys(schema).sort((a, b) => schema[a].order - schema[b].order);
  const pairs: [string, string][] = [];
  for (const name of names) {
    const def = schema[name];
    let v = values[name] ?? "";
    if (def.kind === "checkbox" && v === "") continue;
    if (def.kind === "textarea") v = v.replace(/\r\n|\r|\n/g, "\r\n");
    pairs.push([name, normalizeForCp932(v)]);
  }
  if (!("last_update" in schema)) pairs.push(["last_update", lastUpdate]);
  pairs.push(["ID", String(id)], ["UPDATE", "TRUE"], ["password", password]);

  const unencodable: string[] = [];
  const parts: string[] = [];
  for (const [k, v] of pairs) {
    const kb = encodeCp932(k);
    const vb = encodeCp932(v);
    if (!kb || !vb) {
      unencodable.push(k);
      continue;
    }
    parts.push(`${percentEncode(kb)}=${percentEncode(vb)}`);
  }
  if (unencodable.length) return { ok: false, unencodable };
  return { ok: true, body: Buffer.from(parts.join("&"), "latin1") };
}
