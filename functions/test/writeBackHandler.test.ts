import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import iconv from "iconv-lite";
import { initializeApp, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { importSheetHandler } from "../src/importSheet";
import { writeBackHandler } from "../src/writeBack";

const fx = (n: string) => readFileSync(resolve(__dirname, `../../fixtures/${n}`));
const form = fx("input_form_54555.html");
const formText = iconv.decode(form, "cp932");
const NEW_LU = "2099/01/01 00:00";
const formChanged = (lu: string) => iconv.encode(formText.replace(/(name='last_update' value=')[^']*/, `$1${lu}`), "cp932");
const res200 = (b: Buffer) => new Response(b, { status: 200 });

beforeAll(() => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error("Database emulator required.");
  if (getApps().length === 0) initializeApp({ projectId: "demo-dnd-kanata", databaseURL: "http://127.0.0.1:9000/?ns=demo-dnd-kanata" });
});

let fetchMock: ReturnType<typeof vi.fn>;
let sheetId: string;
let post: Buffer | undefined;
let postResponse: Buffer;
let inputForms: Buffer[];
const read = async (p: string) => (await getDatabase().ref(p).get()).val();
const call = (uid: string | null, data: unknown) => writeBackHandler({ auth: uid ? ({ uid } as never) : undefined, data: data as never });

beforeEach(async () => {
  await getDatabase().ref().set(null);
  post = undefined;
  postResponse = fx("writeback_ok.html");
  inputForms = [form];
  fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: Buffer }) => {
    if (init?.method === "POST") {
      post = init.body;
      return res200(postResponse);
    }
    return res200(inputForms.length > 1 ? inputForms.shift()! : inputForms[0]);
  });
  vi.stubGlobal("fetch", fetchMock);
  sheetId = (await importSheetHandler({ auth: { uid: "u1" } as never, data: { source: "54555" } })).sheetId;
  fetchMock.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const posts = () => fetchMock.mock.calls.filter((c) => c[1]?.method === "POST").length;

describe("writeBack", () => {
  it("requires auth, owner, and a known sheet", async () => {
    await expect(call(null, { sheetId, password: "pw" })).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(call("u2", { sheetId, password: "pw" })).rejects.toMatchObject({ code: "not-found", message: "シートが見つかりません。" });
    await expect(call("u1", { sheetId: "nope", password: "pw" })).rejects.toMatchObject({ code: "not-found", message: "シートが見つかりません。" });
    await expect(call("u1", { sheetId })).rejects.toMatchObject({ code: "invalid-argument" });
    expect(posts()).toBe(0);
  });

  it("returns source-changed without POSTing", async () => {
    await getDatabase().ref(`sheets/${sheetId}/sourceLastUpdate`).set("old");
    const r = await call("u1", { sheetId, password: "pw" });
    expect(r).toMatchObject({ status: "source-changed", sourceLastUpdate: "old" });
    expect(posts()).toBe(0);
  });

  it("POSTs with force despite source change", async () => {
    await getDatabase().ref(`sheets/${sheetId}/sourceLastUpdate`).set("old");
    expect(await call("u1", { sheetId, password: "pw", force: true })).toEqual({ status: "ok" });
    expect(posts()).toBe(1);
  });

  it("returns schema-changed when the source gained fields", async () => {
    inputForms = [iconv.encode(formText.replace("</form>", '<input type="text" name="brand_new" value=""></form>'), "cp932")];
    const r = await call("u1", { sheetId, password: "pw" });
    expect(r).toEqual({ status: "schema-changed", added: ["brand_new"] });
    expect(posts()).toBe(0);
  });

  it("returns schema-changed even with force", async () => {
    await getDatabase().ref(`sheets/${sheetId}/sourceLastUpdate`).set("old");
    inputForms = [iconv.encode(formText.replace("</form>", '<input type="text" name="brand_new" value=""></form>'), "cp932")];
    expect(await call("u1", { sheetId, password: "pw", force: true })).toEqual({ status: "schema-changed", added: ["brand_new"] });
    expect(posts()).toBe(0);
  });

  it("returns unencodable even with force", async () => {
    await getDatabase().ref(`sheets/${sheetId}/sourceLastUpdate`).set("old");
    await getDatabase().ref(`sheets/${sheetId}/fields/memo`).set("😀");
    expect(await call("u1", { sheetId, password: "pw", force: true })).toEqual({ status: "unencodable", fields: ["memo"] });
    expect(posts()).toBe(0);
  });

  it("returns unencodable without POSTing", async () => {
    await getDatabase().ref(`sheets/${sheetId}/fields/memo`).set("😀");
    expect(await call("u1", { sheetId, password: "pw" })).toEqual({ status: "unencodable", fields: ["memo"] });
    expect(posts()).toBe(0);
  });

  it("refuses to POST when the fetched form has a different ID, even with force", async () => {
    inputForms = [iconv.encode(formText.replace('name="ID" value="54555"', 'name="ID" value=""'), "cp932")];
    await expect(call("u1", { sheetId, password: "pw", force: true })).rejects.toMatchObject({ code: "not-found" });
    expect(posts()).toBe(0);
  });

  it("refuses to POST when the fetched form lacks the str field, even with force", async () => {
    inputForms = [iconv.encode(formText.replace('name="str"', 'name="strx"'), "cp932")];
    await expect(call("u1", { sheetId, password: "pw", force: true })).rejects.toMatchObject({ code: "unavailable" });
    expect(posts()).toBe(0);
  });

  it("maps a bad-password response", async () => {
    postResponse = fx("writeback_bad_password.html");
    expect(await call("u1", { sheetId, password: "pw" })).toEqual({ status: "bad-password" });
  });

  it("maps an unrecognized response to internal", async () => {
    postResponse = Buffer.from("<html></html>");
    await expect(call("u1", { sheetId, password: "pw" })).rejects.toMatchObject({ code: "internal" });
  });

  it("on ok, stores the re-fetched last_update and sends the password only in the body", async () => {
    inputForms = [form, formChanged(NEW_LU)];
    expect(await call("u1", { sheetId, password: "pw-secret" })).toEqual({ status: "ok" });
    expect(await read(`sheets/${sheetId}/sourceLastUpdate`)).toBe(NEW_LU);
    expect(post!.toString("latin1")).toContain("password=pw-secret");
    expect(JSON.stringify(await read(`sheets/${sheetId}`))).not.toContain("pw-secret");
  });

  it("rate limits", async () => {
    await getDatabase().ref("rateLimits").set(null); // beforeEach の取り込みの分を数えない
    for (let i = 0; i < 5; i++) await call("u1", { sheetId, password: "pw" });
    await expect(call("u1", { sheetId, password: "pw" })).rejects.toMatchObject({ code: "resource-exhausted" });
  });
});
