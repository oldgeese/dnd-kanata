import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_MS, SETTLE_MS, useKeyboardTapFix } from "./useKeyboardTapFix";

let vv: EventTarget;
let scrollBy: ReturnType<typeof vi.fn>;
const resize = () => vv.dispatchEvent(new Event("resize"));

function field(tag: "input" | "textarea" = "input", type = "text") {
  const el = document.createElement(tag);
  if (el instanceof HTMLInputElement) el.type = type;
  document.body.append(el);
  return el;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
  vv = new EventTarget();
  vi.stubGlobal("visualViewport", vv);
  scrollBy = vi.fn();
  vi.stubGlobal("scrollBy", scrollBy);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("useKeyboardTapFix", () => {
  it("nudges once the viewport settles after a text field loses focus, restoring on the next frame", () => {
    renderHook(() => useKeyboardTapFix());
    const input = field();
    input.focus();
    input.blur();
    resize();
    vi.advanceTimersByTime(SETTLE_MS - 1);
    resize(); // キーボードが閉じる間に何度も来ても、止まるまで待つ
    vi.advanceTimersByTime(SETTLE_MS - 1);
    expect(scrollBy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(scrollBy.mock.calls).toEqual([[0, 1]]);
    vi.advanceTimersToNextFrame();
    expect(scrollBy.mock.calls).toEqual([
      [0, 1],
      [0, -1],
    ]);
  });

  it("nudges upward first when scrolled down", () => {
    vi.stubGlobal("scrollY", 100);
    renderHook(() => useKeyboardTapFix());
    const input = field("textarea");
    input.focus();
    input.blur();
    vi.advanceTimersByTime(FALLBACK_MS);
    vi.advanceTimersToNextFrame();
    expect(scrollBy.mock.calls).toEqual([
      [0, -1],
      [0, 1],
    ]);
  });

  it("still nudges when no viewport resize comes", () => {
    renderHook(() => useKeyboardTapFix());
    const input = field();
    input.focus();
    input.blur();
    vi.advanceTimersByTime(FALLBACK_MS - 1);
    expect(scrollBy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it("ignores viewport resizes without a preceding blur (toolbar, rotation, zoom)", () => {
    renderHook(() => useKeyboardTapFix());
    resize();
    vi.advanceTimersByTime(FALLBACK_MS * 2);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("ignores resizes after the nudge has run", () => {
    renderHook(() => useKeyboardTapFix());
    const input = field();
    input.focus();
    input.blur();
    vi.advanceTimersByTime(FALLBACK_MS);
    vi.advanceTimersToNextFrame();
    scrollBy.mockClear();
    resize();
    vi.advanceTimersByTime(FALLBACK_MS * 2);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("does nothing when focus moves to another text field", () => {
    renderHook(() => useKeyboardTapFix());
    const a = field();
    const b = field();
    a.focus();
    b.focus();
    vi.advanceTimersByTime(FALLBACK_MS * 2);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("does nothing when a text field has focus again by the time the viewport settles", () => {
    renderHook(() => useKeyboardTapFix());
    const input = field();
    input.focus();
    input.blur();
    input.focus();
    vi.advanceTimersByTime(FALLBACK_MS * 2);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("ignores blur of controls that open no keyboard", () => {
    renderHook(() => useKeyboardTapFix());
    const box = field("input", "checkbox");
    box.focus();
    box.blur();
    vi.advanceTimersByTime(FALLBACK_MS * 2);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("cancels a pending nudge on unmount", () => {
    const { unmount } = renderHook(() => useKeyboardTapFix());
    const input = field();
    input.focus();
    input.blur();
    unmount();
    vi.advanceTimersByTime(FALLBACK_MS * 2);
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
