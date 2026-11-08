import { describe, expect, it, vi } from "vitest";
import { appVersion } from "./appVersion";

describe("appVersion", () => {
  it("uses RELEASE_TAG in production", () => {
    const run = vi.fn(() => "v0.0.1");
    expect(appVersion("prod", { RELEASE_TAG: "v1.2.3" }, run)).toBe("v1.2.3");
    expect(run).not.toHaveBeenCalled();
  });

  it("falls back to the tag on HEAD in production", () => {
    const run = vi.fn(() => "v1.2.3");
    expect(appVersion("prod", {}, run)).toBe("v1.2.3");
    expect(run).toHaveBeenCalledWith("describe", "--tags", "--exact-match", "HEAD");
  });

  it("refuses a production build without a release tag", () => {
    expect(() => appVersion("prod", {}, () => null)).toThrow(/RELEASE_TAG/);
  });

  it("uses the commit hash outside production, ignoring RELEASE_TAG", () => {
    const run = vi.fn(() => "abc1234");
    expect(appVersion("dev", { RELEASE_TAG: "v1.2.3" }, run)).toBe("abc1234");
    expect(run).toHaveBeenCalledWith("rev-parse", "--short", "HEAD");
  });

  it("falls back to unknown when git is unavailable", () => {
    expect(appVersion("development", {}, () => null)).toBe("unknown");
  });
});
