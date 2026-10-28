import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import { SaveStatus } from "../sheet/SaveStatus";
import { SheetView } from "../sheet/SheetView";
import { ShareToggle } from "../sheet/ShareToggle";
import { WriteBackDialog } from "../sheet/WriteBackDialog";
import { useSheet } from "../sheet/useSheet";

// /c/:sheetId（持ち主の編集画面）と /s/:sheetId（閲覧専用）で共通
export function SheetPage({ readOnly }: { readOnly: boolean }) {
  const { sheetId } = useParams();
  // シートが変わったら保存待ちの状態ごと作り直す
  return <Sheet key={sheetId} sheetId={sheetId!} readOnly={readOnly} />;
}

function Sheet({ sheetId, readOnly }: { sheetId: string; readOnly: boolean }) {
  const { user } = useAuth();
  const [writingBack, setWritingBack] = useState(false);
  const { status, sheet, derived, setField, saveState, retry } = useSheet(sheetId);

  if (status === "loading") return <p className="center">読み込み中…</p>;
  if (status === "not-found" || !sheet)
    return (
      <main className="center">
        <p>シートが見つかりません（共有が無効になっている可能性があります）</p>
        {!readOnly && <Link to="/">一覧へ戻る</Link>}
      </main>
    );

  // 共有されたシートを他人が /c/ で開いた場合も編集 UI は出さない（書き込みはルールで拒否される）
  const editable = !readOnly && !!user && user.uid === sheet.ownerUid;
  const f = sheet.fields;
  const img = /^https?:\/\//.test(f.img_url ?? "") ? f.img_url : undefined;

  return (
    <main className="sheet">
      <header className="sheet-head">
        {!readOnly && (
          <Link to="/" className="back">
            ← 一覧
          </Link>
        )}
        {editable && <SaveStatus state={saveState} onRetry={retry} />}
        {editable && (
          <div className="owner-tools">
            <ShareToggle sheetId={sheetId} shared={sheet.shared === true} />
            <button type="button" onClick={() => setWritingBack(true)}>
              元サイトに書き戻す
            </button>
          </div>
        )}
        <div className="who">
          {img && <img src={img} alt="" />}
          <div>
            <h1>{f.char_name || "（名前なし）"}</h1>
            <p className="sub">{[f.race, f.char_class, f.char_level && `Lv${f.char_level}`].filter(Boolean).join(" / ")}</p>
          </div>
        </div>
      </header>
      <SheetView fields={sheet.fields} schema={sheet.schema} derived={derived} setField={setField} readOnly={!editable} />
      {editable && writingBack && (
        <WriteBackDialog sheetId={sheetId} saveState={saveState} onClose={() => setWritingBack(false)} />
      )}
    </main>
  );
}
