import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth";
import { ListPage } from "./pages/ListPage";
import { SheetPage } from "./pages/SheetPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RequireAuth><ListPage /></RequireAuth>} />
      <Route path="/c/:sheetId" element={<RequireAuth><SheetPage readOnly={false} /></RequireAuth>} />
      <Route path="/s/:sheetId" element={<SheetPage readOnly />} />
    </Routes>
  );
}
