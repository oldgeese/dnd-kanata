import { useParams } from "react-router-dom";

// Placeholder; implemented in Task 7.
export function SheetPage({ readOnly }: { readOnly: boolean }) {
  const { sheetId } = useParams();
  return (
    <main>
      <p>
        シート {sheetId}（{readOnly ? "閲覧専用" : "編集"}）
      </p>
    </main>
  );
}
