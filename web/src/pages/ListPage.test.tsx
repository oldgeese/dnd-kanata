import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListPage } from "./ListPage";

const callable = vi.fn();
const data: Record<string, unknown> = {};

vi.mock("../firebase", () => ({ auth: {}, db: {}, functions: {} }));
vi.mock("../auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, loading: false, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path: string) => path,
  onValue: (path: string, cb: (s: { val(): unknown }) => void) => {
    cb({ val: () => data[path] ?? null });
    return () => {};
  },
}));
vi.mock("firebase/functions", () => ({
  httpsCallable: () => callable,
}));

function setup() {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<ListPage />} />
        <Route path="/c/:id" element={<p>sheet page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fail(code: string) {
  return Object.assign(new Error(code), { code: `functions/${code}` });
}

async function submit(value = "54555") {
  await userEvent.type(screen.getByLabelText("取り込み元の URL または ID"), value);
  await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
}

beforeEach(() => {
  callable.mockReset();
  for (const k of Object.keys(data)) delete data[k];
  data["users/u1/sheets"] = { a1: true, b2: true };
  data["sheets/a1/fields"] = { char_name: "カタナ", char_class: "ファイター", char_level: "3" };
  data["sheets/b2/fields"] = { char_name: "ミナ", char_class: "ウィザード", char_level: "5" };
});

describe("ListPage", () => {
  it("lists sheets with links", () => {
    setup();
    const link = screen.getByRole("link", { name: /カタナ/ });
    expect(link).toHaveAttribute("href", "/c/a1");
    expect(link).toHaveTextContent("ファイター");
    expect(link).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: /ミナ/ })).toHaveAttribute("href", "/c/b2");
  });

  it("does not import on Enter, only on button click", async () => {
    callable.mockResolvedValue({ data: { status: "created", sheetId: "n1" } });
    setup();
    await userEvent.type(screen.getByLabelText("取り込み元の URL または ID"), "54555{Enter}");
    expect(callable).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "取り込む" }));
    expect(callable).toHaveBeenCalledTimes(1);
  });

  it("imports and navigates on created", async () => {
    callable.mockResolvedValue({ data: { status: "created", sheetId: "n1" } });
    setup();
    await submit();
    expect(callable).toHaveBeenCalledWith({ source: "54555" });
    expect(await screen.findByText("sheet page")).toBeInTheDocument();
  });

  it("confirms in-page on exists and overwrites on OK", async () => {
    callable
      .mockResolvedValueOnce({ data: { status: "exists", sheetId: "a1" } })
      .mockResolvedValueOnce({ data: { status: "overwritten", sheetId: "a1" } });
    setup();
    await submit();
    const dlg = await screen.findByRole("dialog");
    expect(dlg).toHaveTextContent("取り込み済みです。元サイトの内容で上書きしますか？（この画面での編集内容は失われます）");
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    await waitFor(() => expect(callable).toHaveBeenLastCalledWith({ source: "54555", overwrite: true }));
    expect(await screen.findByText("sheet page")).toBeInTheDocument();
  });

  it("cancel on exists does not overwrite", async () => {
    callable.mockResolvedValueOnce({ data: { status: "exists", sheetId: "a1" } });
    setup();
    await submit();
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(callable).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["invalid-argument", "元サイトの URL か数字の ID を入力してください"],
    ["not-found", "元サイトにそのキャラクターが見つかりません"],
    ["unavailable", "元サイトに接続できませんでした。時間をおいて再度お試しください"],
    ["resource-exhausted", "操作が多すぎます。1 分ほど待ってから再度お試しください"],
  ])("shows message for %s", async (code, msg) => {
    callable.mockRejectedValue(fail(code));
    setup();
    await submit("x");
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
  });
});
