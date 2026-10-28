import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import iconv from "iconv-lite";
import { initializeApp, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { importSheetHandler } from "../src/importSheet";
import { checkRateLimit } from "../src/rateLimit";
import { fetchInputForm, parseSourceId, postOutput } from "../src/source";

const UA = "dnd-kanata (+https://github.com/oldgeese/dnd-kanata)";
const fixture = readFileSync(resolve(__dirname, "../../fixtures/input_form_54555.html"));
const emptyIdFixture = Buffer.from(
  iconv.encode(iconv.decode(fixture, "cp932").replace('name="ID" value="54555"', 'name="ID" value=""'), "cp932"),
);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const okResponse = (body: Buffer) => new Response(body, { status: 200 });
const call = (uid: string | null, data: { source: string; overwrite?: boolean }) =>
  importSheetHandler({ auth: uid ? ({ uid } as never) : undefined, data });
const read = async (path: string) => (await (path ? getDatabase().ref(path) : getDatabase().ref()).get()).val();

beforeAll(() => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    throw new Error("Database emulator required. Run `pnpm --filter functions test` (uses firebase emulators:exec).");
  }
  if (getApps().length === 0) initializeApp({ projectId: "demo-dnd-kanata", databaseURL: "http://127.0.0.1:9000/?ns=demo-dnd-kanata" });
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  await getDatabase().ref().set(null);
  fetchMock = vi.fn(async () => okResponse(fixture));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("parseSourceId", () => {
  it("accepts id and source URLs", () => {
    expect(parseSourceId("54555")).toBe(54555);
    expect(parseSourceId("https://dndjp.sakura.ne.jp/OUTPUT.php?ID=54555")).toBe(54555);
    expect(parseSourceId("https://dndjp.sakura.ne.jp/INPUT_FORM.php?ID=54555")).toBe(54555);
  });
  it("rejects everything else", () => {
    for (const s of ["abc", "https://evil.example/?ID=1", "https://evil.example/OUTPUT.php?ID=1", "-1", "", "0"]) {
      expect(parseSourceId(s)).toBeNull();
    }
  });
});

describe("postOutput", () => {
  it("POSTs form-encoded body with UA and decodes cp932", async () => {
    fetchMock.mockResolvedValue(okResponse(iconv.encode("こんにちは", "cp932")));
    const body = Buffer.from("a=b");
    expect(await postOutput(54555, body)).toBe("こんにちは");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://dndjp.sakura.ne.jp/OUTPUT.php?ID=54555");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" });
    expect(init.body).toBe(body);
  });
});

describe("fetchInputForm", () => {
  it("requests the INPUT_FORM URL with the User-Agent", async () => {
    await fetchInputForm(54555);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://dndjp.sakura.ne.jp/INPUT_FORM.php?ID=54555");
    expect(init.headers["User-Agent"]).toBe(UA);
  });
});

describe("checkRateLimit", () => {
  it("allows 5 within 60s, then rejects; allows again after the window", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("u1", 1_000_000 + i);
    await expect(checkRateLimit("u1", 1_000_010)).rejects.toMatchObject({ code: "resource-exhausted" });
    await expect(checkRateLimit("u1", 1_000_000 + 60_000)).resolves.toBeUndefined();
  });
});

