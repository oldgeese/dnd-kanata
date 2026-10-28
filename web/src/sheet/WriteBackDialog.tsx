import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { errorCode, RESOURCE_EXHAUSTED_MESSAGE, UNAVAILABLE_MESSAGE } from "../callableErrors";
import { functions } from "../firebase";
import { labelOf } from "./labels";
import type { SaveState } from "./useSheet";

type Req = { sheetId: string; password: string; force?: boolean };
type Res =
  | { status: "ok" }
  | { status: "source-changed"; sourceLastUpdate: string; currentLastUpdate: string }
  | { status: "unencodable"; fields: string[] }
  | { status: "schema-changed"; added: string[] }
  | { status: "bad-password" };

type Outcome = { kind: "info" | "error"; text: string } | { kind: "confirm"; text: string };

const GENERIC_ERROR = "書き戻しに失敗しました。時間をおいて再度お試しください";

function describe(res: Res): Outcome {
  switch (res.status) {
    case "ok":
      return { kind: "info", text: "元サイトに反映しました" };
    case "bad-password":
      return { kind: "error", text: "パスワードが違います" };
    case "source-changed":
      return {
        kind: "confirm",
        text: `元サイトは取り込み後に更新されています（取り込み時: ${res.sourceLastUpdate} / 現在: ${res.currentLastUpdate}）。上書きしますか？`,
      };
    case "unencodable":
      return {
        kind: "error",
        text: `元サイトで使えない文字（絵文字など）が含まれています: ${res.fields.map(labelOf).join("、")}`,
      };
    case "schema-changed":
      return { kind: "error", text: "元サイトの入力項目が変わったため書き戻せません。取り込み直してください" };
  }
}

function errorText(e: unknown): string {
  const code = errorCode(e);
  if (code === "resource-exhausted") return RESOURCE_EXHAUSTED_MESSAGE;
  if (code === "unavailable") return UNAVAILABLE_MESSAGE;
  return GENERIC_ERROR;
}

export function WriteBackDialog(props: { sheetId: string; saveState: SaveState; onClose(): void }) {
  // パスワードはこの state にだけ置く（ログ・保存はしない）。閉じるとコンポーネントごと破棄される
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const saved = props.saveState === "saved";
  const inFlight = useRef(false);
  const { onClose } = props;

  // 開く前のフォーカス位置を覚えておき、閉じたら戻す
  // （autoFocus より前、最初のレンダー時点の要素を取る）
  const opener = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  useEffect(() => () => opener.current?.focus?.(), []);

  // Esc で閉じる（通信中は閉じない）
  useEffect(() => {
    if (busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function run(force: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setOutcome(null);
    try {
      const call = httpsCallable<Req, Res>(functions, "writeBack");
      const req: Req = force
        ? { sheetId: props.sheetId, password, force: true }
        : { sheetId: props.sheetId, password };
      const { data } = await call(req);
      const result = describe(data);
      // source-changed の確認待ちの間だけ、再実行用にパスワードを保持する
      if (data.status !== "source-changed") setPassword("");
      setOutcome(result);
    } catch (e) {
      setPassword("");
      setOutcome({ kind: "error", text: errorText(e) });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="writeback-title">
        <h2 id="writeback-title">元サイトに書き戻す</h2>
        <p>元サイトのパスワードを入力してください。パスワードは保存されません。</p>
        {!saved && <p className="error">未保存の編集があります。保存が終わってから実行してください</p>}
        <label>
          元サイトのパスワード
          <input
            type="password"
            autoComplete="off"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {outcome &&
          (outcome.kind === "error" ? (
            <p role="alert" className="error">
              {outcome.text}
            </p>
          ) : (
            <p role="status">{outcome.text}</p>
          ))}
        <div className="actions">
          {outcome?.kind === "confirm" ? (
            <>
              <button type="button" onClick={() => {
                  setPassword("");
                  setOutcome(null);
                }}>
                キャンセル
              </button>
              <button type="button" disabled={busy || !saved} onClick={() => void run(true)}>
                OK
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={props.onClose}>
                閉じる
              </button>
              <button type="button" disabled={busy || !saved || !password} onClick={() => void run(false)}>
                書き戻す
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
