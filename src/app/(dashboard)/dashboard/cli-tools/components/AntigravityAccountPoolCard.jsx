"use client";

import { useEffect, useState } from "react";

const DEFAULT_POOL_SETTINGS = {
  antigravityAccountPoolEnabled: false,
  antigravityAccountPoolStrategy: "round-robin",
  antigravityCooldownStrikeThreshold: 3,
  antigravityDefaultCooldownMs: 120_000,
  antigravity503RetryCount: 3,
};

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function isFuture(value, now = new Date()) {
  if (!value) return false;
  const time = new Date(value).getTime();
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Number.isFinite(time) && Number.isFinite(nowTime) && time > nowTime;
}

export function normalizePoolSettings(settings = {}) {
  return {
    antigravityAccountPoolEnabled: settings.antigravityAccountPoolEnabled === true,
    antigravityAccountPoolStrategy: settings.antigravityAccountPoolStrategy || DEFAULT_POOL_SETTINGS.antigravityAccountPoolStrategy,
    antigravityCooldownStrikeThreshold: clampInteger(settings.antigravityCooldownStrikeThreshold, 1, 10, DEFAULT_POOL_SETTINGS.antigravityCooldownStrikeThreshold),
    antigravityDefaultCooldownMs: clampInteger(settings.antigravityDefaultCooldownMs, 30_000, 86_400_000, DEFAULT_POOL_SETTINGS.antigravityDefaultCooldownMs),
    antigravity503RetryCount: clampInteger(settings.antigravity503RetryCount, 0, 5, DEFAULT_POOL_SETTINGS.antigravity503RetryCount),
  };
}

export function maskAccountIdentifier(connection = {}) {
  const raw = connection.displayName || connection.name || connection.email || connection.id;
  if (!raw) return "Unknown account";
  const value = String(raw);
  if (value.includes("@")) {
    const [local, domain] = value.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  }
  if (value.length <= 4) return `${value.slice(0, 1)}***`;
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function getAccountPoolHealth(connection = {}, now = new Date()) {
  if (connection.isActive === false) return { label: "Inactive", tone: "muted" };
  if (connection.authType && connection.authType !== "oauth") return { label: "Unavailable", tone: "muted" };
  if (!connection.accessToken && !connection.hasAccessToken) return { label: "Unavailable", tone: "muted" };
  if (isFuture(connection.authCooldownUntil, now)) return { label: "Auth cooldown", tone: "warning", until: connection.authCooldownUntil };
  if (isFuture(connection.rateLimitedUntil, now)) return { label: "Cooldown", tone: "warning", until: connection.rateLimitedUntil };
  const modelCooldownUntil = Object.values(connection.modelCooldowns || {}).find((value) => isFuture(value, now));
  if (modelCooldownUntil) return { label: "Model cooldown", tone: "warning", until: modelCooldownUntil };
  return { label: "Healthy", tone: "success" };
}

function secondsFromMs(ms) {
  return Math.round(Number(ms || DEFAULT_POOL_SETTINGS.antigravityDefaultCooldownMs) / 1000);
}

function msFromSeconds(seconds) {
  return clampInteger(seconds, 30, 86_400, 120) * 1000;
}

function HealthBadge({ health }) {
  const classes = {
    success: "border-green-500/30 bg-green-500/10 text-green-600",
    warning: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    muted: "border-border bg-surface text-text-muted",
  };

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${classes[health.tone] || classes.muted}`}>
      {health.label}
    </span>
  );
}

export default function AntigravityAccountPoolCard() {
  const [settings, setSettings] = useState(DEFAULT_POOL_SETTINGS);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [settingsRes, providersRes] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/providers"),
        ]);
        const settingsData = settingsRes.ok ? await settingsRes.json() : {};
        const providersData = providersRes.ok ? await providersRes.json() : {};
        if (cancelled) return;
        setSettings(normalizePoolSettings(settingsData));
        setAccounts((providersData.connections || []).filter((connection) => connection.provider === "antigravity" && connection.authType === "oauth"));
      } catch (error) {
        if (!cancelled) setMessage({ type: "error", text: error.message || "Failed to load Account Pool" });
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const updateSetting = (key, value) => {
    setSettings((prev) => normalizePoolSettings({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const normalized = normalizePoolSettings(settings);
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save Account Pool settings");
      }
      setSettings(normalized);
      setMessage({ type: "success", text: "Account Pool settings saved" });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-surface/40 p-3" aria-label="Antigravity Account Pool">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-text-main">Account Pool</h4>
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted">
                {settings.antigravityAccountPoolEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <p className="mt-1 text-xs text-text-muted">Opt-in Failover with Cooldown, Health, and Retry Attempts controls.</p>
          </div>
          <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-text-main focus-within:ring-2 focus-within:ring-primary/40">
            <input
              type="checkbox"
              checked={settings.antigravityAccountPoolEnabled}
              onChange={(event) => updateSetting("antigravityAccountPoolEnabled", event.target.checked)}
              className="size-4 accent-primary"
            />
            Enable Account Pool
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Cooldown strikes
            <input
              type="number"
              min="1"
              max="10"
              value={settings.antigravityCooldownStrikeThreshold}
              onChange={(event) => updateSetting("antigravityCooldownStrikeThreshold", event.target.value)}
              className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Cooldown seconds
            <input
              type="number"
              min="30"
              max="86400"
              value={secondsFromMs(settings.antigravityDefaultCooldownMs)}
              onChange={(event) => updateSetting("antigravityDefaultCooldownMs", msFromSeconds(event.target.value))}
              className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Retry Attempts
            <input
              type="number"
              min="0"
              max="5"
              value={settings.antigravity503RetryCount}
              onChange={(event) => updateSetting("antigravity503RetryCount", event.target.value)}
              className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        </div>

        <div className="rounded-lg border border-border bg-background/40">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold text-text-main">Health</span>
            <span className="text-[11px] text-text-muted">{accounts.length} account{accounts.length === 1 ? "" : "s"}</span>
          </div>
          <div className="divide-y divide-border">
            {accounts.length === 0 ? (
              <p className="px-3 py-3 text-xs text-text-muted">No Antigravity OAuth accounts connected.</p>
            ) : accounts.map((account) => {
              const health = getAccountPoolHealth(account);
              return (
                <div key={account.id} className="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate text-xs text-text-main">{maskAccountIdentifier(account)}</span>
                  <HealthBadge health={health} />
                </div>
              );
            })}
          </div>
        </div>

        {message && (
          <div className={`rounded-lg px-3 py-2 text-xs ${message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
            {message.text}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveSettings}
            disabled={loading}
            className="min-h-10 rounded-lg border border-primary/30 bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Saving..." : "Save Account Pool"}
          </button>
        </div>
      </div>
    </section>
  );
}
