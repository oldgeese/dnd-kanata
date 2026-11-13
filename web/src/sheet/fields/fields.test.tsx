import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DerivedValue } from "./DerivedValue";
import { EditableCheckbox } from "./EditableCheckbox";
import { EditableNumber } from "./EditableNumber";
import { EditableSelect } from "./EditableSelect";
import { EditableTags } from "./EditableTags";
import { EditableText } from "./EditableText";
import { EditableTextarea } from "./EditableTextarea";

describe("EditableText", () => {
  it("shows a faint dash for an empty value", () => {
    render(<EditableText label="名前" value="" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "名前" })).toHaveTextContent("—");
  });

  it("enters edit mode on click and commits on Enter", async () => {
    const onChange = vi.fn();
    render(<EditableText label="名前" value="カタナ" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "名前" }));
    const input = screen.getByRole("textbox", { name: "名前" });
    expect(input).toHaveValue("カタナ");
    expect(input).toHaveFocus();
    await userEvent.clear(input);
    await userEvent.type(input, "ミナ{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("ミナ");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("commits on blur", async () => {
    const onChange = vi.fn();
    render(<EditableText label="名前" value="" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "名前" }));
    await userEvent.type(screen.getByRole("textbox"), "x");
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledWith("x");
  });

  it("cancels on Escape", async () => {
    const onChange = vi.fn();
    render(<EditableText label="名前" value="カタナ" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "名前" }));
    await userEvent.type(screen.getByRole("textbox"), "zzz{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("カタナ")).toBeInTheDocument();
  });

  it("enters edit mode with the keyboard", async () => {
    render(<EditableText label="名前" value="a" onChange={vi.fn()} />);
    screen.getByRole("button", { name: "名前" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "名前" })).toBeInTheDocument();
  });

  it("does not call onChange when the value is unchanged", async () => {
    const onChange = vi.fn();
    render(<EditableText label="名前" value="a" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "名前" }));
    await userEvent.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("EditableTextarea", () => {
  it("commits on blur only (Enter inserts a newline)", async () => {
    const onChange = vi.fn();
    render(<EditableTextarea label="メモ" value="a" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "メモ" }));
    await userEvent.type(screen.getByRole("textbox", { name: "メモ" }), "{Enter}b");
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledWith("a\nb");
  });

  it("cancels on Escape", async () => {
    const onChange = vi.fn();
    render(<EditableTextarea label="メモ" value="a" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "メモ" }));
    await userEvent.type(screen.getByRole("textbox"), "b{Escape}");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("EditableNumber", () => {
  it("increments with +", async () => {
    const onChange = vi.fn();
    render(<EditableNumber label="GP" value="7" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "GP を 1 増やす" }));
    expect(onChange).toHaveBeenCalledWith("8");
  });

  it("treats an empty value as 0", async () => {
    const onChange = vi.fn();
    render(<EditableNumber label="GP" value="" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "GP を 1 増やす" }));
    expect(onChange).toHaveBeenCalledWith("1");
  });

  it("decrements with −", async () => {
    const onChange = vi.fn();
    render(<EditableNumber label="GP" value="7" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "GP を 1 減らす" }));
    expect(onChange).toHaveBeenCalledWith("6");
  });

  it("can be edited directly", async () => {
    const onChange = vi.fn();
    render(<EditableNumber label="GP" value="7" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "GP" }));
    const input = screen.getByRole("textbox", { name: "GP" });
    await userEvent.clear(input);
    await userEvent.type(input, "12{Enter}");
    expect(onChange).toHaveBeenCalledWith("12");
  });

  it("does not go below min or above max", () => {
    render(<EditableNumber label="使用" value="0" min={0} max={3} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "使用 を 1 減らす" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "使用 を 1 増やす" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("disables + at max", () => {
    render(<EditableNumber label="使用" value="3" min={0} max={3} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "使用 を 1 増やす" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "使用 を 1 減らす" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("keeps focus on the button and ignores presses after reaching max", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<EditableNumber label="使用" value="2" min={0} max={3} onChange={onChange} />);
    const plus = screen.getByRole("button", { name: "使用 を 1 増やす" });
    plus.focus();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("3");
    rerender(<EditableNumber label="使用" value="3" min={0} max={3} onChange={onChange} />);
    expect(plus).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("brings a value outside the range back toward it", async () => {
    const onChange = vi.fn();
    render(<EditableNumber label="使用" value="5" min={0} max={3} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "使用 を 1 減らす" }));
    expect(onChange).toHaveBeenCalledWith("4");
  });

  it("reads full-width digits", async () => {
    const onChange = vi.fn();
    render(<EditableNumber label="GP" value="１２" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "GP を 1 増やす" }));
    expect(onChange).toHaveBeenCalledWith("13");
  });

  it("disables ± for a value that is not an integer, so it is not overwritten", () => {
    render(<EditableNumber label="使用" value="2/3" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "使用 を 1 増やす" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "使用 を 1 減らす" })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("EditableCheckbox", () => {
  it("toggles between checkedValue and empty", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<EditableCheckbox label="習熟" value="" checkedValue="on" onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "習熟" });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith("on");

    rerender(<EditableCheckbox label="習熟" value="true" checkedValue="true" onChange={onChange} />);
    expect(screen.getByRole("checkbox", { name: "習熟" })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "習熟" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});

describe("EditableSelect", () => {
  const options = [
    { value: "", label: "" },
    { value: "M", label: "中型" },
    { value: "S", label: "小型" },
  ];

  it("shows the option label and commits a choice", async () => {
    const onChange = vi.fn();
    render(<EditableSelect label="サイズ" value="M" options={options} onChange={onChange} />);
    const btn = screen.getByRole("button", { name: "サイズ" });
    expect(btn).toHaveTextContent("中型");
    await userEvent.click(btn);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "サイズ" }), "S");
    expect(onChange).toHaveBeenCalledWith("S");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("cancels on Escape", async () => {
    const onChange = vi.fn();
    render(<EditableSelect label="サイズ" value="M" options={options} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "サイズ" }));
    await userEvent.keyboard("{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("DerivedValue", () => {
  it("shows the value and its breakdown", () => {
    render(
      <DerivedValue
        label="隠密"
        derived={{
          value: "9",
          parts: [
            { label: "DEX", value: "5" },
            { label: "習熟", value: "4" },
            { label: "その他", value: "0" },
          ],
        }}
      />,
    );
    const el = screen.getByLabelText("隠密");
    expect(el).toHaveTextContent("9");
    expect(el).toHaveAttribute("title", "DEX+5 / 習熟+4 / その他+0");
  });

  it("formats negative parts", () => {
    render(<DerivedValue label="x" derived={{ value: "-1", parts: [{ label: "STR", value: "-1" }] }} />);
    expect(screen.getByLabelText("x")).toHaveAttribute("title", "STR-1");
  });
});

describe("readOnly", () => {
  it("never enters edit mode", async () => {
    const onChange = vi.fn();
    render(
      <>
        <EditableText label="t" value="a" onChange={onChange} readOnly />
        <EditableTextarea label="ta" value="a" onChange={onChange} readOnly />
        <EditableNumber label="n" value="7" onChange={onChange} readOnly />
        <EditableCheckbox label="c" value="" checkedValue="on" onChange={onChange} readOnly />
        <EditableSelect label="s" value="M" options={options()} onChange={onChange} readOnly />
      </>,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    for (const name of ["t", "ta", "n", "s"]) await userEvent.click(screen.getByLabelText(name));
    await userEvent.click(screen.getByRole("checkbox", { name: "c" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "c" })).not.toBeChecked();
  });
});

function options() {
  return [{ value: "M", label: "中型" }];
}

describe("EditableTags", () => {
  // 親の状態を更新する実際の使われ方に合わせ、保存される文字列を画面に出す
  function Harness({ initial = "", readOnly }: { initial?: string; readOnly?: boolean }) {
    const [value, setValue] = useState(initial);
    return (
      <>
        <EditableTags label="タグ" value={value} onChange={setValue} readOnly={readOnly} />
        <output data-testid="saved">{value}</output>
      </>
    );
  }
  const saved = () => screen.getByTestId("saved").textContent;
  const input = () => screen.getByRole("textbox", { name: "タグ" });
  const chips = () => screen.queryAllByRole("listitem").map((li) => li.firstChild?.textContent);

  it("shows each space-separated word as a tag", () => {
    render(<Harness initial="戦士 エルフ" />);
    expect(chips()).toEqual(["戦士", "エルフ"]);
  });

  it("confirms a word with a half-width space", async () => {
    render(<Harness />);
    await userEvent.type(input(), "戦士 ");
    expect(saved()).toBe("戦士");
    expect(input()).toHaveValue("");
  });

  it("confirms a word with Enter and joins tags with half-width spaces", async () => {
    render(<Harness initial="戦士" />);
    await userEvent.type(input(), "エルフ{Enter}");
    expect(saved()).toBe("戦士 エルフ");
    expect(input()).toHaveValue("");
    expect(input()).toHaveFocus();
  });

  it("keeps a full-width space inside a word", async () => {
    render(<Harness />);
    await userEvent.type(input(), "ダーク　エルフ{Enter}");
    expect(saved()).toBe("ダーク　エルフ");
    expect(chips()).toEqual(["ダーク　エルフ"]);
  });

  it("trims surrounding full-width spaces", async () => {
    render(<Harness />);
    await userEvent.type(input(), "　戦士　{Enter}");
    expect(saved()).toBe("戦士");
  });

  it("ignores a word of only full-width spaces", async () => {
    const onChange = vi.fn();
    render(<EditableTags label="タグ" value="" onChange={onChange} />);
    await userEvent.type(input(), "　{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(input()).toHaveValue("");
  });

  it("confirms the draft on blur", async () => {
    render(<Harness />);
    await userEvent.type(input(), "戦士");
    await userEvent.tab();
    expect(saved()).toBe("戦士");
  });

  it("splits pasted text into tags", async () => {
    render(<Harness initial="戦士" />);
    await userEvent.click(input());
    await userEvent.paste("a b\tc\nd");
    expect(saved()).toBe("戦士 a b c d");
    expect(input()).toHaveValue("");
  });

  it("leaves pasted text without a separator in the draft", async () => {
    render(<Harness />);
    await userEvent.click(input());
    await userEvent.paste("戦士");
    expect(saved()).toBe("");
    expect(input()).toHaveValue("戦士");
  });

  it("does not add a duplicate", async () => {
    const onChange = vi.fn();
    render(<EditableTags label="タグ" value="戦士" onChange={onChange} />);
    await userEvent.type(input(), "戦士{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(input()).toHaveValue("");
  });

  it("removes a tag with its button", async () => {
    render(<Harness initial="戦士 エルフ 盗賊" />);
    await userEvent.click(screen.getByRole("button", { name: "エルフ を削除" }));
    expect(saved()).toBe("戦士 盗賊");
  });

  it("moves focus to the input after removing a tag with the keyboard", async () => {
    render(<Harness initial="戦士" />);
    screen.getByRole("button", { name: "戦士 を削除" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(saved()).toBe("");
    expect(input()).toHaveFocus();
  });

  it("does not remove a tag with Backspace on an empty input", async () => {
    render(<Harness initial="戦士 エルフ" />);
    await userEvent.type(input(), "{Backspace}");
    expect(saved()).toBe("戦士 エルフ");
    expect(chips()).toEqual(["戦士", "エルフ"]);
  });

  it("keeps the draft when only the window loses focus", async () => {
    render(<Harness />);
    await userEvent.type(input(), "ダーク");
    // ウィンドウやタブの切り替えでは blur が起きても activeElement は入力欄のまま
    fireEvent.blur(input());
    expect(saved()).toBe("");
    expect(input()).toHaveValue("ダーク");
  });

  it("treats other whitespace such as NBSP as a separator", async () => {
    render(<Harness />);
    await userEvent.click(input());
    await userEvent.paste("戦士 エルフ ");
    expect(saved()).toBe("戦士 エルフ");
    expect(input()).toHaveValue("");
  });

  it("does not create a tag from only NBSP", async () => {
    const onChange = vi.fn();
    render(<EditableTags label="タグ" value="" onChange={onChange} />);
    await userEvent.click(input());
    await userEvent.paste(" ");
    expect(onChange).not.toHaveBeenCalled();
    expect(input()).toHaveValue("");
  });

  it("keeps tags when Backspace clears the draft and is pressed again", async () => {
    render(<Harness initial="戦士" />);
    await userEvent.type(input(), "ab{Backspace}{Backspace}{Backspace}");
    expect(input()).toHaveValue("");
    expect(saved()).toBe("戦士");
  });

  it("reaches the input before the remove buttons with Tab", async () => {
    render(<Harness initial="戦士" />);
    await userEvent.tab();
    expect(input()).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "戦士 を削除" })).toHaveFocus();
  });

  it("discards the draft on Escape", async () => {
    render(<Harness initial="戦士" />);
    await userEvent.type(input(), "zzz{Escape}");
    expect(input()).toHaveValue("");
    await userEvent.tab();
    expect(saved()).toBe("戦士");
  });

  it("does not confirm on Enter during IME composition", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "せんし" } });
    fireEvent.keyDown(input(), { key: "Enter", keyCode: 229 });
    expect(saved()).toBe("");
    expect(input()).toHaveValue("せんし");
  });

  it("does not split on a half-width space until composition ends", () => {
    render(<Harness />);
    fireEvent.compositionStart(input());
    fireEvent.input(input(), { target: { value: "a b" }, isComposing: true });
    expect(saved()).toBe("");
    expect(input()).toHaveValue("a b");
    fireEvent.compositionEnd(input());
    expect(saved()).toBe("a");
    expect(input()).toHaveValue("b");
  });

  it("collapses odd spacing and duplicates for display without rewriting the value", () => {
    render(<Harness initial=" 戦士  エルフ 戦士 " />);
    expect(chips()).toEqual(["戦士", "エルフ"]);
    expect(saved()).toBe(" 戦士  エルフ 戦士 ");
  });

  it("shows tags without controls when read-only", () => {
    render(<Harness initial="戦士 エルフ" readOnly />);
    expect(chips()).toEqual(["戦士", "エルフ"]);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a faint dash when read-only and empty", () => {
    render(<Harness readOnly />);
    expect(screen.getByLabelText("タグ")).toHaveTextContent("—");
  });
});
