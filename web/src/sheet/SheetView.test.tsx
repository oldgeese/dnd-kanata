import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SheetView } from "./SheetView";

describe("SheetView tag field", () => {
  it("edits the tag field as tags and saves a space-separated value", async () => {
    const setField = vi.fn();
    render(<SheetView fields={{ tag: "戦士" }} schema={{ tag: { kind: "text", order: 0 } }} derived={{}} setField={setField} readOnly={false} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("戦士");
    await userEvent.type(screen.getByRole("textbox", { name: "タグ" }), "エルフ{Enter}");
    expect(setField).toHaveBeenCalledWith("tag", "戦士 エルフ");
  });
});
