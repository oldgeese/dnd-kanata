import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, RequireAuth } from "./auth";

const signInWithPopup = vi.fn();
const sendSignInLinkToEmail = vi.fn();
const signInWithEmailLink = vi.fn();
let currentUser: unknown = null;
vi.mock("./firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {},
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    cb(currentUser);
    return () => {};
  },
  signInWithPopup: (...args: unknown[]) => signInWithPopup(...args),
  sendSignInLinkToEmail: (...args: unknown[]) => sendSignInLinkToEmail(...args),
  isSignInWithEmailLink: (_auth: unknown, href: string) => new URL(href).searchParams.get("mode") === "signIn",
  signInWithEmailLink: (...args: unknown[]) => signInWithEmailLink(...args),
  signOut: vi.fn(),
}));

const EMAIL_KEY = "dnd-kanata:emailForSignIn";
const LINK = "/c/abc?apiKey=k&oobCode=code&mode=signIn&lang=ja";

function renderAuth() {
  render(
    <AuthProvider>
      <RequireAuth>
        <p>inside</p>
      </RequireAuth>
    </AuthProvider>,
  );
}

function setup() {
  renderAuth();
  return userEvent.click(screen.getByRole("button", { name: "Google でログイン" }));
}

async function sendLink(email: string) {
  renderAuth();
  await userEvent.type(screen.getByLabelText("メールアドレス"), email);
  await userEvent.click(screen.getByRole("button", { name: "ログイン用のリンクを送る" }));
}

const authError = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  currentUser = null;
  signInWithPopup.mockReset();
  sendSignInLinkToEmail.mockReset().mockResolvedValue(undefined);
  signInWithEmailLink.mockReset().mockResolvedValue({});
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("RequireAuth", () => {
  it.each(["auth/popup-closed-by-user", "auth/cancelled-popup-request"])(
    "stays quiet when sign-in is cancelled (%s)",
    async (code) => {
      signInWithPopup.mockRejectedValue(authError(code));
      await setup();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("shows an error when sign-in fails", async () => {
    signInWithPopup.mockRejectedValue(authError("auth/network-request-failed"));
    await setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("ログインできませんでした");
  });
});

describe("email link sign-in", () => {
  it("sends a sign-in link that returns to the current page", async () => {
    window.history.replaceState(null, "", "/c/abc");
    await sendLink("a@example.com");
    expect(sendSignInLinkToEmail).toHaveBeenCalledWith({}, "a@example.com", {
      url: "http://localhost:3000/c/abc",
      handleCodeInApp: true,
    });
    expect(await screen.findByText(/a@example.com にログイン用のリンクを送りました/)).toBeInTheDocument();
    expect(localStorage.getItem(EMAIL_KEY)).toBe("a@example.com");
  });

  it("shows an error for a malformed address", async () => {
    sendSignInLinkToEmail.mockRejectedValue(authError("auth/invalid-email"));
    // ブラウザの入力チェックは通るが、Firebase が受け付けないアドレス
    await sendLink("a@b");
    expect(await screen.findByRole("alert")).toHaveTextContent("メールアドレスの形式が正しくありません");
    expect(localStorage.getItem(EMAIL_KEY)).toBeNull();
  });

  it("shows an error when the link cannot be sent", async () => {
    sendSignInLinkToEmail.mockRejectedValue(authError("auth/quota-exceeded"));
    await sendLink("a@example.com");
    expect(await screen.findByRole("alert")).toHaveTextContent("リンクを送れませんでした");
  });

  it("completes sign-in from the link with the remembered address", async () => {
    localStorage.setItem(EMAIL_KEY, "a@example.com");
    window.history.replaceState(null, "", LINK);
    const href = window.location.href;
    renderAuth();
    await waitFor(() => expect(signInWithEmailLink).toHaveBeenCalledWith({}, "a@example.com", href));
    expect(signInWithEmailLink).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(window.location.pathname).toBe("/c/abc");
    expect(localStorage.getItem(EMAIL_KEY)).toBeNull();
  });

  it("asks for the address when the link is opened on another device", async () => {
    window.history.replaceState(null, "", LINK);
    const href = window.location.href;
    renderAuth();
    expect(signInWithEmailLink).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("メールアドレス"), "a@example.com");
    await userEvent.click(screen.getByRole("button", { name: "ログイン" }));
    expect(signInWithEmailLink).toHaveBeenCalledWith({}, "a@example.com", href);
  });

  it("lets the user retry when the confirmed address does not match", async () => {
    signInWithEmailLink.mockRejectedValue(authError("auth/invalid-email"));
    window.history.replaceState(null, "", LINK);
    renderAuth();
    await userEvent.type(screen.getByLabelText("メールアドレス"), "b@example.com");
    await userEvent.click(screen.getByRole("button", { name: "ログイン" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("リンクを送ったメールアドレスと一致しません");
    expect(screen.getByLabelText("メールアドレス")).toHaveValue("b@example.com");
  });

  it("offers a way back to the sign-in screen from the confirmation screen", async () => {
    window.history.replaceState(null, "", LINK);
    renderAuth();
    await userEvent.click(screen.getByRole("button", { name: "ログイン画面に戻る" }));
    expect(screen.getByRole("button", { name: "Google でログイン" })).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("falls back to the confirmation screen when automatic sign-in fails", async () => {
    signInWithEmailLink.mockRejectedValue(authError("auth/network-request-failed"));
    localStorage.setItem(EMAIL_KEY, "a@example.com");
    window.history.replaceState(null, "", LINK);
    renderAuth();
    expect(await screen.findByRole("alert")).toHaveTextContent("ログインできませんでした");
    expect(screen.getByRole("button", { name: "ログイン" })).toBeInTheDocument();
  });

  it("ignores the link when someone is already signed in", async () => {
    currentUser = { uid: "x" };
    localStorage.setItem(EMAIL_KEY, "a@example.com");
    window.history.replaceState(null, "", LINK);
    renderAuth();
    expect(await screen.findByText("inside")).toBeInTheDocument();
    expect(signInWithEmailLink).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/c/abc");
  });

  it("returns to the sign-in screen when the link has expired", async () => {
    signInWithEmailLink.mockRejectedValue(authError("auth/invalid-action-code"));
    localStorage.setItem(EMAIL_KEY, "a@example.com");
    window.history.replaceState(null, "", LINK);
    renderAuth();
    expect(await screen.findByRole("alert")).toHaveTextContent("リンクの有効期限が切れているか、すでに使われています");
    expect(screen.getByRole("button", { name: "Google でログイン" })).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("clears the expired-link message once a new link is sent", async () => {
    signInWithEmailLink.mockRejectedValue(authError("auth/invalid-action-code"));
    localStorage.setItem(EMAIL_KEY, "a@example.com");
    window.history.replaceState(null, "", LINK);
    renderAuth();
    await screen.findByRole("alert");
    await userEvent.type(screen.getByLabelText("メールアドレス"), "a@example.com");
    await userEvent.click(screen.getByRole("button", { name: "ログイン用のリンクを送る" }));
    await screen.findByText(/にログイン用のリンクを送りました/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
