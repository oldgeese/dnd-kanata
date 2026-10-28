import iconv from "iconv-lite";
import { getDatabase } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { computeDerived, decodeRecord, parseInputForm, type Fields, type FormSchema } from "@dnd-kanata/core";
import { checkRateLimit } from "./rateLimit";
import { fetchInputForm, postOutput, SourceError } from "./source";

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
  // The password is intentionally NOT normalized (no CP932 variant mapping): it is sent verbatim.
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

export type WriteBackOutcome = "ok" | "bad-password" | "unknown";

export function classifyWriteBackResponse(html: string, id?: number): WriteBackOutcome {
  // Check ok markers first: the display page repeats the sheet's own text, which could contain the bad-password phrase.
  const link = id === undefined ? 'href="INPUT_FORM.php?ID=' : `href="INPUT_FORM.php?ID=${id}"`;
  if (html.includes(link) && html.includes("表示フォーム")) return "ok";
  if (html.includes("パスワードが違います")) return "bad-password";
  return "unknown";
}

export type WriteBackRequest = { sheetId: string; password: string; force?: boolean };
export type WriteBackResponse =
  | { status: "ok" }
  | { status: "source-changed"; sourceLastUpdate: string; currentLastUpdate: string }
  | { status: "unencodable"; fields: string[] }
  | { status: "schema-changed"; added: string[] }
  | { status: "bad-password" };

function sourceError(e: unknown): HttpsError {
  if (e instanceof SourceError && e.code === "not-found") return new HttpsError("not-found", "指定の ID のキャラクターシートが見つかりません。");
  if (e instanceof SourceError) return new HttpsError("unavailable", "元サイトに接続できませんでした。");
  logger.error("writeBack: failed to read the source response", { error: String(e) });
  return new HttpsError("unavailable", "元サイトのフォーム形式が想定と異なります。");
}

export async function writeBackHandler(request: Pick<CallableRequest<WriteBackRequest>, "auth" | "data">): Promise<WriteBackResponse> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です。");
  const { sheetId, password, force } = request.data ?? ({} as Partial<WriteBackRequest>);
  if (typeof sheetId !== "string" || !sheetId || /[.#$\[\]/]/.test(sheetId) || typeof password !== "string" || !password) {
    throw new HttpsError("invalid-argument", "リクエストが正しくありません。");
  }

  await checkRateLimit(uid);

  const sheetRef = getDatabase().ref(`sheets/${sheetId}`);
  const sheet = (await sheetRef.get()).val() as {
    ownerUid: string;
    sourceId: number;
    fields: Fields;
    schema: FormSchema;
    sourceLastUpdate: string;
  } | null;
  // Same error for missing and someone else's sheet, so callers cannot probe which sheet ids exist.
  if (!sheet || sheet.ownerUid !== uid) throw new HttpsError("not-found", "シートが見つかりません。");

  const fields = decodeRecord(sheet.fields ?? {});
  const schema = decodeRecord(sheet.schema ?? {});

  let current: ReturnType<typeof parseInputForm>;
  try {
    current = parseInputForm(await fetchInputForm(sheet.sourceId));
  } catch (e) {
    throw sourceError(e);
  }
  if (current.id !== String(sheet.sourceId)) throw new HttpsError("not-found", "指定の ID のキャラクターシートが見つかりません。");
  if (!current.schema.str) throw new HttpsError("unavailable", "元サイトのフォーム形式が想定と異なります。");
  const added = Object.keys(current.schema).filter((n) => !(n in schema)).sort();
  if (added.length) return { status: "schema-changed", added };
  if (current.lastUpdate !== sheet.sourceLastUpdate && !force) {
    return { status: "source-changed", sourceLastUpdate: sheet.sourceLastUpdate, currentLastUpdate: current.lastUpdate };
  }

  const built = buildWriteBackBody({ id: sheet.sourceId, fields, schema, password, lastUpdate: current.lastUpdate });
  if (!built.ok) return { status: "unencodable", fields: built.unencodable };

  let html: string;
  try {
    html = await postOutput(sheet.sourceId, built.body);
  } catch (e) {
    throw sourceError(e);
  }
  const outcome = classifyWriteBackResponse(html, sheet.sourceId);
  if (outcome === "bad-password") return { status: "bad-password" };
  if (outcome === "unknown") throw new HttpsError("internal", "元サイトの応答を判定できませんでした。");

  // The source already accepted the write; if the re-fetch fails we still report ok
  // (a stale sourceLastUpdate only means the next write-back asks to confirm).
  try {
    const after = parseInputForm(await fetchInputForm(sheet.sourceId));
    await sheetRef.child("sourceLastUpdate").set(after.lastUpdate);
  } catch {
    /* see above */
  }
  return { status: "ok" };
}

export const writeBack = onCall<WriteBackRequest>({ region: "asia-northeast1", invoker: "public" }, writeBackHandler);
