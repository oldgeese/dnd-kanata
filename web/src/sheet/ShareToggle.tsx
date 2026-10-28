import { useState } from "react";
import { ref, set } from "firebase/database";
import { db } from "../firebase";

export function ShareToggle({ sheetId, shared }: { sheetId: string; shared: boolean }) {
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/s/${sheetId}`;

  async function toggle(next: boolean) {
    setError(false);
    try {
      await set(ref(db, `sheets/${sheetId}/shared`), next);
    } catch {
      setError(true);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
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
          {copied && <span role="status">コピーしました</span>}
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