describe("importSheet", () => {
  it("creates a sheet", async () => {
    const res = await call("u1", { source: "54555" });
    expect(res.status).toBe("created");
    expect(res.sheetId).toMatch(UUID_V4);
    const sheet = await read(`sheets/${res.sheetId}`);
    expect(sheet).toMatchObject({ ownerUid: "u1", sourceId: 54555, shared: false });
    expect(sheet.fields.str).toBe("11");
    expect(sheet.schema.str).toBeTruthy();
    expect(typeof sheet.sourceLastUpdate).toBe("string");
    expect(await read(`users/u1/sheets/${res.sheetId}`)).toBe(true);
    expect(await read("users/u1/sources/54555")).toBe(res.sheetId);
  });

  it("returns exists without overwrite and leaves the DB unchanged", async () => {
    const first = await call("u1", { source: "54555" });
    await getDatabase().ref(`sheets/${first.sheetId}/fields/current_hp`).set("1");
    const before = await read("");
    const res = await call("u1", { source: "https://dndjp.sakura.ne.jp/OUTPUT.php?ID=54555" });
    expect(res).toEqual({ status: "exists", sheetId: first.sheetId });
    expect(await read("")).toEqual(before);
  });

  it("overwrites with overwrite: true, keeping the sheetId", async () => {
    const first = await call("u1", { source: "54555" });
    const original = (await read(`sheets/${first.sheetId}/fields/current_hp`)) as string | null;
    await getDatabase().ref(`sheets/${first.sheetId}/fields/current_hp`).set("1");
    await getDatabase().ref(`sheets/${first.sheetId}/shared`).set(true);
    const res = await call("u1", { source: "54555", overwrite: true });
    expect(res).toEqual({ status: "overwritten", sheetId: first.sheetId });
    expect(await read(`sheets/${first.sheetId}/fields/current_hp`)).toBe(original);
    expect(await read(`sheets/${first.sheetId}/fields/current_hp`)).not.toBe("1");
    expect(await read(`sheets/${first.sheetId}/shared`)).toBe(true);
  });

  it("treats a non-boolean overwrite as no overwrite", async () => {
    const first = await call("u1", { source: "54555" });
    await getDatabase().ref(`sheets/${first.sheetId}/fields/current_hp`).set("1");
    const res = await call("u1", { source: "54555", overwrite: "true" as unknown as boolean });
    expect(res).toEqual({ status: "exists", sheetId: first.sheetId });
    expect(await read(`sheets/${first.sheetId}/fields/current_hp`)).toBe("1");
  });

  it("creates only one sheet for concurrent first imports", async () => {
    const [a, b] = await Promise.all([call("u1", { source: "54555" }), call("u1", { source: "54555" })]);
    expect([a.status, b.status].sort()).toEqual(["created", "exists"]);
    expect(a.sheetId).toBe(b.sheetId);
    expect(Object.keys(await read("sheets"))).toEqual([a.sheetId]);
    expect(await read("users/u1/sheets")).toEqual({ [a.sheetId]: true });
    expect(await read("users/u1/sources/54555")).toBe(a.sheetId);
  });

  it("unavailable with a form-format message when the page has no form", async () => {
    fetchMock.mockResolvedValue(okResponse(iconv.encode("<html><body>maintenance</body></html>", "cp932")));
    await expect(call("u1", { source: "54555" })).rejects.toMatchObject({
      code: "unavailable",
      message: "元サイトのフォーム形式が想定と異なります。",
    });
    expect(await read("sheets")).toBeNull();
    expect(await read("users/u1/sources/54555")).toBeNull();
  });

  it("not-found when the source returns an empty ID", async () => {
    fetchMock.mockResolvedValue(okResponse(emptyIdFixture));
    await expect(call("u1", { source: "54555" })).rejects.toMatchObject({ code: "not-found" });
    expect(await read("sheets")).toBeNull();
  });

  it("unavailable when the source returns 500", async () => {
    fetchMock.mockResolvedValue(new Response("x", { status: 500 }));
    await expect(call("u1", { source: "54555" })).rejects.toMatchObject({ code: "unavailable" });
    expect(await read("sheets")).toBeNull();
  });

  it("invalid-argument for a bad source", async () => {
    await expect(call("u1", { source: "https://evil.example/?ID=1" })).rejects.toMatchObject({ code: "invalid-argument" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resource-exhausted on the 6th call within 60s", async () => {
    for (let i = 0; i < 5; i++) await call("u1", { source: "54555", overwrite: true });
    await expect(call("u1", { source: "54555", overwrite: true })).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("unauthenticated without auth", async () => {
    await expect(call(null, { source: "54555" })).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("fetches the INPUT_FORM URL with the User-Agent", async () => {
    await call("u1", { source: "54555" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://dndjp.sakura.ne.jp/INPUT_FORM.php?ID=54555");
    expect(init.headers["User-Agent"]).toBe(UA);
  });
});
