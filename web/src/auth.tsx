import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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
  // メールリンクでのログイン。sendEmailLink で送ったリンクを開くと emailLinkPending が true になる
  sendEmailLink(email: string): Promise<void>;
  emailLinkPending: boolean;
  // 同じブラウザでリンクを開き、覚えておいたアドレスでログインしている最中
  completingEmailLink: boolean;
  emailLinkError: string | null;
  // 別の端末でリンクを開いたときに、入れてもらったアドレスでログインする
  confirmEmailLink(email: string): Promise<void>;
  // 開いたリンクとそのエラーを捨てる
  resetEmailLink(): void;
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

const SIGN_IN_FAILED = "ログインできませんでした。時間をおいて再度お試しください";

function emailLinkErrorMessage(code: string): string {
  if (code === "auth/invalid-email") return "リンクを送ったメールアドレスと一致しません";
  if (DEAD_LINK.has(code)) return "リンクの有効期限が切れているか、すでに使われています。もう一度リンクを送ってください";
  return SIGN_IN_FAILED;
}

const linkInUrl = () => (isSignInWithEmailLink(auth, window.location.href) ? window.location.href : null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailLink, setEmailLink] = useState(linkInUrl);
  const [completing, setCompleting] = useState(() => linkInUrl() !== null && readEmail() !== null);
  const [emailLinkError, setEmailLinkError] = useState<string | null>(null);
  // StrictMode で effect が2回走っても、リンクは1回しか使えないので1回だけ試す
  const attempted = useRef(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      }),
    [],
  );

  // リンクの oobCode などを URL から取り除き、リロードやブックマークで使い済みのリンクを踏まないようにする
  function finishEmailLink() {
    writeEmail(null);
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.hash);
    setEmailLink(null);
  }

  async function completeEmailLink(link: string, email: string) {
    setEmailLinkError(null);
    try {
      await signInWithEmailLink(auth, email, link);
      finishEmailLink();
    } catch (e) {
      const code = errorCode(e);
      if (DEAD_LINK.has(code)) finishEmailLink();
      setEmailLinkError(emailLinkErrorMessage(code));
    }
  }

  useEffect(() => {
    if (loading || !emailLink || attempted.current) return;
    attempted.current = true;
    // すでにログインしているときは、黙って別のアカウントに切り替えないようリンクを使わない
    if (user) {
      finishEmailLink();
      setCompleting(false);
      return;
    }
    const email = readEmail();
    if (email) void completeEmailLink(emailLink, email).finally(() => setCompleting(false));
  });

  const value: AuthValue = {
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
    emailLinkPending: emailLink !== null,
    completingEmailLink: completing,
    emailLinkError,
    confirmEmailLink: async (email) => {
      if (emailLink) await completeEmailLink(emailLink, email);
    },
    resetEmailLink: () => {
      setEmailLinkError(null);
      if (emailLink) finishEmailLink();
    },
  };
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
  const {
    user,
    loading,
    signIn,
    sendEmailLink,
    emailLinkPending,
    completingEmailLink,
    emailLinkError,
    confirmEmailLink,
    resetEmailLink,
  } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSignIn() {
    resetEmailLink();
    setError(null);
    try {
      await signIn();
    } catch (e) {
      if (!CANCELLED.has(errorCode(e))) setError(SIGN_IN_FAILED);
    }
  }

  async function onSendLink(email: string) {
    resetEmailLink();
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

  const message = error ?? emailLinkError;
  const alert = message && (
    <p role="alert" className="error">
      {message}
    </p>
  );

  if (completingEmailLink) return <p className="center">ログインしています…</p>;
  if (loading) return <p className="center">読み込み中…</p>;
  if (user) return <>{children}</>;
  if (emailLinkPending) {
    return (
      <main className="center">
        <h1>dnd-kanata</h1>
        <p>確認のため、ログイン用のリンクを送ったメールアドレスを入力してください</p>
        <EmailForm submitLabel="ログイン" onSubmit={confirmEmailLink} />
        {alert}
        <button className="back" onClick={resetEmailLink}>
          ログイン画面に戻る
        </button>
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
