import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import iconv from "iconv-lite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeDerived, parseInputForm, type FormSchema } from "@dnd-kanata/core";
import { buildWriteBackBody, classifyWriteBackResponse } from "../src/writeBack";

const html = iconv.decode(readFileSync(resolve(__dirname, "../../fixtures/input_form_54555.html")), "cp932");
const parsed = parseInputForm(html);

function decodeBody(body: Buffer): [string, string][] {
  const out: [string, string][] = [];
  for (const pair of body.toString("latin1").split("&")) {
    const dec = (s: string) => {
      const bytes: number[] = [];
      for (let i = 0; i < s.length; i++) {
        if (s[i] === "%") {
          bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
          i += 2;
        } else bytes.push(s[i] === "+" ? 0x20 : s.charCodeAt(i));
      }
      return iconv.decode(Buffer.from(bytes), "cp932");
    };
    const i = pair.indexOf("=");
    out.push([dec(pair.slice(0, i)), dec(pair.slice(i + 1))]);
  }
  return out;
}

const build = (over: { fields?: Record<string, string>; schema?: FormSchema; password?: string } = {}) =>
  buildWriteBackBody({
    id: 54555,
    fields: over.fields ?? parsed.fields,
    schema: over.schema ?? parsed.schema,
    password: over.password ?? "pw",
    lastUpdate: parsed.lastUpdate,
  });

afterEach(() => vi.restoreAllMocks());

describe("buildWriteBackBody", () => {
  it("builds a form body from the fixture", () => {
    const r = build();
    if (!r.ok) throw new Error("expected ok");
    const pairs = decodeBody(r.body);
    const m = new Map(pairs);
    expect(m.get("ID")).toBe("54555");
    expect(m.get("UPDATE")).toBe("TRUE");
    expect(m.get("password")).toBe("pw");
    expect(m.get("str_mod")).toBe(computeDerived(parsed.fields).str_mod.value);
    expect(m.has("STR_PROF_ST_CHK")).toBe(false);
    expect(m.get("DEX_PROF_ST_CHK")).toBe("on");
    expect(m.get("char_name")).toBe(parsed.fields.char_name);
    expect(m.get("last_update")).toBe(parsed.lastUpdate);
    expect(pairs.slice(-3).map(([k]) => k)).toEqual(["ID", "UPDATE", "password"]);
  });

  it("round-trips CP932 specials", () => {
    const r = build({ fields: { ...parsed.fields, memo: "〜①髙" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(new Map(decodeBody(r.body)).get("memo")).toBe("～①髙");
  });

  it("reports unencodable fields", () => {
    expect(build({ fields: { ...parsed.fields, memo: "a😀" } })).toEqual({ ok: false, unencodable: ["memo"] });
  });

  it("normalizes variant code points to CP932 forms", () => {
    const r = build({ fields: { ...parsed.fields, memo: "〜‖−¢£¬" } });
    if (!r.ok) throw new Error("expected ok");
    expect(r.body.toString("latin1")).toContain("memo=%81%60%81a%81%7C%81%91%81%92%81%CA");
    expect(new Map(decodeBody(r.body)).get("memo")).toBe("～∥－￠￡￢");
  });

  it("reports unencodable password without leaking it", () => {
    expect(build({ password: "😀" })).toEqual({ ok: false, unencodable: ["password"] });
  });

  it("converts LF to CRLF in textarea fields only", () => {
    const schema: FormSchema = {
      a: { kind: "textarea", order: 1 },
      b: { kind: "text", order: 2 },
    };
    const r = buildWriteBackBody({ id: 1, fields: { a: "x\ny\rz\r\nw", b: "p\nq" }, schema, password: "pw", lastUpdate: "" });
    if (!r.ok) throw new Error("expected ok");
    const m = new Map(decodeBody(r.body));
    expect(m.get("a")).toBe("x\r\ny\r\nz\r\nw");
    expect(m.get("b")).toBe("p\nq");
  });

  it("ignores fields not in schema and encodes reserved bytes", () => {
    const schema: FormSchema = { a: { kind: "text", order: 1 } };
    const r = buildWriteBackBody({ id: 1, fields: { a: "a b&=%*-._~", ghost: "x" }, schema, password: "pw", lastUpdate: "" });
    if (!r.ok) throw new Error("expected ok");
    const s = r.body.toString("latin1");
    expect(s).toContain("a=a+b%26%3D%25*-._%7E");
    expect(s).not.toContain("ghost");
  });

  it("never logs the password", () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    build({ password: "pw-secret" });
    build({ password: "pw-secret", fields: { ...parsed.fields, memo: "😀" } });
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain("pw-secret");
  });
});

describe("classifyWriteBackResponse", () => {
  const fx = (n: string) => iconv.decode(readFileSync(resolve(__dirname, `../../fixtures/${n}`)), "cp932");
  it("classifies the captured responses", () => {
    expect(classifyWriteBackResponse(fx("writeback_ok.html"))).toBe("ok");
    expect(classifyWriteBackResponse(fx("writeback_ok.html"), 54555)).toBe("ok");
    expect(classifyWriteBackResponse(fx("writeback_bad_password.html"))).toBe("bad-password");
  });
  it("requires matching ID when given", () => {
    expect(classifyWriteBackResponse(fx("writeback_ok.html"), 1)).toBe("unknown");
  });
  it("treats anything else as unknown", () => {
    expect(classifyWriteBackResponse("<html></html>")).toBe("unknown");
  });
});
