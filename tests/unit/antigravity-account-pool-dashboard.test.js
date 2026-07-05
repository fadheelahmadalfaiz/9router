import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

import {
  getAccountPoolHealth,
  maskAccountIdentifier,
  normalizePoolSettings,
} from "../../src/app/(dashboard)/dashboard/cli-tools/components/AntigravityAccountPoolCard.jsx";

const CARD_PATH = path.resolve("..", "src/app/(dashboard)/dashboard/cli-tools/components/AntigravityAccountPoolCard.jsx");

describe("Antigravity account pool dashboard helpers", () => {
  it("keeps settings default off and clamps bounded values", () => {
    expect(normalizePoolSettings({})).toEqual({
      antigravityAccountPoolEnabled: false,
      antigravityAccountPoolStrategy: "round-robin",
      antigravityCooldownStrikeThreshold: 3,
      antigravityDefaultCooldownMs: 120_000,
      antigravity503RetryCount: 3,
    });

    expect(normalizePoolSettings({
      antigravityAccountPoolEnabled: true,
      antigravityCooldownStrikeThreshold: 99,
      antigravityDefaultCooldownMs: 1,
      antigravity503RetryCount: 99,
    })).toMatchObject({
      antigravityAccountPoolEnabled: true,
      antigravityCooldownStrikeThreshold: 10,
      antigravityDefaultCooldownMs: 30_000,
      antigravity503RetryCount: 5,
    });
  });

  it("masks account identifiers by default", () => {
    expect(maskAccountIdentifier({ email: "person@example.com" })).toBe("pe***@example.com");
    expect(maskAccountIdentifier({ displayName: "Builder Account" })).toBe("Bu***nt");
    expect(maskAccountIdentifier({ id: "abcdef123456" })).toBe("ab***56");
    expect(maskAccountIdentifier({})).toBe("Unknown account");
  });

  it("derives neutral account health states", () => {
    const now = new Date("2026-07-05T00:00:00.000Z");
    const future = "2026-07-05T00:05:00.000Z";

    expect(getAccountPoolHealth({ isActive: true, authType: "oauth", accessToken: "token" }, now).label).toBe("Healthy");
    expect(getAccountPoolHealth({ isActive: false }, now).label).toBe("Inactive");
    expect(getAccountPoolHealth({ isActive: true, authType: "oauth" }, now).label).toBe("Unavailable");
    expect(getAccountPoolHealth({ isActive: true, authType: "oauth", accessToken: "token", rateLimitedUntil: future }, now).label).toBe("Cooldown");
    expect(getAccountPoolHealth({ isActive: true, authType: "oauth", accessToken: "token", authCooldownUntil: future }, now).label).toBe("Auth cooldown");
    expect(getAccountPoolHealth({ isActive: true, authType: "oauth", accessToken: "token", modelCooldowns: { "gemini-3-pro": future } }, now).label).toBe("Model cooldown");
  });

  it("uses neutral copy and avoids prohibited wording", () => {
    const source = fs.readFileSync(CARD_PATH, "utf8");
    for (const word of ["Account Pool", "Failover", "Cooldown", "Health", "Retry Attempts"]) {
      expect(source).toContain(word);
    }
    expect(source).not.toMatch(/\b(bypass|evade|unlimited|hack)\b/i);
  });
});
