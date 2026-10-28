import { useEffect, useState } from "react";

const COPIED_MS = 2000;
import { ref, set } from "firebase/database";
import { db } from "../firebase";

export function ShareToggle({ sheetId, shared }: { sheetId: string; shared: boolean }) {
  const [error, setError] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const url = `${window.location.origin}/s/${sheetId}`;

  async function toggle(next: boolean) {
    setError(false);
    try {
      await set(ref(db, `sheets/${sheetId}/shared`), next);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    if (copyState !== "copied") return;
    const t = setTimeout(() => setCopyState("idle"), COPIED_MS);
    return () => clearTimeout(t);
  }, [copyState]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="share">
      <label>
        <input type="checkbox" checked={shared} onChange={(e) => void toggle(e.target.checked)} />
        閲覧用リンクを有効にする
      </label>
      {shared && (
        <span className="share-link">
          <input readOnly aria-label="閲覧用リンク" value={url} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" onClick={() => void copy()}>
            コピー
          </button>
          {copyState === "copied" && <span role="status">コピーしました</span>}
          {copyState === "failed" && (
            <span role="alert" className="error">
              コピーできませんでした。リンクを選択してコピーしてください
            </span>
          )}
        </span>
      )}
      {error && (
        <p role="alert" className="error">
          共有設定を変更できませんでした
        </p>
      )}
    </div>
  );
}
