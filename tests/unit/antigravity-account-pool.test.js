import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANTIGRAVITY_POOL_SETTINGS,
  getAntigravityAccountUnavailabilityReasons,
  getEligibleAntigravityAccounts,
  recordAntigravityAccountSuccess,
  recordAntigravityAuthFailure,
  recordAntigravityQuotaFailure,
  selectEligibleAntigravityAccount,
} from "@/lib/accountPool/antigravityPool.js";

const NOW = "2026-07-05T10:00:00.000Z";
const EARLIER = "2026-07-05T09:59:00.000Z";
const LATER = "2026-07-05T10:05:00.000Z";
const DEFAULT_COOLDOWN_UNTIL = "2026-07-05T10:02:00.000Z";
const MODEL = "claude-sonnet-4-6";
const OTHER_MODEL = "gemini-3.5-flash-low";

function account(id, overrides = {}) {
  return {
    id,
    provider: "antigravity",
    authType: "oauth",
    isActive: true,
    accessToken: `${id}-token`,
    expiresAt: LATER,
    ...overrides,
  };
}

function reasonCodes(connection, options = {}) {
  return getAntigravityAccountUnavailabilityReasons(connection, {
    model: MODEL,
    now: NOW,
    ...options,
  }).map((reason) => reason.code);
}

