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
  temp_hp: t(),
  PP: t(),
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
  temp_hp: "",
  PP: "3",
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

  describe("HP", () => {
    const withFields = (fields: Record<string, string>) => ({ ...SHEET, fields: { ...FIELDS, ...fields } });
    const amount = () => screen.getByRole("textbox", { name: "HP 増減量" });
    const damage = () => screen.getByRole("button", { name: "ダメージ" });
    const heal = () => screen.getByRole("button", { name: "回復" });

    it("saves current and temp HP together when damage spills over", async () => {
      setup("/c/s1", withFields({ current_hp: "20", temp_hp: "5" }));
      await userEvent.type(amount(), "13");
      await userEvent.click(damage());
      expect(screen.getByRole("button", { name: "現在 HP" })).toHaveTextContent("12");
      expect(screen.getByRole("button", { name: "一時 HP" })).toHaveTextContent("0");
      expect(amount()).toHaveValue("");
      await waitFor(() => expect(update).toHaveBeenCalledWith("sheets/s1", { "fields/current_hp": "12", "fields/temp_hp": "0", updatedAt: "TS" }));
    });

    it("saves only temp HP when it absorbs all the damage", async () => {
      setup("/c/s1", withFields({ current_hp: "20", temp_hp: "5" }));
      await userEvent.type(amount(), "3");
      await userEvent.click(damage());
      await waitFor(() => expect(update).toHaveBeenCalledWith("sheets/s1", { "fields/temp_hp": "2", updatedAt: "TS" }));
    });

    it("heals up to max HP without touching temp HP", async () => {
      setup("/c/s1", withFields({ current_hp: "12", temp_hp: "5" }));
      await userEvent.type(amount(), "13");
      await userEvent.click(heal());
      expect(screen.getByRole("button", { name: "現在 HP" })).toHaveTextContent("20");
      await waitFor(() => expect(update).toHaveBeenCalledWith("sheets/s1", { "fields/current_hp": "20", updatedAt: "TS" }));
    });

    it("works when the sheet has no temp HP field", async () => {
      const schema: Record<string, FieldDef> = { ...SCHEMA };
      delete schema.temp_hp;
      const fields: Record<string, string> = { ...FIELDS };
      delete fields.temp_hp;
      setup("/c/s1", { ...SHEET, schema, fields });
      await userEvent.type(amount(), "3");
      await userEvent.click(damage());
      await waitFor(() => expect(update).toHaveBeenCalledWith("sheets/s1", { "fields/current_hp": "4", updatedAt: "TS" }));
    });

    it("ignores temp HP left in fields when the sheet has no temp HP field", async () => {
      const schema: Record<string, FieldDef> = { ...SCHEMA };
      delete schema.temp_hp;
      setup("/c/s1", { ...SHEET, schema, fields: { ...FIELDS, temp_hp: "5" } });
      await userEvent.type(amount(), "3");
      await userEvent.click(damage());
      await waitFor(() => expect(update).toHaveBeenCalledWith("sheets/s1", { "fields/current_hp": "4", updatedAt: "TS" }));
    });

    it("ignores a hidden temp HP", async () => {
      const schema: Record<string, FieldDef> = { ...SCHEMA, temp_hp: { kind: "hidden", order: order++ } };
      setup("/c/s1", { ...SHEET, schema, fields: { ...FIELDS, temp_hp: "5" } });
      await userEvent.type(amount(), "3");
      await userEvent.click(damage());
      await waitFor(() => expect(update).toHaveBeenCalledWith("sheets/s1", { "fields/current_hp": "4", updatedAt: "TS" }));
    });

    it.each([["current_hp"], ["temp_hp"], ["max_hp"]])("disables the buttons and says why when %s is not a number", async (name) => {
      setup("/c/s1", withFields({ [name]: "20/30" }));
      await userEvent.type(amount(), "3");
      expect(damage()).toBeDisabled();
      expect(heal()).toBeDisabled();
      expect(screen.getByText("HP が数値でないため使えません")).toBeInTheDocument();
    });

    it("does not block on a non-numeric temp HP the sheet does not show", async () => {
      const schema: Record<string, FieldDef> = { ...SCHEMA };
      delete schema.temp_hp;
      setup("/c/s1", { ...SHEET, schema, fields: { ...FIELDS, temp_hp: "abc" } });
      await userEvent.type(amount(), "3");
      expect(damage()).toBeEnabled();
      expect(screen.queryByText("HP が数値でないため使えません")).not.toBeInTheDocument();
    });

    it("disables the buttons until the amount is a positive integer", async () => {
      setup();
      expect(damage()).toBeDisabled();
      expect(heal()).toBeDisabled();
      await userEvent.type(amount(), "0");
      expect(damage()).toBeDisabled();
      await userEvent.clear(amount());
      await userEvent.type(amount(), "3");
      expect(damage()).toBeEnabled();
      expect(heal()).toBeEnabled();
    });

    it("does not apply the amount on Enter", async () => {
      setup();
      await userEvent.type(amount(), "3{Enter}");
      expect(screen.getByRole("button", { name: "現在 HP" })).toHaveTextContent("7");
      expect(amount()).toHaveValue("3");
    });

    it("moves focus back to the amount after applying with the keyboard", async () => {
      setup();
      await userEvent.type(amount(), "3");
      damage().focus();
      await userEvent.keyboard("{Enter}");
      expect(screen.getByRole("button", { name: "現在 HP" })).toHaveTextContent("4");
      expect(amount()).toHaveFocus();
    });

    it("shows the adjuster when current HP has no value", async () => {
      const fields: Record<string, string> = { ...FIELDS };
      delete fields.current_hp;
      setup("/c/s1", { ...SHEET, fields });
      await userEvent.type(amount(), "5");
      await userEvent.click(heal());
      expect(screen.getByRole("button", { name: "現在 HP" })).toHaveTextContent("5");
    });

    it("shows the adjuster when current HP is an empty string", () => {
      setup("/c/s1", withFields({ current_hp: "" }));
      expect(amount()).toBeInTheDocument();
    });

    it("hides the adjuster when the sheet has no current HP field", () => {
      const schema: Record<string, FieldDef> = { ...SCHEMA };
      delete schema.current_hp;
      setup("/c/s1", { ...SHEET, schema });
      expect(screen.queryByRole("textbox", { name: "HP 増減量" })).not.toBeInTheDocument();
    });

    it("hides the adjuster when read-only", () => {
      setup("/s/s1");
      expect(screen.queryByRole("textbox", { name: "HP 増減量" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "ダメージ" })).not.toBeInTheDocument();
    });

    it("removes the ± buttons from HP but keeps them on coins", () => {
      setup();
      for (const hp of ["最大 HP", "現在 HP", "一時 HP"]) {
        expect(screen.getByRole("button", { name: hp })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: `${hp} を 1 増やす` })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: `${hp} を 1 減らす` })).not.toBeInTheDocument();
      }
      expect(screen.getByRole("button", { name: /^PP.* を 1 増やす$/ })).toBeInTheDocument();
    });
  });

  it("shows not-found when the sheet cannot be read", () => {
    setup("/s/s1", null);
    expect(screen.getByText("シートが見つかりません（共有が無効になっている可能性があります）")).toBeInTheDocument();
  });
});
