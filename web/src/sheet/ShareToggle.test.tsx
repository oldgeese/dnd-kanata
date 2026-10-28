import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareToggle } from "./ShareToggle";

const set = vi.fn();
vi.mock("../firebase", () => ({ db: {} }));
vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path: string) => path,
  set: (...args: unknown[]) => set(...args),
}));

beforeEach(() => {
  set.mockReset();
  set.mockResolvedValue(undefined);
});

describe("ShareToggle", () => {
  it("writes true and shows the share link with a copy button when turned on", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShareToggle sheetId="s1" shared={false} />);
    expect(screen.queryByDisplayValue(`${window.location.origin}/s/s1`)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "閲覧用リンクを有効にする" }));
    expect(set).toHaveBeenCalledWith("sheets/s1/shared", true);
  });

  it("shows the link and copies it when shared", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShareToggle sheetId="s1" shared />);
    expect(screen.getByRole("textbox", { name: "閲覧用リンク" })).toHaveValue(`${window.location.origin}/s/s1`);
    await userEvent.click(screen.getByRole("button", { name: "コピー" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/s/s1`);
  });

  it("writes false when turned off", async () => {
    render(<ShareToggle sheetId="s1" shared />);
    await userEvent.click(screen.getByRole("checkbox", { name: "閲覧用リンクを有効にする" }));
    expect(set).toHaveBeenCalledWith("sheets/s1/shared", false);
  });

  it("shows an error when the write fails", async () => {
    set.mockRejectedValue(new Error("denied"));
    render(<ShareToggle sheetId="s1" shared={false} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "閲覧用リンクを有効にする" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("共有設定を変更できませんでした");
  });
});
