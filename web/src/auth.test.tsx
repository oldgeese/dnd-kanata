import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, RequireAuth } from "./auth";

const signInWithPopup = vi.fn();
vi.mock("./firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {},
  onAuthStateChanged: (_auth: unknown, cb: (u: null) => void) => {
    cb(null);
    return () => {};
  },
  signInWithPopup: (...args: unknown[]) => signInWithPopup(...args),
  signOut: vi.fn(),
}));

function setup() {
  render(
    <AuthProvider>
      <RequireAuth>
        <p>inside</p>
      </RequireAuth>
    </AuthProvider>,
  );
  return userEvent.click(screen.getByRole("button", { name: "Google でログイン" }));
}

beforeEach(() => {
  signInWithPopup.mockReset();
});

describe("RequireAuth", () => {
  it.each(["auth/popup-closed-by-user", "auth/cancelled-popup-request"])(
    "stays quiet when sign-in is cancelled (%s)",
    async (code) => {
      signInWithPopup.mockRejectedValue(Object.assign(new Error(code), { code }));
      await setup();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("shows an error when sign-in fails", async () => {
    signInWithPopup.mockRejectedValue(Object.assign(new Error("x"), { code: "auth/network-request-failed" }));
    await setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("ログインできませんでした");
  });
});
