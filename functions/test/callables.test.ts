import { describe, expect, it } from "vitest";
import { importSheet } from "../src/importSheet";
import { writeBack } from "../src/writeBack";

type Wrapped = { __endpoint: Record<string, unknown>; run(req: unknown): Promise<unknown> };

describe.each([
  ["importSheet", importSheet as unknown as Wrapped, { source: "54555" }],
  ["writeBack", writeBack as unknown as Wrapped, { sheetId: "s1", password: "pw" }],
])("%s", (_, fn, data) => {
  it("is a v2 callable in asia-northeast1", () => {
    expect(fn.__endpoint).toMatchObject({ platform: "gcfv2", region: ["asia-northeast1"], callableTrigger: {} });
  });

  it("runs the handler (rejects without auth before touching the database)", async () => {
    await expect(fn.run({ auth: undefined, data, rawRequest: {} })).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