describe("Antigravity account pool", () => {
  it("selects first active non-cooled account", () => {
    expect(DEFAULT_ANTIGRAVITY_POOL_SETTINGS).toMatchObject({
      antigravityAccountPoolStrategy: "round-robin",
      antigravityCooldownStrikeThreshold: 3,
      antigravityDefaultCooldownMs: 120_000,
      antigravity503RetryCount: 3,
    });

    const connections = [
      account("inactive", { isActive: false }),
      account("first"),
      account("second"),
    ];

    expect(getEligibleAntigravityAccounts(connections, { model: MODEL, now: NOW }).map((conn) => conn.id)).toEqual([
      "first",
      "second",
    ]);
    expect(selectEligibleAntigravityAccount(connections, { model: MODEL, now: NOW })?.id).toBe("first");
  });

  it("skips inactive, non-antigravity, non-oauth, missing token, and expired-without-refresh accounts", () => {
    const connections = [
      account("inactive", { isActive: false }),
      account("wrong-provider", { provider: "claude" }),
      account("wrong-auth", { authType: "apikey" }),
      account("missing-token", { accessToken: "" }),
      account("expired-without-refresh", { expiresAt: EARLIER }),
      account("expired-with-refresh", { expiresAt: EARLIER, refreshToken: "refresh-token" }),
    ];

    expect(getEligibleAntigravityAccounts(connections, { model: MODEL, now: NOW }).map((conn) => conn.id)).toEqual([
      "expired-with-refresh",
    ]);
    expect(reasonCodes(connections[0])).toContain("inactive");
    expect(reasonCodes(connections[1])).toContain("not_antigravity");
    expect(reasonCodes(connections[2])).toContain("not_oauth");
    expect(reasonCodes(connections[3])).toContain("missing_access_token");
    expect(reasonCodes(connections[4])).toContain("expired_token_without_refresh_token");
  });

  it("skips account-level quota cooldown", () => {
    const connections = [
      account("cooled", { rateLimitedUntil: LATER }),
      account("ready"),
    ];

    expect(reasonCodes(connections[0])).toContain("rate_limited");
    expect(selectEligibleAntigravityAccount(connections, { model: MODEL, now: NOW })?.id).toBe("ready");
  });

  it("skips auth cooldown", () => {
    const connections = [
      account("auth-cooled", { authCooldownUntil: LATER }),
      account("ready"),
    ];

    expect(reasonCodes(connections[0])).toContain("auth_cooldown");
    expect(selectEligibleAntigravityAccount(connections, { model: MODEL, now: NOW })?.id).toBe("ready");
  });

  it("skips model-specific cooldown only for the requested model", () => {
    const connections = [
      account("model-cooled", { modelCooldowns: { [MODEL]: LATER } }),
      account("fallback"),
    ];

    expect(reasonCodes(connections[0], { model: MODEL })).toContain("model_cooldown");
    expect(selectEligibleAntigravityAccount(connections, { model: MODEL, now: NOW })?.id).toBe("fallback");
    expect(selectEligibleAntigravityAccount(connections, { model: OTHER_MODEL, now: NOW })?.id).toBe("model-cooled");
  });

  it("round-robin starts after previous connection id", () => {
    const connections = [account("a"), account("b"), account("c")];

    expect(selectEligibleAntigravityAccount(connections, { model: MODEL, now: NOW, previousConnectionId: "b" })?.id).toBe(
      "c"
    );
    expect(selectEligibleAntigravityAccount(connections, { model: MODEL, now: NOW, previousConnectionId: "c" })?.id).toBe(
      "a"
    );
  });

  it.each([429, 503])("first %i records strike without cooldown", (statusCode) => {
    const original = account("quota");

    const updated = recordAntigravityQuotaFailure(original, { model: MODEL, now: NOW, statusCode });

    expect(updated).not.toBe(original);
    expect(original.consecutiveStrikes).toBeUndefined();
    expect(updated.consecutiveStrikes).toBe(1);
    expect(updated.modelStrikes).toEqual({ [MODEL]: 1 });
    expect(updated.rateLimitedUntil).toBeUndefined();
    expect(updated.modelCooldowns).toBeUndefined();
    expect(updated.lastPoolError).toContain(String(statusCode));
    expect(updated.lastPoolErrorAt).toBe(NOW);
  });

  it("threshold quota failure applies cooldown", () => {
    const original = account("quota", {
      consecutiveStrikes: 2,
      modelStrikes: { [MODEL]: 2 },
    });

    const updated = recordAntigravityQuotaFailure(original, { model: MODEL, now: NOW, statusCode: 503 });

    expect(updated.consecutiveStrikes).toBe(3);
    expect(updated.modelStrikes).toEqual({ [MODEL]: 3 });
    expect(updated.rateLimitedUntil).toBe(DEFAULT_COOLDOWN_UNTIL);
    expect(updated.modelCooldowns).toEqual({ [MODEL]: DEFAULT_COOLDOWN_UNTIL });
  });

  it.each([401, 403])("%i auth failure applies auth cooldown", (statusCode) => {
    const original = account("auth", { consecutiveStrikes: 2 });

    const updated = recordAntigravityAuthFailure(original, { now: NOW, statusCode });

    expect(updated).not.toBe(original);
    expect(original.consecutiveStrikes).toBe(2);
    expect(updated.authCooldownUntil).toBe(DEFAULT_COOLDOWN_UNTIL);
    expect(updated.consecutiveStrikes).toBe(0);
    expect(updated.lastPoolError).toContain(String(statusCode));
    expect(updated.lastPoolErrorAt).toBe(NOW);
  });

  it("success clears strikes/errors and updates lastUsedAt", () => {
    const original = account("success", {
      consecutiveStrikes: 2,
      modelStrikes: { [MODEL]: 2, [OTHER_MODEL]: 1 },
      lastPoolError: "503 quota failure",
      lastPoolErrorAt: EARLIER,
    });

    const updated = recordAntigravityAccountSuccess(original, { model: MODEL, now: NOW });

    expect(updated).not.toBe(original);
    expect(original.consecutiveStrikes).toBe(2);
    expect(original.modelStrikes).toEqual({ [MODEL]: 2, [OTHER_MODEL]: 1 });
    expect(updated.consecutiveStrikes).toBe(0);
    expect(updated.modelStrikes).toEqual({ [OTHER_MODEL]: 1 });
    expect(updated.lastPoolError).toBeUndefined();
    expect(updated.lastPoolErrorAt).toBeUndefined();
    expect(updated.lastUsedAt).toBe(NOW);
  });
});
