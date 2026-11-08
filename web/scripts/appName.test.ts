import { describe, expect, it } from "vitest";
import type { IndexHtmlTransformHook } from "vite";
import { appName, appNameHtml } from "./appName";

describe("appName", () => {
  it("is the plain name in production", () => {
    expect(appName("prod")).toBe("dnd-kanata");
  });

  it.each(["dev", "development", "test"])("marks non-production builds as development (%s)", (mode) => {
    expect(appName(mode)).toBe("dnd-kanata(開発用)");
  });
});

describe("appNameHtml", () => {
  it("puts the app name into the page title", () => {
    const hook = appNameHtml("dnd-kanata(開発用)").transformIndexHtml as { handler: IndexHtmlTransformHook };
    const html = hook.handler.call(undefined as never, "<title>__APP_NAME__</title>", {} as never);
    expect(html).toBe("<title>dnd-kanata(開発用)</title>");
  });
});
