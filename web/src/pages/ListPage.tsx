import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { onValue, ref } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { decodeRecord } from "@dnd-kanata/core/browser";
import { useAuth } from "../auth";
import { errorCode, RESOURCE_EXHAUSTED_MESSAGE, UNAVAILABLE_MESSAGE } from "../callableErrors";
import { db, functions } from "../firebase";

type ImportRequest = { source: string; overwrite?: boolean };
type ImportResult = { status: "created" | "overwritten" | "exists"; sheetId: string };

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-argument": "元サイトの URL か数字の ID を入力してください",
  "not-found": "元サイトにそのキャラクターが見つかりません",
  unavailable: UNAVAILABLE_MESSAGE,
  "resource-exhausted": RESOURCE_EXHAUSTED_MESSAGE,
};

function errorMessage(e: unknown): string {
  return ERROR_MESSAGES[errorCode(e)] ?? "取り込みに失敗しました。時間をおいて再度お試しください";
}

type Summary = { name?: string; cls?: string; level?: string };

// 元サイトのクラス欄には「ローグ10」のようにレベルが含まれることが多いので、そのときはレベルを重ねて出さない
export function classLabel({ cls, level }: Summary): string {
  if (!cls) return level ? `Lv${level}` : "";
  return /\d/.test(cls) || !level ? cls : `${cls} Lv${level}`;
}

function useSheetSummaries(uid: string): { summaries: Record<string, Summary>; failed: boolean } {
  const [ids, setIds] = useState<string[]>([]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [failed, setFailed] = useState(false);

  useEffect(
    () =>
      onValue(
        ref(db, `users/${uid}/sheets`),
        (snap) => {
          setFailed(false);
          setIds(Object.keys((snap.val() as Record<string, true> | null) ?? {}));
        },
        () => setFailed(true),
      ),
    [uid],
  );

  const key = ids.join("\n");
  useEffect(() => {
    const unsubs = ids.map((id) =>
      onValue(
        ref(db, `sheets/${id}/fields`),
        (snap) => {
          const f = decodeRecord((snap.val() as Record<string, string> | null) ?? {});
          setSummaries((prev) => ({
            ...prev,
            [id]: { name: f.char_name, cls: f.char_class, level: f.char_level },
          }));
        },
        () => setFailed(true),
      ),
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { summaries: Object.fromEntries(ids.map((id) => [id, summaries[id] ?? {}])), failed };
}

function ConfirmDialog(props: { message: string; onOk(): void; onCancel(): void }) {
  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-msg">
        <p id="confirm-msg">{props.message}</p>
        <div className="actions">
          <button onClick={props.onCancel}>キャンセル</button>
          <button onClick={props.onOk}>OK</button>
        </div>
      </div>
    </div>
  );
}

export function ListPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { summaries, failed: listFailed } = useSheetSummaries(user!.uid);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function run(src: string, overwrite: boolean) {
    setBusy(true);
    setError(null);
    try {
      const call = httpsCallable<ImportRequest, ImportResult>(functions, "importSheet");
      const { data } = await call(overwrite ? { source: src, overwrite: true } : { source: src });
      if (data.status === "exists") setConfirming(src);
      else navigate(`/c/${data.sheetId}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Enter では実行しない（ボタンのクリックだけで取り込む）
  function onImport() {
    const src = source.trim();
    if (src) void run(src, false);
  }

  return (
    <main>
      <header className="bar">
        <h1>キャラクター一覧</h1>
        <button onClick={() => void signOut()}>ログアウト</button>
      </header>
      <div className="import">
        <input
          aria-label="取り込み元の URL または ID"
          placeholder="URL または数字の ID"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <button type="button" disabled={busy} onClick={onImport}>
          取り込む
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {listFailed && (
        <p role="alert" className="error">
          キャラクター一覧を読み込めませんでした。ページを再読み込みしてください
        </p>
      )}
      <ul className="sheets">
        {Object.entries(summaries).map(([id, s]) => (
          <li key={id}>
            <Link to={`/c/${id}`}>
              <strong>{s.name || "（名前なし）"}</strong> {classLabel(s)}
            </Link>
          </li>
        ))}
      </ul>
      {confirming && (
        <ConfirmDialog
          message="取り込み済みです。元サイトの内容で上書きしますか？（この画面での編集内容は失われます）"
          onCancel={() => setConfirming(null)}
          onOk={() => {
            const src = confirming;
            setConfirming(null);
            void run(src, true);
          }}
        />
      )}
    </main>
  );
}
