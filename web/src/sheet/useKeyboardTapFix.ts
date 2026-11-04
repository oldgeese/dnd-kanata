import { useEffect } from "react";

// iOS Safari では、キーボードを閉じた後もスクロールするまで固定表示の部分のタップ位置がずれたままになり、
// 上部固定部分のリンクを押しても別の場所を押したことになる（#32）。
// キーボードが閉じたとき（拡大率は同じまま表示領域が高くなったとき）に 1px スクロールして戻し、位置を計算し直させる。
export function useKeyboardTapFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let prev = { height: vv.height, scale: vv.scale };
    const onResize = () => {
      const closed = vv.scale === prev.scale && vv.height > prev.height;
      prev = { height: vv.height, scale: vv.scale };
      if (!closed || isTextEntry(document.activeElement)) return;
      // 端では片方向のスクロールが効かないので、動ける向きに先に動かす
      const d = window.scrollY > 0 ? -1 : 1;
      window.scrollBy(0, d);
      window.scrollBy(0, -d);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);
}

function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !["checkbox", "radio", "button", "submit", "reset"].includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}
