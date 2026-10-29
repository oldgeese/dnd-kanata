import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";

interface AuthValue {
  user: User | null;
  loading: boolean;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  // メールリンクでのログイン。sendEmailLink で送ったリンクを開くと emailLink にその URL が入る
  sendEmailLink(email: string): Promise<void>;
  emailLink: string | null;
  completeEmailLink(email: string): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

// リンクを開いたときにアドレスを入れ直さずに済むよう、送ったアドレスをブラウザに覚えておく
const EMAIL_KEY = "dnd-kanata:emailForSignIn";

function readEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

function writeEmail(email: string | null) {
  try {
    if (email === null) localStorage.removeItem(EMAIL_KEY);
    else localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // 保存できなくても、リンクを開いたときにアドレスを入れてもらえば済む
  }
}

// 期限切れ・使用済みのリンクは、何度試しても使えない
const DEAD_LINK = new Set(["auth/invalid-action-code", "auth/expired-action-code"]);

const errorCode = (e: unknown) => String((e as { code?: unknown })?.code);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailLink, setEmailLink] = useState(() =>
    isSignInWithEmailLink(auth, window.location.href) ? window.location.href : null,
  );

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      }),
    [],
  );

  const value = useMemo<AuthValue>(() => {
    // リンクの oobCode などを URL から取り除き、リロードやブックマークで使い済みのリンクを踏まないようにする
    function finishEmailLink() {
      writeEmail(null);
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.hash);
      setEmailLink(null);
    }
    return {
      user,
      loading,
      signIn: async () => {
        await signInWithPopup(auth, new GoogleAuthProvider());
      },
      signOut: () => fbSignOut(auth),
      sendEmailLink: async (email) => {
        await sendSignInLinkToEmail(auth, email, { url: window.location.href, handleCodeInApp: true });
        writeEmail(email);
      },
      emailLink,
      completeEmailLink: async (email) => {
        if (!emailLink) return;
        try {
          await signInWithEmailLink(auth, email, emailLink);
        } catch (e) {
          if (DEAD_LINK.has(errorCode(e))) finishEmailLink();
          throw e;
        }
        finishEmailLink();
      },
    };
  }, [user, loading, emailLink]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

// ポップアップを閉じた・別のポップアップで置き換えたときは、利用者の操作なのでエラーを出さない
const CANCELLED = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request"]);

function EmailForm({ submitLabel, onSubmit }: { submitLabel: string; onSubmit(email: string): Promise<void> }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(email.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="email-login" onSubmit={(e) => void submit(e)}>
      <label>
        メールアドレス
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button type="submit" disabled={busy}>
        {submitLabel}
      </button>
    </form>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, signIn, sendEmailLink, emailLink, completeEmailLink } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // 同じブラウザでリンクを開いたときは、覚えておいたアドレスでそのままログインする
  const [completing, setCompleting] = useState(() => emailLink !== null && readEmail() !== null);
  const started = useRef(false);

  async function onSignIn() {
    setError(null);
    try {
      await signIn();
    } catch (e) {
      if (!CANCELLED.has(errorCode(e))) setError("ログインできませんでした。時間をおいて再度お試しください");
    }
  }

  async function onSendLink(email: string) {
    setError(null);
    setSentTo(null);
    try {
      await sendEmailLink(email);
      setSentTo(email);
    } catch (e) {
      setError(
        errorCode(e) === "auth/invalid-email"
          ? "メールアドレスの形式が正しくありません"
          : "リンクを送れませんでした。時間をおいて再度お試しください",
      );
    }
  }

  async function onCompleteLink(email: string) {
    setError(null);
    setCompleting(true);
    try {
      await completeEmailLink(email);
    } catch (e) {
      const code = errorCode(e);
      setError(
        code === "auth/invalid-email"
          ? "リンクを送ったメールアドレスと一致しません"
          : DEAD_LINK.has(code)
            ? "リンクの有効期限が切れているか、すでに使われています。もう一度リンクを送ってください"
            : "ログインできませんでした。時間をおいて再度お試しください",
      );
    } finally {
      setCompleting(false);
    }
  }

  useEffect(() => {
    const email = readEmail();
    if (started.current || !emailLink || !email) return;
    started.current = true;
    void onCompleteLink(email);
    // リンクを開いた直後に一度だけ試す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alert = error && (
    <p role="alert" className="error">
      {error}
    </p>
  );

  if (completing) return <p className="center">ログインしています…</p>;
  if (loading) return <p className="center">読み込み中…</p>;
  if (user) return <>{children}</>;
  if (emailLink) {
    return (
      <main className="center">
        <h1>dnd-kanata</h1>
        <p>確認のため、ログイン用のリンクを送ったメールアドレスを入力してください</p>
        <EmailForm submitLabel="ログイン" onSubmit={onCompleteLink} />
        {alert}
      </main>
    );
  }
  return (
    <main className="center">
      <h1>dnd-kanata</h1>
      <p>D&amp;D 5e キャラクターシートの閲覧・編集</p>
      <button onClick={() => void onSignIn()}>Google でログイン</button>
      <p className="or">または、メールで届くリンクからログイン</p>
      <EmailForm submitLabel="ログイン用のリンクを送る" onSubmit={onSendLink} />
      {sentTo && (
        <p>
          {sentTo} にログイン用のリンクを送りました。メールのリンクを開いてください。届かないときは迷惑メールのフォルダも確認してください
        </p>
      )}
      {alert}
    </main>
  );
}
