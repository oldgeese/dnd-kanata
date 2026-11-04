import { useEffect } from "react";

// iOS Safari では、キーボードを閉じた後もスクロールするまで固定表示の部分のタップ位置がずれたままになり、
// 上部固定部分のリンクを押しても別の場所を押したことになる（#32）。
// 入力欄からフォーカスが外れたら、キーボードが閉じて表示領域の変化が落ち着くのを待ち、
// 1px スクロールして戻して位置を計算し直させる。

// 表示領域の変化が止まってから補正するまでの時間（閉じるアニメーションの途中で補正しないため）
export const SETTLE_MS = 300;
// 表示領域の変化が来ない場合（キーボードを使わない環境など）でも補正するまでの時間
export const FALLBACK_MS = 1000;

export function useKeyboardTapFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    let pending = false;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(nudge, ms);
    };
    const nudge = () => {
      pending = false;
      if (isTextEntry(document.activeElement)) return; // 別の入力欄に移ってキーボードが開いている
      // 端では片方向のスクロールが効かないので、動ける向きに先に動かす
      const d = window.scrollY > 0 ? -1 : 1;
      window.scrollBy(0, d);
      // 同じタイミングで戻すと打ち消し合って無視されうるので、次のフレームで戻す
      frame = requestAnimationFrame(() => window.scrollBy(0, -d));
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!isTextEntry(e.target as Element) || isTextEntry(e.relatedTarget as Element | null)) return;
      pending = true;
      schedule(FALLBACK_MS);
    };
    const onResize = () => {
      if (pending) schedule(SETTLE_MS);
    };

    document.addEventListener("focusout", onFocusOut);
    vv?.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", onResize);
      clearTimeout(timer);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, []);
}

function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !["checkbox", "radio", "button", "submit", "reset"].includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}
