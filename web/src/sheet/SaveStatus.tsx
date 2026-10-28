import type { SaveState } from "./useSheet";

const TEXT: Record<SaveState, string> = {
  saved: "保存済み",
  saving: "保存中…",
  offline: "オフライン（再接続時に送信）",
  error: "エラー",
};

export function SaveStatus({ state, onRetry }: { state: SaveState; onRetry(): void }) {
  return (
    <span className={`save-status ${state}`} role="status">
      {TEXT[state]}
      {state === "error" && (
        <button type="button" onClick={onRetry}>
          再試行
        </button>
      )}
    </span>
  );
}
