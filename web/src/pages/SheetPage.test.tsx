import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldDef } from "@dnd-kanata/core/browser";
import { SheetPage } from "./SheetPage";

type Snap = { val(): unknown };
const listeners = new Map<string, { cb: (s: Snap) => void; err?: (e: Error) => void }>();
const update = vi.fn();
let uid = "u1";

vi.mock("../firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => vi.fn() }));
vi.mock("../auth", () => ({ useAuth: () => ({ user: { uid } }) }));
vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path: string) => path,
  onValue: (path: string, cb: (s: Snap) => void, err?: (e: Error) => void) => {
    listeners.set(path, { cb, err });
    if (path === ".info/connected") cb({ val: () => true });
    return () => listeners.delete(path);
  },
  update: (...args: unknown[]) => update(...args),
  set: vi.fn(),
  serverTimestamp: () => "TS",
}));

let order = 0;
const t = (): FieldDef => ({ kind: "text", order: order++ });
const ro = (): FieldDef => ({ kind: "text", order: order++, readonly: true });
const cb = (): FieldDef => ({ kind: "checkbox", order: order++, checkedValue: "on" });
const SCHEMA: Record<string, FieldDef> = {
  char_name: t(),
  memo: t(),
  initiative: ro(),
  ac: ro(),
  ac_base: t(),
  dex: t(),
  dex_mod: ro(),
  DEX_ST: ro(),
  DEX_PROF_ST_CHK: cb(),
  SKILL_STEALTH: ro(),
  S_PROF_STEALTH: cb(),
  S_MOD_STEALTH: t(),
  max_hp: t(),
  current_hp: t(),
  EQUIPMENT_0: t(),
  EQUIPMENTWEGIHT_0: t(),
  EQUIPMENTNUM_0: t(),
  EQUIPMENT_1: t(),
  EQUIPMENTWEGIHT_1: t(),
  EQUIPMENTNUM_1: t(),
  EQUIPMENT_2: t(),
  EQUIPMENTWEGIHT_2: t(),
  EQUIPMENTNUM_2: t(),
};
const FIELDS = {
  char_name: "カタナ",
  memo: "",
  dex: "14",
  ac_base: "10",
  DEX_PROF_ST_CHK: "",
  S_PROF_STEALTH: "on",
  S_MOD_STEALTH: "",
  max_hp: "20",
  current_hp: "7",
  EQUIPMENT_0: "ロープ",
  EQUIPMENTWEGIHT_0: "",
  EQUIPMENTNUM_0: "",
  EQUIPMENT_1: "",
  EQUIPMENTWEGIHT_1: "",
  EQUIPMENTNUM_1: "",
  EQUIPMENT_2: "",
  EQUIPMENTWEGIHT_2: "",
  EQUIPMENTNUM_2: "",
};
const SHEET = { ownerUid: "u1", sourceId: 1, shared: true, fields: FIELDS, schema: SCHEMA, sourceLastUpdate: "", importedAt: 0, updatedAt: 0 };

function setup(path = "/c/s1", sheet: unknown = SHEET) {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/c/:sheetId" element={<SheetPage readOnly={false} />} />
        <Route path="/s/:sheetId" element={<SheetPage readOnly />} />
      </Routes>
    </MemoryRouter>,
  );
  act(() => listeners.get("sheets/s1")!.cb({ val: () => sheet }));
}

beforeEach(() => {
  listeners.clear();
  update.mockReset();
  update.mockResolvedValue(undefined);
  uid = "u1";
});

describe("SheetPage", () => {
  it("shows the sheet with derived values and save status", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("カタナ");
    expect(screen.getByRole("status")).toHaveTextContent("保存済み");
    expect(screen.getByLabelText("敏捷力 修正")).toHaveTextContent("2");
    expect(screen.getByLabelText("隠密")).toHaveTextContent("2"); // DEX+2（レベル未入力なので習熟ボーナスは空）
    expect(screen.getByRole("button", { name: "メモ" })).toHaveTextContent("—");
  });

  it("recomputes derived values immediately and autosaves the edited field", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "敏捷力 能力値" }));
    const input = screen.getByRole("textbox", { name: "敏捷力 能力値" });
    await userEvent.clear(input);
    await userEvent.type(input, "20{Enter}");
    expect(screen.getByLabelText("敏捷力 修正")).toHaveTextContent("5");
    expect(screen.getByLabelText("AC")).toHaveTextContent("15");
    expect(screen.getByLabelText("イニシアチブ")).toHaveTextContent("5");
    expect(screen.getByRole("status")).toHaveTextContent("保存中…");
    await waitFor(() => expect(update).toHaveBeenCalledWith("sheets/s1", { "fields/dex": "20", updatedAt: "TS" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("保存済み"));
  });

  it("shows only filled equipment rows plus one empty row", () => {
    setup();
    expect(screen.getByRole("button", { name: "所持品 1 品名" })).toHaveTextContent("ロープ");
    expect(screen.getByRole("button", { name: "所持品 2 品名" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "所持品 3 品名" })).not.toBeInTheDocument();
  });

  it("is read-only on /s/", () => {
    setup("/s/s1");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const sheet = screen.getByRole("main");
    expect(within(sheet).queryByRole("button", { name: "メモ" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /増やす/ })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "隠密 習熟" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "所持品 2 品名" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "閲覧用リンクを有効にする" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "元サイトに書き戻す" })).not.toBeInTheDocument();
  });

  it("shows share toggle and write-back button for the owner on /c/ and opens the dialog", async () => {
    setup();
    expect(screen.getByRole("checkbox", { name: "閲覧用リンクを有効にする" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "元サイトに書き戻す" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "元サイトに書き戻す" })).toHaveFocus();
  });

  it("is read-only for a non-owner on /c/", () => {
    uid = "someone-else";
    setup();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "メモ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "閲覧用リンクを有効にする" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "元サイトに書き戻す" })).not.toBeInTheDocument();
  });

  it("shows not-found when the sheet cannot be read", () => {
    setup("/s/s1", null);
    expect(screen.getByText("シートが見つかりません（共有が無効になっている可能性があります）")).toBeInTheDocument();
  });
});
