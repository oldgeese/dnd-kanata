import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FormSchema } from "@dnd-kanata/core/browser";
import { SheetView } from "./SheetView";

const t = (order: number) => ({ kind: "text" as const, order });

describe("SheetView reordering", () => {
  it("攻撃の行を ↓ キーで動かすと、スロット間で値を入れ替えて保存する", async () => {
    const schema: FormSchema = {};
    let o = 0;
    for (const i of [0, 1, 2]) for (const p of ["attacks", "attacks_bonus", "attacks_damege", "attacks_type", "attacks_memo"]) schema[`${p}_${i}`] = t(o++);
    const fields = { attacks_0: "剣", attacks_bonus_0: "+5", attacks_1: "弓", attacks_damege_1: "1d8" };
    const setField = vi.fn();
    render(<SheetView fields={fields} schema={schema} derived={{}} setField={setField} readOnly={false} />);
    // 空の行（スロット 2）は並べ替えられない
    expect(screen.queryByRole("button", { name: "攻撃 3 を並べ替え" })).not.toBeInTheDocument();
    screen.getByRole("button", { name: "攻撃 1 を並べ替え" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(Object.fromEntries(setField.mock.calls)).toEqual({
      attacks_0: "弓",
      attacks_bonus_0: "",
      attacks_damege_0: "1d8",
      attacks_1: "剣",
      attacks_bonus_1: "+5",
      attacks_damege_1: "",
    });
  });

  it("所持品の行を並べ替える", async () => {
    const schema: FormSchema = {};
    let o = 0;
    for (const i of [0, 1]) for (const p of ["EQUIPMENT", "EQUIPMENTWEGIHT", "EQUIPMENTNUM"]) schema[`${p}_${i}`] = t(o++);
    const setField = vi.fn();
    render(
      <SheetView
        fields={{ EQUIPMENT_0: "ロープ", EQUIPMENT_1: "松明", EQUIPMENTNUM_1: "3" }}
        schema={schema}
        derived={{}}
        setField={setField}
        readOnly={false}
      />,
    );
    screen.getByRole("button", { name: "所持品 2 を並べ替え" }).focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(Object.fromEntries(setField.mock.calls)).toEqual({ EQUIPMENT_0: "松明", EQUIPMENTNUM_0: "3", EQUIPMENT_1: "ロープ", EQUIPMENTNUM_1: "" });
  });

  it("呪文はレベルの中で、準備のチェックごと並べ替える", async () => {
    const schema: FormSchema = {};
    let o = 0;
    for (const i of [1, 2]) {
      schema[`SPELLLV1_${i}`] = t(o++);
      schema[`SPELLLV1_${i}_PREPEARD`] = { kind: "checkbox", order: o++, checkedValue: "on" };
    }
    const setField = vi.fn();
    render(
      <SheetView
        fields={{ SPELLLV1_1: "魔法の矢", SPELLLV1_1_PREPEARD: "on", SPELLLV1_2: "盾" }}
        schema={schema}
        derived={{}}
        setField={setField}
        readOnly={false}
      />,
    );
    screen.getByRole("button", { name: "Lv1 呪文 1 を並べ替え" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(Object.fromEntries(setField.mock.calls)).toEqual({
      SPELLLV1_1: "盾",
      SPELLLV1_1_PREPEARD: "",
      SPELLLV1_2: "魔法の矢",
      SPELLLV1_2_PREPEARD: "on",
    });
  });

  it("スキーマにない項目には書き込まない", async () => {
    const schema: FormSchema = { SPELLLV0_1: t(0), SPELLLV0_2: t(1) };
    const setField = vi.fn();
    render(<SheetView fields={{ SPELLLV0_1: "光", SPELLLV0_2: "火球" }} schema={schema} derived={{}} setField={setField} readOnly={false} />);
    screen.getByRole("button", { name: "初級呪文 呪文 2 を並べ替え" }).focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(Object.fromEntries(setField.mock.calls)).toEqual({ SPELLLV0_1: "火球", SPELLLV0_2: "光" });
  });

  it("閲覧のみのときは並べ替えられない", () => {
    const schema: FormSchema = { attacks_0: t(0), attacks_1: t(1) };
    render(<SheetView fields={{ attacks_0: "剣", attacks_1: "弓" }} schema={schema} derived={{}} setField={vi.fn()} readOnly />);
    expect(screen.queryByRole("button", { name: /並べ替え/ })).not.toBeInTheDocument();
  });
});

describe("SheetView tag field", () => {
  it("edits the tag field as tags and saves a space-separated value", async () => {
    const setField = vi.fn();
    render(<SheetView fields={{ tag: "戦士" }} schema={{ tag: { kind: "text", order: 0 } }} derived={{}} setField={setField} readOnly={false} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("戦士");
    await userEvent.type(screen.getByRole("textbox", { name: "タグ" }), "エルフ{Enter}");
    expect(setField).toHaveBeenCalledWith("tag", "戦士 エルフ");
  });
});
