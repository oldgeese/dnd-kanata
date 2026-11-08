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

// ログイン画面の下部。バージョンと、リポジトリ・X へのリンク。
// main の中の footer は contentinfo の landmark にならないので、main の外に置く
function LoginFooter() {
  return (
    <footer className="login-footer">
      <span className="version">{__APP_VERSION__}</span>
      <a href="https://github.com/oldgeese/dnd-kanata" target="_blank" rel="noopener noreferrer" aria-label="GitHub リポジトリ">
        <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </a>
      <a href="https://x.com/oldgeese" target="_blank" rel="noopener noreferrer" aria-label="X">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
    </footer>
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
      <>
        <main className="center">
          <h1>dnd-kanata</h1>
          <p>確認のため、ログイン用のリンクを送ったメールアドレスを入力してください</p>
          <EmailForm submitLabel="ログイン" onSubmit={confirmEmailLink} />
          {alert}
          <button className="back" onClick={resetEmailLink}>
            ログイン画面に戻る
          </button>
        </main>
        <LoginFooter />
      </>
    );
  }
  return (
    <>
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
      <LoginFooter />
    </>
  );
}
