import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKeyboardTapFix } from "./useKeyboardTapFix";

class FakeViewport extends EventTarget {
  height = 400;
  scale = 1;
  resize(height: number, scale = 1) {
    this.height = height;
    this.scale = scale;
    this.dispatchEvent(new Event("resize"));
  }
}

let vv: FakeViewport;
let scrollBy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vv = new FakeViewport();
  vi.stubGlobal("visualViewport", vv);
  scrollBy = vi.fn();
  vi.stubGlobal("scrollBy", scrollBy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("useKeyboardTapFix", () => {
  it("nudges the scroll position when the keyboard closes", () => {
    renderHook(() => useKeyboardTapFix());
    vv.resize(800);
    expect(scrollBy.mock.calls).toEqual([
      [0, 1],
      [0, -1],
    ]);
  });

  it("nudges upward first when scrolled down so the nudge is never clamped to nothing", () => {
    vi.stubGlobal("scrollY", 100);
    renderHook(() => useKeyboardTapFix());
    vv.resize(800);
    expect(scrollBy.mock.calls).toEqual([
      [0, -1],
      [0, 1],
    ]);
  });

  it("does nothing when the viewport shrinks (keyboard opening)", () => {
    renderHook(() => useKeyboardTapFix());
    vv.resize(200);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("does nothing while a text field still has focus", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    renderHook(() => useKeyboardTapFix());
    vv.resize(800);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("does nothing on pinch zoom", () => {
    renderHook(() => useKeyboardTapFix());
    vv.resize(800, 0.5);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("stops listening on unmount", () => {
    const { unmount } = renderHook(() => useKeyboardTapFix());
    unmount();
    vv.resize(800);
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
