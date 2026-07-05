import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;
let auth;

async function bootDb() {
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  auth = await import("@/sse/services/auth.js");
  await db.initDb();
}

async function createKey(name = "limit-key") {
  return await db.createApiKey(name, `machine-${name}`);
}

async function saveUsage(apiKey, promptTokens, timestamp = new Date().toISOString()) {
  await db.saveRequestUsage({
    timestamp,
    provider: "openai",
    model: "gpt-4o-mini",
    apiKey,
    tokens: { prompt_tokens: promptTokens, completion_tokens: 10 },
    endpoint: "/v1/chat/completions",
    status: "ok",
  });
}

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-api-key-limits-"));
  process.env.DATA_DIR = tempDir;
  await bootDb();
});

afterEach(() => {
  db?.closeDb?.();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("API key opt-in usage limits", () => {
  it("keeps new API keys unlimited by default", async () => {
    const key = await createKey("default-unlimited");

    await saveUsage(key.key, 250);

    const summary = await db.getApiKeyUsageSummary(key.key);
    const authResult = await auth.getApiKeyAuthResult(key.key);

    expect(key.limits).toBeNull();
    expect(summary.status).toBe("unlimited");
    expect(summary.usage.inputTokens24h).toBe(250);
    expect(authResult).toEqual({ valid: true });
  });

  it("blocks only when a configured limit is exceeded", async () => {
    const key = await createKey("blocked-key");
    await db.updateApiKey(key.id, { limits: { inputTokens24h: 100 } });

    await saveUsage(key.key, 101);

    const authResult = await auth.getApiKeyAuthResult(key.key);

    expect(authResult.valid).toBe(false);
    expect(authResult.status).toBe(429);
    expect(authResult.limitType).toBe("inputTokens24h");
    expect(authResult.message).toContain("exceeded 24h input tokens limit");
  });

  it("normalizes limits through the API key update route", async () => {
    const key = await createKey("route-key");
    const { PUT } = await import("@/app/api/keys/[id]/route.js");
    const request = new Request("http://localhost/api/keys/route-key", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limits: { inputTokens5h: "75", cost24h: null } }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: key.id }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.key.limits).toEqual({ inputTokens5h: 75 });
  });

  it("reports usage by API key without exposing raw keys", async () => {
    const alpha = await createKey("Alpha");
    const beta = await createKey("Beta");

    await saveUsage(alpha.key, 30, "2026-07-05T00:00:00.000Z");
    await saveUsage(beta.key, 40, "2026-07-05T00:01:00.000Z");

    const report = await db.getApiKeyUsageReport({ period: "all", groupBy: "apiKey" });
    const alphaGroup = report.groups.find((group) => group.label === "Alpha");
    const betaGroup = report.groups.find((group) => group.label === "Beta");

    expect(report.totals.requests).toBe(2);
    expect(alphaGroup?.totals.inputTokens).toBe(30);
    expect(betaGroup?.totals.inputTokens).toBe(40);
    expect(JSON.stringify(report)).not.toContain(alpha.key);
    expect(JSON.stringify(report)).not.toContain(beta.key);
  });
});
