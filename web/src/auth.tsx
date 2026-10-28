import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as fbSignOut, type User } from "firebase/auth";
import { auth } from "./firebase";

interface AuthValue {
  user: User | null;
  loading: boolean;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      }),
    [],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signIn: async () => {
        await signInWithPopup(auth, new GoogleAuthProvider());
      },
      signOut: () => fbSignOut(auth),
    }),
    [user, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

// ポップアップを閉じた・別のポップアップで置き換えたときは、利用者の操作なのでエラーを出さない
const CANCELLED = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request"]);

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, signIn } = useAuth();
  const [error, setError] = useState(false);

  async function onSignIn() {
    setError(false);
    try {
      await signIn();
    } catch (e) {
      if (!CANCELLED.has(String((e as { code?: unknown })?.code))) setError(true);
    }
  }

  if (loading) return <p className="center">読み込み中…</p>;
  if (!user) {
    return (
      <main className="center">
        <h1>dnd-kanata</h1>
        <p>D&amp;D 5e キャラクターシートの閲覧・編集</p>
        <button onClick={() => void onSignIn()}>Google でログイン</button>
        {error && (
          <p role="alert" className="error">
            ログインできませんでした。時間をおいて再度お試しください
          </p>
        )}
      </main>
    );
  }
  return <>{children}</>;
}
