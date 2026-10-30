import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("firebase", () => {
  it("sends Firebase Auth emails such as the sign-in link in Japanese", async () => {
    vi.stubEnv("VITE_USE_EMULATORS", "true");
    const { auth } = await import("./firebase");
    expect(auth.languageCode).toBe("ja");
  });
});
