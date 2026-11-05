import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SortableRow, SortableRows, SortableScope } from "./SortableRows";

function List({ ids, enabled = true, onMove = vi.fn() }: { ids: number[]; enabled?: boolean; onMove?: (from: number, to: number) => void }) {
  return (
    <SortableScope enabled={enabled}>
      <SortableRows ids={ids} onMove={onMove}>
        <ul>
          {[0, 1, 2, 3].map((i) => (
            <SortableRow key={i} id={i} as="li" label={`行 ${i + 1}`}>
              {(handle) => (
                <>
                  {handle}
                  <span>内容 {i}</span>
                </>
              )}
            </SortableRow>
          ))}
        </ul>
      </SortableRows>
    </SortableScope>
  );
}

describe("SortableRows", () => {
  it("並べ替えられる行にだけ掴む場所を出す", () => {
    render(<List ids={[0, 1, 3]} />);
    expect(screen.getByRole("button", { name: "行 1 を並べ替え" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "行 4 を並べ替え" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "行 3 を並べ替え" })).not.toBeInTheDocument();
  });

  it("無効のときは掴む場所を出さない", () => {
    render(<List ids={[0, 1]} enabled={false} />);
    expect(screen.queryByRole("button", { name: /並べ替え/ })).not.toBeInTheDocument();
  });

  it("↓ キーで 1 つ下へ、↑ キーで 1 つ上へ動かし、動かした先の掴む場所へフォーカスを移す", async () => {
    const onMove = vi.fn();
    render(<List ids={[0, 1, 3]} onMove={onMove} />);
    screen.getByRole("button", { name: "行 2 を並べ替え" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onMove).toHaveBeenLastCalledWith(1, 2);
    expect(screen.getByRole("button", { name: "行 4 を並べ替え" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(onMove).toHaveBeenLastCalledWith(2, 1);
    expect(screen.getByRole("button", { name: "行 2 を並べ替え" })).toHaveFocus();
  });

  it("端の行はそれ以上動かさない", async () => {
    const onMove = vi.fn();
    render(<List ids={[0, 1]} onMove={onMove} />);
    screen.getByRole("button", { name: "行 1 を並べ替え" }).focus();
    await userEvent.keyboard("{ArrowUp}");
    screen.getByRole("button", { name: "行 2 を並べ替え" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onMove).not.toHaveBeenCalled();
  });

  it("掴む場所の役割を日本語で伝える", () => {
    render(<List ids={[0, 1]} />);
    expect(screen.getByRole("button", { name: "行 1 を並べ替え" })).toHaveAttribute("aria-roledescription", "並べ替え可能");
  });

  it("元の位置に落としたときは、並べ替えをやめたと読み上げる", () => {
    const onMove = vi.fn();
    render(<List ids={[0, 1]} onMove={onMove} />);
    // jsdom では行の位置がすべて 0 なので、落とし先は先頭の行（＝掴んだ行自身）になる
    fireEvent.pointerDown(screen.getByRole("button", { name: "行 1 を並べ替え" }), { isPrimary: true, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(document, { isPrimary: true, clientX: 0, clientY: 20 });
    fireEvent.pointerUp(document, { isPrimary: true });
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("並べ替えをやめました。");
  });

  it("落とした後は行をアニメーションさせない（要素は動かさず中身だけ入れ替えるので、動かすと一瞬違う並びに見える）", () => {
    const onMove = vi.fn();
    render(<List ids={[0, 1, 2]} onMove={onMove} />);
    // jsdom では行の位置がすべて 0 なので、落とし先は先頭の行になる
    fireEvent.pointerDown(screen.getByRole("button", { name: "行 3 を並べ替え" }), { isPrimary: true, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(document, { isPrimary: true, clientX: 0, clientY: -20 });
    fireEvent.pointerUp(document, { isPrimary: true });
    expect(onMove).toHaveBeenCalledWith(2, 0);
    for (const li of screen.getAllByRole("listitem")) {
      expect(li.style.transition).toBe("");
      expect(li.style.transform).toBe("");
    }
  });
});
