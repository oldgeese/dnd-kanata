import { useEffect } from "react";

// iOS Safari では、キーボードを閉じた後もスクロールするまで固定表示の部分のタップ位置がずれたままになり、
// 上部固定部分のリンクを押しても別の場所を押したことになる（#32）。
// テキスト入力欄にフォーカスが入った後、表示領域が変わってテキスト入力欄にフォーカスがなくなったら
// （＝キーボードが閉じた）、変化が落ち着くのを待って 1px スクロールして戻し、位置を計算し直させる。
// 入力欄が確定で画面から消えた場合は focusout が来ないので、フォーカスの外れではなく表示領域の変化を見る。

// 表示領域の変化が止まってから補正するまでの時間（閉じるアニメーションの途中で補正しないため）
export const SETTLE_MS = 300;

export function useKeyboardTapFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let armed = false; // テキスト入力欄を使ってから、まだ補正もユーザーのスクロールもしていない
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;

    const disarm = () => {
      armed = false;
      clearTimeout(timer);
      timer = undefined;
    };
    const nudge = () => {
      disarm();
      if (isTextEntry(document.activeElement)) return; // 別の入力欄に移ってキーボードが開いている
      // 端では片方向のスクロールが効かないので、動ける向きに先に動かす
      const d = window.scrollY > 0 ? -1 : 1;
      window.scrollBy(0, d);
      // 同じタイミングで戻すと打ち消し合って無視されうるので、次のフレームで戻す
      frame = requestAnimationFrame(() => {
        frame = undefined;
        window.scrollBy(0, -d);
      });
    };
    const onFocusIn = (e: FocusEvent) => {
      if (isTextEntry(e.target as Element)) armed = true;
    };
    const onResize = () => {
      if (!armed || isTextEntry(document.activeElement)) return;
      clearTimeout(timer);
      timer = setTimeout(nudge, SETTLE_MS);
    };
    // ユーザーがスクロールすればずれは直るので、補正は要らない（慣性スクロールを止めないため）
    const onUserScroll = () => {
      if (!isTextEntry(document.activeElement)) disarm();
    };

    document.addEventListener("focusin", onFocusIn);
    vv.addEventListener("resize", onResize);
    window.addEventListener("touchmove", onUserScroll, { passive: true });
    window.addEventListener("wheel", onUserScroll, { passive: true });
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      vv.removeEventListener("resize", onResize);
      window.removeEventListener("touchmove", onUserScroll);
      window.removeEventListener("wheel", onUserScroll);
      clearTimeout(timer);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, []);
}

// キーボード（iOS の選択肢ピッカーを含む）を開く要素
function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !["checkbox", "radio", "button", "submit", "reset"].includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}
