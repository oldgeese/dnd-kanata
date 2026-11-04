import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTLE_MS, useKeyboardTapFix } from "./useKeyboardTapFix";

let vv: EventTarget;
let scrollBy: ReturnType<typeof vi.fn>;
const resize = () => vv.dispatchEvent(new Event("resize"));
const settle = () => {
  vi.advanceTimersByTime(SETTLE_MS);
  vi.advanceTimersToNextFrame();
};

function el<K extends "input" | "textarea" | "select" | "button">(tag: K, type?: string) {
  const e = document.createElement(tag);
  if (type && e instanceof HTMLInputElement) e.type = type;
  document.body.append(e);
  return e;
}

// テキスト入力欄でキーボードを開く
function openKeyboard(tag: "input" | "textarea" | "select" = "input") {
  const input = el(tag);
  input.focus();
  resize();
  return input;
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
  it("nudges once the viewport settles after the keyboard closes, restoring on the next frame", () => {
    renderHook(() => useKeyboardTapFix());
    openKeyboard().blur();
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
    openKeyboard("textarea").blur();
    resize();
    settle();
    expect(scrollBy.mock.calls).toEqual([
      [0, -1],
      [0, 1],
    ]);
  });

  it("nudges when the focused field is removed without a blur (commit on Enter, select change)", () => {
    renderHook(() => useKeyboardTapFix());
    const input = openKeyboard();
    input.remove(); // jsdom は取り除いても focusout を出さない
    resize();
    settle();
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it("nudges after a select picker closes", () => {
    renderHook(() => useKeyboardTapFix());
    const select = openKeyboard("select");
    el("button").focus();
    select.remove();
    resize();
    settle();
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it("does nothing while the keyboard stays open", () => {
    renderHook(() => useKeyboardTapFix());
    openKeyboard();
    el("input").focus(); // 別の入力欄へ移る
    resize();
    settle();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("ignores viewport resizes when no text field was used (toolbar, rotation, zoom, desktop)", () => {
    renderHook(() => useKeyboardTapFix());
    resize();
    settle();
    el("input", "checkbox").focus();
    resize();
    settle();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("does nothing without a viewport resize (no on-screen keyboard)", () => {
    renderHook(() => useKeyboardTapFix());
    openKeyboard().blur();
    vi.advanceTimersByTime(SETTLE_MS * 10);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("ignores resizes after the nudge has run", () => {
    renderHook(() => useKeyboardTapFix());
    openKeyboard().blur();
    resize();
    settle();
    scrollBy.mockClear();
    resize();
    settle();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it.each(["touchmove", "wheel"])("skips the nudge when the user scrolls the page (%s) before it runs", (type) => {
    renderHook(() => useKeyboardTapFix());
    openKeyboard().blur();
    resize();
    window.dispatchEvent(new Event("touchstart"));
    window.dispatchEvent(new Event(type));
    window.dispatchEvent(new Event("scroll"));
    resize(); // ツールバーが縮んでも補正しない
    settle();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("still nudges when a touch moves without scrolling the page (swiping the section links)", () => {
    renderHook(() => useKeyboardTapFix());
    openKeyboard().blur();
    resize();
    window.dispatchEvent(new Event("touchstart"));
    window.dispatchEvent(new Event("touchmove"));
    settle();
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it("still nudges when the page scrolls without a user gesture (Safari adjusting after the keyboard)", () => {
    renderHook(() => useKeyboardTapFix());
    openKeyboard().blur();
    window.dispatchEvent(new Event("touchstart"));
    window.dispatchEvent(new Event("scroll"));
    resize();
    settle();
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it("keeps waiting when the user scrolls while the keyboard is still open", () => {
    renderHook(() => useKeyboardTapFix());
    const input = openKeyboard();
    window.dispatchEvent(new Event("touchmove"));
    window.dispatchEvent(new Event("scroll"));
    input.blur();
    resize();
    settle();
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it("nudges when the next field's keyboard closes after moving between fields", () => {
    renderHook(() => useKeyboardTapFix());
    openKeyboard().blur(); // 表示用のボタンを押した瞬間など、一瞬だけ入力欄からフォーカスが外れる
    resize();
    vi.advanceTimersByTime(SETTLE_MS - 1);
    const next = openKeyboard(); // 予約した補正が走る前に次の入力欄が開く
    settle();
    expect(scrollBy).not.toHaveBeenCalled();
    next.blur();
    resize();
    settle();
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it("keeps waiting when a text field is focused by the time the nudge runs", () => {
    renderHook(() => useKeyboardTapFix());
    openKeyboard().blur();
    resize();
    const next = el("input");
    // focusin を出さずにフォーカスを移したのと同じ状態にする
    vi.spyOn(document, "activeElement", "get").mockReturnValue(next);
    settle();
    expect(scrollBy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    resize();
    settle();
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending nudge on unmount", () => {
    const { unmount } = renderHook(() => useKeyboardTapFix());
    openKeyboard().blur();
    resize();
    unmount();
    settle();
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
