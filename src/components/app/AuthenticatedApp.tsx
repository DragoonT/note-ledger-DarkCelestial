"use client";
import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { api, type User } from "@/app/api/client";
import { Btn, Field, Input } from "@/components/ui";
import { LedgerApp } from "@/components/ledger/LedgerApp";
import { TopbarPreferences } from "@/components/app/TopbarPreferences";
import { useI18n } from "@/lib/i18n";
export type AppPage =
  | "dashboard"
  | "transactions"
  | "settings-profile"
  | "settings-appearance"
  | "settings-password"
  | "settings-delete-data"
  | "settings-create-account"
  | "settings-all-accounts"
  | "settings-transaction-options"
  | "settings-bank-fields";
export function AuthenticatedApp({
  page,
  accountId,
}: {
  page: AppPage;
  accountId?: string;
}) {
  const { tr } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionTimedOut, setSessionTimedOut] = useState(false);
  useEffect(() => {
    if (!api.hasTabSession()) {
      setChecking(false);
      return;
    }
    const timer = window.setTimeout(
      () =>
        void api
          .me()
          .then(setUser)
          .catch(() => null)
          .finally(() => setChecking(false)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!user || sessionTimedOut) return;
    let idleTimer = 0;
    let heartbeatTimer = 0;
    const expire = () => {
      setSessionTimedOut(true);
      // End the server session so refreshing cannot bypass the idle timeout.
      void api.logout().catch(() => null);
      setUser(null);
    };
    const resetIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(expire, 10 * 60 * 1000);
    };
    const activityEvents: (keyof WindowEventMap)[] = [
      "pointerdown",
      "pointermove",
      "keydown",
      "scroll",
      "touchstart",
    ];
    activityEvents.forEach((event) =>
      window.addEventListener(event, resetIdle, { passive: true }),
    );
    heartbeatTimer = window.setInterval(
      () => void api.me().catch(() => setSessionTimedOut(true)),
      5 * 60 * 1000,
    );
    resetIdle();
    return () => {
      window.clearTimeout(idleTimer);
      window.clearInterval(heartbeatTimer);
      activityEvents.forEach((event) =>
        window.removeEventListener(event, resetIdle),
      );
    };
  }, [sessionTimedOut, user]);
  useEffect(() => {
    const theme = localStorage.getItem("pl-theme") || "system";
    const dark =
      theme === "dark" ||
      (theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    const accent = localStorage.getItem("pl-accent");
    if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
      document.documentElement.style.setProperty("--brand", accent);
      document.documentElement.style.setProperty(
        "--brand-hover",
        `color-mix(in oklab, ${accent} 82%, white)`,
      );
      document.documentElement.style.setProperty(
        "--brand-soft",
        `color-mix(in oklab, ${accent} 16%, transparent)`,
      );
    }
  }, []);
  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      setUser(await api.login(username, password));
      setPassword("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (/failed to fetch|networkerror|load failed/i.test(message)) {
        setError(
          tr("Cannot connect to the server. Please try again in a moment."),
        );
      } else if (message === "Invalid username or password") {
        setError(tr("Invalid username or password"));
      } else {
        setError(tr("The server could not sign you in. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  }
  async function logout() {
    await api.logout().catch(() => null);
    setSessionTimedOut(false);
    setUser(null);
  }
  if (checking)
    return (
      <div className="auth-screen">
        <LoaderCircle className="spin" />
      </div>
    );
  if (user)
    return (
      <div className={sessionTimedOut ? "session-expired-content" : ""}>
        <LedgerApp
          page={page}
          accountId={accountId}
          user={user}
          onUserChange={setUser}
          onLogout={() => void logout()}
        />
      </div>
    );
  return (
    <>
    {sessionTimedOut ? (
      <div className="modal-backdrop session-timeout-backdrop">
        <section className="confirm-dialog session-timeout-dialog" role="alertdialog" aria-modal="true">
          <div className="confirm-icon"><LockKeyhole /></div>
          <div className="confirm-copy">
            <h3>{tr("Session expired")}</h3>
            <p>{tr("You were inactive for more than 10 minutes. Sign in again to continue.")}</p>
          </div>
          <div className="confirm-actions">
            <Btn onClick={() => { setSessionTimedOut(false); window.location.reload(); }}>{tr("OK")}</Btn>
          </div>
        </section>
      </div>
    ) : null}
    <main className="auth-screen">
      <div className="login-preferences">
        <TopbarPreferences />
      </div>
      <section className="login-card">
        <div className="login-welcome-row">
          <Image
            src="/web.png"
            width={40}
            height={40}
            alt="DarkCelestial logo"
            className="login-lock-logo"
          />
          <h2>
            {tr("Welcome back")} {tr("to")} <span className="typing-name">DarkCelestial</span>
          </h2>
        </div>
        <form onSubmit={login}>
          <Field label={tr("Username")} required>
            <Input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setError("");
              }}
            />
          </Field>
          <Field label={tr("Password")} required>
            <div className="login-password-wrap">
              <Input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={tr(showPassword ? "Hide password" : "Show password")}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </Field>
          {error ? <p className="login-error">{error}</p> : null}
          <Btn loading={loading} className="login-submit">
            {tr("Sign in")}
          </Btn>
        </form>
      </section>
    </main>
    </>
  );
}
