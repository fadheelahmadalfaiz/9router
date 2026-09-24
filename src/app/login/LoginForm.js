"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, Button, Input } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

// Returns a safe internal redirect target from ?redirect= or the default.
// Rejects protocol-relative URLs (//evil.com), absolute URLs (https://evil.com),
// and anything outside /dashboard to prevent open-redirect abuse.
const DEFAULT_LOGIN_REDIRECT = "/dashboard";
function safeRedirectTarget(raw) {
  if (typeof raw !== "string" || !raw) return DEFAULT_LOGIN_REDIRECT;
  if (!raw.startsWith("/")) return DEFAULT_LOGIN_REDIRECT;
  if (raw.startsWith("//")) return DEFAULT_LOGIN_REDIRECT;
  if (raw.includes("://")) return DEFAULT_LOGIN_REDIRECT;
  if (!raw.startsWith("/dashboard")) return DEFAULT_LOGIN_REDIRECT;
  return raw;
}

const RESET_CLI_COMMAND = "9router settings reset-password";

const STRENGTH_LABELS = ["", "Weak", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_BAR_CLASSES = [
  "bg-border",
  "bg-red-500",
  "bg-red-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-emerald-500",
];

function getPasswordStrength(value) {
  const v = String(value || "");
  if (!v) return { score: 0, label: "" };
  let score = 0;
  if (v.length >= 8) score++;
  if (v.length >= 12) score++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
  if (/\d/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  if (score > 4) score = 4;
  return { score, label: STRENGTH_LABELS[score] };
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const postLoginRedirect = safeRedirectTarget(searchParams.get("redirect"));

  const { copied, copy } = useCopyToClipboard();

  const [password, setPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [error, setError] = useState("");
  const [resetHint, setResetHint] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState(null);
  const [authMode, setAuthMode] = useState("password");
  const [ssoType, setSsoType] = useState("oidc");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [oidcLoginLabel, setOidcLoginLabel] = useState("Sign in with OIDC");
  const [samlConfigured, setSamlConfigured] = useState(false);
  const [samlLoginLabel, setSamlLoginLabel] = useState("Sign in with SAML SSO");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Countdown for rate-limit
  useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setInterval(() => setRetryAfter((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [retryAfter]);

  useEffect(() => {
    async function checkAuth() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

      try {
        const res = await fetch(`${baseUrl}/api/auth/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.authenticated === true || data.requireLogin === false) {
            window.location.assign(postLoginRedirect);
            return;
          }
          setHasPassword(!!data.hasPassword);
          setAuthMode(data.authMode || "password");
          setSsoType(data.ssoType || "oidc");
          setOidcConfigured(data.oidcConfigured === true);
          setOidcLoginLabel(data.oidcLoginLabel || "Sign in with OIDC");
          setSamlConfigured(data.samlConfigured === true);
          setSamlLoginLabel(data.samlLoginLabel || "Sign in with SAML SSO");
        } else {
          setHasPassword(true);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        setHasPassword(true);
      }
    }
    checkAuth();
  }, [postLoginRedirect]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResetHint("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.mustChangePassword) {
          setMustChange(true);
          return;
        }
        window.location.assign(postLoginRedirect);
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
        if (data.resetHint) setResetHint(data.resetHint);
        if (data.retryAfter) setRetryAfter(Number(data.retryAfter));
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmNewPassword) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      if (res.ok) {
        window.location.assign(postLoginRedirect);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to set password");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = () => {
    window.location.href = "/api/auth/oidc/start";
  };

  const handleSamlLogin = () => {
    window.location.href = "/api/auth/saml/start";
  };

  const isSsoEnabled = ["sso", "oidc", "saml", "both"].includes(authMode);
  const activeSsoType = ssoType || (authMode === "saml" ? "saml" : "oidc");

  const samlAvailable = isSsoEnabled && activeSsoType === "saml" && samlConfigured;
  const oidcAvailable = isSsoEnabled && activeSsoType === "oidc" && oidcConfigured;
  const ssoAvailable = samlAvailable || oidcAvailable;

  const passwordAvailable = authMode === "password" || authMode === "both" || !ssoAvailable;

  const newPasswordMismatch =
    confirmNewPassword.length > 0 && newPassword !== confirmNewPassword;
  const newPasswordStrength = getPasswordStrength(newPassword);

  // Show skeleton matching final layout while checking session/password config.
  if (hasPassword === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-4 relative overflow-hidden">
        <div
          className="landing-grid absolute inset-0 pointer-events-none"
          aria-hidden="true"
        />
        <div className="relative z-10 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="h-8 w-32 mx-auto rounded bg-sidebar/60 animate-pulse" />
            <div className="h-3 w-72 mx-auto mt-3 rounded bg-sidebar/40 animate-pulse" />
          </div>
          <Card>
            <div className="flex flex-col gap-4" aria-hidden="true">
              <div className="flex flex-col gap-2">
                <div className="h-3 w-16 rounded bg-sidebar/40 animate-pulse" />
                <div className="h-9 w-full rounded-lg bg-sidebar/40 animate-pulse" />
              </div>
              <div className="h-9 w-full rounded-lg bg-sidebar/40 animate-pulse" />
              <div className="h-3 w-48 mx-auto rounded bg-sidebar/40 animate-pulse" />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4 relative overflow-hidden">
      {/* Faint grid background */}
      <div className="landing-grid absolute inset-0 pointer-events-none" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">9Router</h1>
          <p className="text-text-muted">
            {samlAvailable
              ? "Sign in with SAML 2.0 Single Sign-On"
              : oidcAvailable
              ? "Sign in with your OIDC provider to access the dashboard"
              : "Enter your password to access the dashboard"}
          </p>
        </div>

        <Card>
          {mustChange ? (
            <form onSubmit={handleSetNewPassword} className="flex flex-col gap-4">
              <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
                Set a new password before accessing the dashboard remotely.
              </p>

              <div className="flex flex-col gap-2">
                <label htmlFor="current-password" className="text-sm font-medium">
                  Current password
                </label>
                <Input
                  id="current-password"
                  type={showLoginPassword ? "text" : "password"}
                  placeholder="Enter current password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="new-password" className="text-sm font-medium">
                  New password
                </label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((s) => !s)}
                    aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                    aria-pressed={showNewPassword}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded text-text-muted hover:text-text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showNewPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
                {newPassword && (
                  <div className="flex items-center gap-2" aria-live="polite">
                    <div className="flex gap-0.5 flex-1">
                      {[1, 2, 3, 4].map((bar) => (
                        <div
                          key={bar}
                          className={`h-1 flex-1 rounded ${
                            bar <= newPasswordStrength.score
                              ? STRENGTH_BAR_CLASSES[newPasswordStrength.score]
                              : "bg-border"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-text-muted w-12 text-right">
                      {newPasswordStrength.label}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="confirm-new-password" className="text-sm font-medium">
                  Confirm new password
                </label>
                <Input
                  id="confirm-new-password"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Re-enter new password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  aria-invalid={newPasswordMismatch || undefined}
                  aria-describedby={newPasswordMismatch ? "confirm-password-error" : undefined}
                />
                {newPasswordMismatch && (
                  <p id="confirm-password-error" className="text-xs text-red-500">
                    Passwords do not match.
                  </p>
                )}
              </div>

              {error && <p className="text-xs text-red-500" role="alert">{error}</p>}

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                loading={loading}
                disabled={!newPassword || newPasswordMismatch}
              >
                Set password
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              {samlAvailable && (
                <Button type="button" variant="primary" className="w-full" onClick={handleSamlLogin}>
                  {samlLoginLabel}
                </Button>
              )}

              {oidcAvailable && (
                <Button type="button" variant="primary" className="w-full" onClick={handleOidcLogin}>
                  {oidcLoginLabel}
                </Button>
              )}

              {ssoAvailable && passwordAvailable && <div className="h-px bg-border/60" />}

              {passwordAvailable ? (
                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                  {isSsoEnabled && !ssoAvailable && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                      {activeSsoType === "saml" ? "SAML SSO" : "OIDC"} login is enabled, but configuration is incomplete. Password login is still available for recovery.
                    </p>
                  )}

                  {authMode === "both" && ssoAvailable && (
                    <p className="text-xs text-text-muted text-center">
                      Password and {activeSsoType === "saml" ? "SAML SSO" : "OIDC"} login are both enabled.
                    </p>
                  )}

                  <div className="flex flex-col gap-2">
                    <label htmlFor="password" className="text-sm font-medium">
                      Password
                    </label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showLoginPassword ? "text" : "password"}
                        placeholder="Enter password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        autoFocus={!oidcAvailable}
                        aria-invalid={error ? "true" : undefined}
                        aria-describedby={error ? "login-error" : undefined}
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword((s) => !s)}
                        aria-label={showLoginPassword ? "Hide password" : "Show password"}
                        aria-pressed={showLoginPassword}
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded text-text-muted hover:text-text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {showLoginPassword ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </div>
                    {error && (
                      <p id="login-error" className="text-xs text-red-500" role="alert">
                        {error}
                      </p>
                    )}
                    {retryAfter > 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400" role="status" aria-live="polite">
                        Locked. Retry in <span className="font-mono">{retryAfter}s</span>.
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    loading={loading}
                    disabled={retryAfter > 0}
                  >
                    {retryAfter > 0 ? `Wait ${retryAfter}s` : "Login"}
                  </Button>

                  <div className="mt-1 flex flex-col gap-1.5 rounded-md border border-border/60 bg-sidebar/40 px-3 py-2 text-[11px] text-text-muted">
                    <div className="flex items-center justify-between gap-2">
                      <span>Trouble signing in?</span>
                      <button
                        type="button"
                        onClick={() => copy(RESET_CLI_COMMAND, "login-cli-cmd")}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-text-muted hover:bg-sidebar hover:text-text-primary transition-colors"
                        aria-label="Copy reset command"
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {copied === "login-cli-cmd" ? "check" : "content_copy"}
                        </span>
                        <span>Copy reset command</span>
                      </button>
                    </div>
                    <code className="block break-all bg-background/50 px-1.5 py-1 rounded font-mono text-[10px]">
                      {RESET_CLI_COMMAND}
                    </code>
                    <span className="opacity-80">
                      Run on the host. Requires CLI access to the 9router process.
                    </span>
                  </div>

                  {hasPassword === false && (
                    <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                      Security risk: no password set. You will be asked to set one when logging in remotely.
                    </p>
                  )}
                </form>
              ) : (
                error && <p className="text-xs text-red-500" role="alert">{error}</p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
