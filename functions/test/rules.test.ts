import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { ref, get, set, update, remove, serverTimestamp } from "firebase/database";

import { setLogLevel } from "firebase/app";

setLogLevel("silent");

const OWNER = "owner-uid";
const OTHER = "other-uid";

let env: RulesTestEnvironment;

const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? "127.0.0.1:9000").split(":");

async function seed(id: string, shared: boolean) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `sheets/${id}`), {
      ownerUid: OWNER,
      sourceId: 1,
      shared,
      fields: { str: "x" },
      schema: { str: { kind: "text", order: 0 }, other: { kind: "text", order: 1 } },
      sourceLastUpdate: "2020-01-01",
      importedAt: 1,
      updatedAt: 1,
    });
    await set(ref(db, `users/${OWNER}/sheets/${id}`), true);
    await set(ref(db, `users/${OTHER}/sheets/zzz`), true);
    await set(ref(db, `rateLimits/${OWNER}/k1`), 1);
  });
}

beforeEach(async () => {
  if (!env) {
    env = await initializeTestEnvironment({
      projectId: "demo-dnd-kanata",
      database: {
        host: host!,
        port: Number(port),
        rules: readFileSync(resolve(__dirname, "../../database.rules.json"), "utf8"),
      },
    });
  }
  await env.clearDatabase();
  await seed("priv", false);
  await seed("pub", true);
});

afterAll(async () => {
  await env?.cleanup();
});

const owner = () => env.authenticatedContext(OWNER).database();
const other = () => env.authenticatedContext(OTHER).database();
const anon = () => env.unauthenticatedContext().database();

describe("owner", () => {
  it("reads own sheet", () => assertSucceeds(get(ref(owner(), "sheets/priv"))));
  it("updates fields/str", () => assertSucceeds(set(ref(owner(), "sheets/priv/fields/str"), "hello")));
  it("allows empty string and 10000 chars", async () => {
    await assertSucceeds(set(ref(owner(), "sheets/priv/fields/str"), ""));
    await assertSucceeds(set(ref(owner(), "sheets/priv/fields/str"), "a".repeat(10000)));
  });
  it("rejects 10001 chars", () =>
    assertFails(set(ref(owner(), "sheets/priv/fields/str"), "a".repeat(10001))));
  it("rejects a field key that is not in the schema", () =>
    assertFails(set(ref(owner(), "sheets/priv/fields/newKey"), "v")));
  it("rejects an object under a field key", () =>
    assertFails(set(ref(owner(), "sheets/priv/fields/str"), { nested: "v" })));
  it("updates shared", () => assertSucceeds(set(ref(owner(), "sheets/priv/shared"), true)));
  it("rejects non-boolean shared", () => assertFails(set(ref(owner(), "sheets/priv/shared"), "yes")));
  it("updates updatedAt", () => assertSucceeds(set(ref(owner(), "sheets/priv/updatedAt"), serverTimestamp())));
  it("rejects future updatedAt", () =>
    assertFails(set(ref(owner(), "sheets/priv/updatedAt"), Date.now() + 10 * 60_000)));
  it("autosave multi-path update succeeds", () =>
    assertSucceeds(
      update(ref(owner(), "sheets/priv"), {
        "fields/str": "v1",
        "fields/other": "v2",
        updatedAt: serverTimestamp(),
      }),
    ));
  it("autosave multi-path update fails for non-owner", () =>
    assertFails(
      update(ref(other(), "sheets/priv"), { "fields/str": "v1", updatedAt: serverTimestamp() }),
    ));
  it("rejects writing ownerUid", () => assertFails(set(ref(owner(), "sheets/priv/ownerUid"), OTHER)));
  it("rejects writing sourceId", () => assertFails(set(ref(owner(), "sheets/priv/sourceId"), 2)));
  it("rejects writing schema", () => assertFails(set(ref(owner(), "sheets/priv/schema"), { b: 2 })));
  it("rejects writing sourceLastUpdate", () =>
    assertFails(set(ref(owner(), "sheets/priv/sourceLastUpdate"), "x")));
  it("rejects writing importedAt", () => assertFails(set(ref(owner(), "sheets/priv/importedAt"), 5)));
  it("rejects replacing the whole fields node", () =>
    assertFails(set(ref(owner(), "sheets/priv/fields"), { str: "y" })));
  it("rejects creating a sheet", () =>
    assertFails(
      set(ref(owner(), "sheets/new"), { ownerUid: OWNER, sourceId: 1, shared: false, fields: {} }),
    ));
  it("rejects deleting a sheet", () => assertFails(remove(ref(owner(), "sheets/priv"))));
  it("rejects deleting a single field", () => assertFails(remove(ref(owner(), "sheets/priv/fields/str"))));
  it("rejects numeric field value", () => assertFails(set(ref(owner(), "sheets/priv/fields/str"), 5)));
  it("reads own users/{uid}/sheets", () => assertSucceeds(get(ref(owner(), `users/${OWNER}/sheets`))));
  it("cannot write users/{uid}", () => assertFails(set(ref(owner(), `users/${OWNER}/sheets/x`), true)));
});

describe("other signed-in user", () => {
  it("cannot read private sheet", () => assertFails(get(ref(other(), "sheets/priv"))));
  it("can read shared sheet", () => assertSucceeds(get(ref(other(), "sheets/pub"))));
  it("cannot write fields on private", () => assertFails(set(ref(other(), "sheets/priv/fields/str"), "x")));
  it("cannot write fields on shared", () => assertFails(set(ref(other(), "sheets/pub/fields/str"), "x")));
  it("cannot write shared flag", () => assertFails(set(ref(other(), "sheets/pub/shared"), false)));
  it("cannot read another user's data", () => assertFails(get(ref(other(), `users/${OWNER}`))));
  it("cannot read another user's sheets", () => assertFails(get(ref(other(), `users/${OWNER}/sheets`))));
});

describe("anonymous", () => {
  it("reads shared sheet", () => assertSucceeds(get(ref(anon(), "sheets/pub"))));
  it("cannot read private sheet", () => assertFails(get(ref(anon(), "sheets/priv"))));
  it("cannot read a nonexistent sheet", () => assertFails(get(ref(anon(), "sheets/missing"))));
  it("cannot write fields", () => assertFails(set(ref(anon(), "sheets/pub/fields/str"), "x")));
});

describe("lists and server-only paths", () => {
  it("nobody lists /sheets", async () => {
    await assertFails(get(ref(owner(), "sheets")));
    await assertFails(get(ref(other(), "sheets")));
    await assertFails(get(ref(anon(), "sheets")));
  });
  it("nobody reads/writes /rateLimits", async () => {
    await assertFails(get(ref(owner(), `rateLimits/${OWNER}`)));
    await assertFails(set(ref(owner(), `rateLimits/${OWNER}/k2`), 1));
    await assertFails(get(ref(anon(), "rateLimits")));
  });
  it("cannot read or write root", async () => {
    await assertFails(get(ref(owner(), "/")));
    await assertFails(set(ref(owner(), "junk"), 1));
  });
});
