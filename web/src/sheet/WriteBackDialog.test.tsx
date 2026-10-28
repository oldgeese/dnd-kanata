import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WriteBackDialog } from "./WriteBackDialog";

const callable = vi.fn();
vi.mock("../firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => callable }));

const onClose = vi.fn();

function setup(saveState: "saved" | "saving" | "offline" | "error" = "saved") {
  render(<WriteBackDialog sheetId="s1" saveState={saveState} onClose={onClose} />);
}
const pw = () => screen.getByLabelText("元サイトのパスワード");
async function run(password = "secret") {
  await userEvent.type(pw(), password);
  await userEvent.click(screen.getByRole("button", { name: "書き戻す" }));
}
function fail(code: string) {
  return Object.assign(new Error(code), { code: `functions/${code}` });
}

beforeEach(() => {
  callable.mockReset();
  onClose.mockReset();
});

describe("WriteBackDialog", () => {
  it("has a non-autofilled password field", () => {
    setup();
    expect(pw()).toHaveAttribute("type", "password");
    expect(pw()).toHaveAttribute("autocomplete", "off");
  });

  it("calls writeBack and clears the password on ok", async () => {
    callable.mockResolvedValue({ data: { status: "ok" } });
    setup();
    await run();
    expect(callable).toHaveBeenCalledWith({ sheetId: "s1", password: "secret" });
    expect(await screen.findByText("元サイトに反映しました")).toBeInTheDocument();
    expect(pw()).toHaveValue("");
  });

  it("shows bad-password", async () => {
    callable.mockResolvedValue({ data: { status: "bad-password" } });
    setup();
    await run();
    expect(await screen.findByText("パスワードが違います")).toBeInTheDocument();
  });

  it("asks before overwriting on source-changed and retries with force", async () => {
    callable.mockResolvedValueOnce({ data: { status: "source-changed", sourceLastUpdate: "A", currentLastUpdate: "B" } });
    setup();
    await run();
    expect(
      await screen.findByText("元サイトは取り込み後に更新されています（取り込み時: A / 現在: B）。上書きしますか？"),
    ).toBeInTheDocument();
    callable.mockResolvedValueOnce({ data: { status: "ok" } });
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(callable).toHaveBeenLastCalledWith({ sheetId: "s1", password: "secret", force: true });
    expect(await screen.findByText("元サイトに反映しました")).toBeInTheDocument();
  });

  it("cancelling the overwrite prompt does not call again", async () => {
    callable.mockResolvedValueOnce({ data: { status: "source-changed", sourceLastUpdate: "A", currentLastUpdate: "B" } });
    setup();
    await run();
    await screen.findByText(/上書きしますか/);
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByText(/上書きしますか/)).not.toBeInTheDocument();
    expect(callable).toHaveBeenCalledTimes(1);
  });

  it("lists unencodable fields with labels, falling back to raw names", async () => {
    callable.mockResolvedValue({ data: { status: "unencodable", fields: ["char_name", "weird_field"] } });
    setup();
    await run();
    expect(
      await screen.findByText("元サイトで使えない文字（絵文字など）が含まれています: キャラクター名、weird_field"),
    ).toBeInTheDocument();
  });

  it("shows schema-changed", async () => {
    callable.mockResolvedValue({ data: { status: "schema-changed", added: ["x"] } });
    setup();
    await run();
    expect(await screen.findByText("元サイトの入力項目が変わったため書き戻せません。取り込み直してください")).toBeInTheDocument();
  });

  it.each([
    ["resource-exhausted", "操作が多すぎます。1 分ほど待ってから再度お試しください"],
    ["unavailable", "元サイトに接続できませんでした。時間をおいて再度お試しください"],
    ["internal", "書き戻しに失敗しました。時間をおいて再度お試しください"],
  ])("maps %s errors", async (code, message) => {
    callable.mockRejectedValue(fail(code));
    setup();
    await run();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("disables the run button until the sheet is saved", async () => {
    setup("saving");
    expect(screen.getByText("未保存の編集があります。保存が終わってから実行してください")).toBeInTheDocument();
    await userEvent.type(pw(), "secret");
    expect(screen.getByRole("button", { name: "書き戻す" })).toBeDisabled();
  });

  it("disables the run button without a password", () => {
    setup();
    expect(screen.getByRole("button", { name: "書き戻す" })).toBeDisabled();
  });

  it("closes via the close button", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls writeBack only once for two synchronous clicks", async () => {
    callable.mockReturnValue(new Promise(() => {}));
    setup();
    await userEvent.type(pw(), "secret");
    const btn = screen.getByRole("button", { name: "書き戻す" });
    act(() => {
      btn.click();
      btn.click();
    });
    expect(callable).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ status: "unencodable", fields: ["char_name"] }, "元サイトで使えない文字"],
    [{ status: "schema-changed", added: ["x"] }, "元サイトの入力項目が変わったため"],
  ])("clears the password after %o", async (data, text) => {
    callable.mockResolvedValue({ data });
    setup();
    await run();
    await screen.findByText(new RegExp(text));
    expect(pw()).toHaveValue("");
  });

  it("clears the password after bad-password", async () => {
    callable.mockResolvedValue({ data: { status: "bad-password" } });
    setup();
    await run();
    await screen.findByText("パスワードが違います");
    expect(pw()).toHaveValue("");
  });

  it("clears the password after an error", async () => {
    callable.mockRejectedValue(fail("internal"));
    setup();
    await run();
    await screen.findByRole("alert");
    expect(pw()).toHaveValue("");
  });

  it("keeps the password while awaiting confirm, clears it after cancel and after the forced rerun", async () => {
    callable.mockResolvedValue({ data: { status: "source-changed", sourceLastUpdate: "A", currentLastUpdate: "B" } });
    setup();
    await run();
    await screen.findByText(/上書きしますか/);
    expect(pw()).toHaveValue("secret");
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(pw()).toHaveValue("");
  });

  it("closes on Escape and focuses the password field on open", async () => {
    setup();
    expect(pw()).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("disables close and ignores Escape while in flight", async () => {
    callable.mockReturnValue(new Promise(() => {}));
    setup();
    await run();
    expect(screen.getByRole("button", { name: "閉じる" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not run on Enter in the password field", async () => {
    setup();
    await userEvent.type(pw(), "secret{Enter}");
    expect(callable).not.toHaveBeenCalled();
  });
});
