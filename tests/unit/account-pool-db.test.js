import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let sqliteDb;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-account-pool-db-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  sqliteDb = await import("@/lib/db/index.js");
  await sqliteDb.initDb();
});

afterAll(() => {
  sqliteDb?.closeDb?.();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("Antigravity account pool SQLite metadata", () => {
  it("returns disabled account-pool defaults from settings", async () => {
    // Given: a fresh SQLite database

    // When: settings are loaded
    const settings = await sqliteDb.getSettings();

    // Then: account pool is explicitly opt-in with conservative defaults
    expect(settings.antigravityAccountPoolEnabled).toBe(false);
    expect(settings.antigravityAccountPoolStrategy).toBe("round-robin");
    expect(settings.antigravityCooldownStrikeThreshold).toBe(3);
    expect(settings.antigravityDefaultCooldownMs).toBe(2 * 60 * 1000);
    expect(settings.antigravity503RetryCount).toBe(3);
  });

  it("persists account-pool settings without dropping unrelated settings", async () => {
    // Given: an existing unrelated setting
    await sqliteDb.updateSettings({ requireLogin: true, customField: "keep-me" });

    // When: account-pool settings are updated
    const updated = await sqliteDb.updateSettings({
      antigravityAccountPoolEnabled: true,
      antigravityAccountPoolStrategy: "sticky",
      antigravityCooldownStrikeThreshold: 5,
      antigravityDefaultCooldownMs: 90_000,
      antigravity503RetryCount: 2,
    });

    // Then: both account-pool and unrelated settings survive the merge
    expect(updated.antigravityAccountPoolEnabled).toBe(true);
    expect(updated.antigravityAccountPoolStrategy).toBe("sticky");
    expect(updated.antigravityCooldownStrikeThreshold).toBe(5);
    expect(updated.antigravityDefaultCooldownMs).toBe(90_000);
    expect(updated.antigravity503RetryCount).toBe(2);
    expect(updated.requireLogin).toBe(true);
    expect(updated.customField).toBe("keep-me");
  });

  it("persists account-pool connection metadata on create and update", async () => {
    // Given: account-pool metadata on an Antigravity connection
    const created = await sqliteDb.createProviderConnection({
      provider: "antigravity",
      authType: "oauth",
      email: "pool@example.com",
      accessToken: "token-a",
      rateLimitedUntil: "2026-07-05T10:00:00.000Z",
      authCooldownUntil: "2026-07-05T10:05:00.000Z",
      modelCooldowns: { "claude-sonnet-4-6": "2026-07-05T11:00:00.000Z" },
      consecutiveStrikes: 1,
      modelStrikes: { "claude-sonnet-4-6": 2 },
      lastUsedAt: "2026-07-05T09:00:00.000Z",
      lastPoolError: "quota cooldown",
      lastPoolErrorAt: "2026-07-05T09:30:00.000Z",
      modelQuotaStatus: { "claude-sonnet-4-6": { remainingPercentage: 0 } },
      antigravity503RetryCount: 2,
    });

    // When: metadata is read and then updated
    const stored = await sqliteDb.getProviderConnectionById(created.id);
    const updated = await sqliteDb.updateProviderConnection(created.id, {
      consecutiveStrikes: 3,
      modelCooldowns: { "gemini-3.5-flash-low": "2026-07-05T12:00:00.000Z" },
      lastUsedAt: "2026-07-05T09:45:00.000Z",
    });
    const reloaded = await sqliteDb.getProviderConnectionById(created.id);

    // Then: metadata survives SQLite JSON persistence
    expect(stored.rateLimitedUntil).toBe("2026-07-05T10:00:00.000Z");
    expect(stored.authCooldownUntil).toBe("2026-07-05T10:05:00.000Z");
    expect(stored.modelCooldowns).toEqual({ "claude-sonnet-4-6": "2026-07-05T11:00:00.000Z" });
    expect(stored.consecutiveStrikes).toBe(1);
    expect(stored.modelStrikes).toEqual({ "claude-sonnet-4-6": 2 });
    expect(stored.lastPoolError).toBe("quota cooldown");
    expect(stored.modelQuotaStatus).toEqual({ "claude-sonnet-4-6": { remainingPercentage: 0 } });
    expect(stored.antigravity503RetryCount).toBe(2);
    expect(updated.consecutiveStrikes).toBe(3);
    expect(reloaded.modelCooldowns).toEqual({ "gemini-3.5-flash-low": "2026-07-05T12:00:00.000Z" });
    expect(reloaded.lastUsedAt).toBe("2026-07-05T09:45:00.000Z");
  });
});
