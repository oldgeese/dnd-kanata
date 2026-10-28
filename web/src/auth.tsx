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

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, signIn } = useAuth();
  if (loading) return <p className="center">読み込み中…</p>;
  if (!user) {
    return (
      <main className="center">
        <h1>dnd-kanata</h1>
        <p>D&amp;D 5e キャラクターシートの閲覧・編集</p>
        <button onClick={() => void signIn()}>Google でログイン</button>
      </main>
    );
  }
  return <>{children}</>;
}
