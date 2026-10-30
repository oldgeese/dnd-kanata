import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DerivedValue } from "./DerivedValue";
import { EditableCheckbox } from "./EditableCheckbox";
import { EditableNumber } from "./EditableNumber";
import { EditableSelect } from "./EditableSelect";
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
