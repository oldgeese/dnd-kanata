import { describe, expect, it } from "vitest";
import { appName } from "./appName";

describe("appName", () => {
  it("is the plain name in production", () => {
    expect(appName("prod")).toBe("dnd-kanata");
  });

  it.each(["dev", "development", "test"])("marks non-production builds as development (%s)", (mode) => {
    expect(appName(mode)).toBe("dnd-kanata(開発用)");
  });
});
