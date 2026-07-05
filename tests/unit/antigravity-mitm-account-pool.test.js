import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);

function clearCjsModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

function withDataDir(dataDir, callback) {
  const oldDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  try {
    return callback();
  } finally {
    if (oldDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = oldDataDir;
  }
}

function writePoolSnapshot(dataDir, snapshot) {
  const mitmDir = path.join(dataDir, "mitm");
  fs.mkdirSync(mitmDir, { recursive: true });
  fs.writeFileSync(path.join(mitmDir, "antigravity-account-pool.json"), JSON.stringify(snapshot), "utf8");
}

function loadDbReader(dataDir) {
  return withDataDir(dataDir, () => {
    clearCjsModule("../../src/mitm/paths.js");
    clearCjsModule("../../src/mitm/dbReader.js");
    return require("../../src/mitm/dbReader.js");
  });
}

function makeReq(headers = {}) {
  return {
    url: "/v1beta/models/gemini-3-pro:streamGenerateContent",
    headers,
  };
}

function makeRes() {
  return {
    headersSent: false,
    writeHead: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };
}

function mockChatDependencies({
  provider = "antigravity",
  model = "gemini-3-pro",
  settings = {},
  credentialsQueue = [],
  chatResults = [],
  connections = [],
} = {}) {
  const updateProviderConnection = vi.fn(async (id, data) => ({ id, ...data }));
  const getProviderConnections = vi.fn(async () => connections);
  const getProviderCredentials = vi.fn(async () => credentialsQueue.shift() ?? null);
  const handleChatCore = vi.fn(async (options = {}) => {
    const result = chatResults.shift() ?? { success: true, response: new Response("{}", { status: 200 }) };
    if (result.success) await options.onRequestSuccess?.();
    return result;
  });

  vi.doMock("@/lib/localDb", () => ({
    getSettings: vi.fn(async () => ({ requireApiKey: false, antigravity503RetryCount: 3, ...settings })),
    getProviderConnections,
    updateProviderConnection,
    validateApiKey: vi.fn(async () => true),
  }));
  vi.doMock("../../src/sse/services/model.js", () => ({
    getModelInfo: vi.fn(async () => ({ provider, model })),
    getComboModels: vi.fn(async () => null),
  }));
  vi.doMock("open-sse/handlers/chatCore.js", () => ({ handleChatCore }));
  vi.doMock("open-sse/utils/claudeHeaderCache.js", () => ({ cacheClaudeHeaders: vi.fn() }));
  vi.doMock("open-sse/utils/error.js", () => ({
    errorResponse: vi.fn((status, message) => new Response(message, { status })),
    unavailableResponse: vi.fn((status, message) => new Response(message, { status })),
  }));
  vi.doMock("open-sse/services/combo.js", () => ({ handleComboChat: vi.fn(), handleFusionChat: vi.fn() }));
  vi.doMock("open-sse/utils/bypassHandler.js", () => ({ handleBypassRequest: vi.fn(() => null) }));
  vi.doMock("open-sse/config/runtimeConfig.js", async (importOriginal) => ({
    ...(await importOriginal()),
    HTTP_STATUS: { BAD_REQUEST: 400, NOT_FOUND: 404, SERVICE_UNAVAILABLE: 503, UNAUTHORIZED: 401 },
  }));
  vi.doMock("open-sse/translator/formats.js", async (importOriginal) => ({
    ...(await importOriginal()),
    detectFormatByEndpoint: vi.fn(() => null),
  }));
  vi.doMock("../../src/sse/services/tokenRefresh.js", () => ({
    updateProviderCredentials: vi.fn(),
    checkAndRefreshToken: vi.fn(async (_provider, credentials) => credentials),
  }));
  vi.doMock("open-sse/services/projectId.js", () => ({ getProjectIdForConnection: vi.fn(async () => null) }));
  vi.doMock("@/lib/headroom/detect", () => ({ DEFAULT_HEADROOM_URL: "http://localhost:8787" }));

  return { getProviderCredentials, getProviderConnections, updateProviderConnection, handleChatCore };
}

function chatRequest(model = "antigravity/gemini-3-pro") {
  return new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-connection-id": "ag-1" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }] }),
  });
}

async function loadAntigravityHandler(dataDir, fetchRouter) {
  return withDataDir(dataDir, async () => {
    const basePath = require.resolve("../../src/mitm/handlers/base.js");
    clearCjsModule("../../src/mitm/paths.js");
    clearCjsModule("../../src/mitm/dbReader.js");
    clearCjsModule("../../src/mitm/handlers/antigravity.js");
    require.cache[basePath] = {
      id: basePath,
      filename: basePath,
      loaded: true,
      exports: {
        fetchRouter,
        pipeSSE: async () => {},
      },
    };

    return require("../../src/mitm/handlers/antigravity.js");
  });
}

describe("Antigravity MITM account-pool seam", () => {
  let dataDir;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-antigravity-mitm-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("../../src/sse/services/auth.js");
  });

  it("keeps account-pool selection disabled unless antigravityAccountPoolEnabled is true", () => {
    writePoolSnapshot(dataDir, {
      settings: { antigravityAccountPoolEnabled: false },
      accounts: [{ id: "ag-1", provider: "antigravity", isActive: true, authType: "oauth", hasAccessToken: true }],
    });

    const { getAntigravityAccountPoolSelection } = loadDbReader(dataDir);

    expect(getAntigravityAccountPoolSelection("gemini-3-pro")).toBeNull();
  });

  it("selects an eligible account from the JSON snapshot when enabled", () => {
    writePoolSnapshot(dataDir, {
      settings: { antigravityAccountPoolEnabled: true },
      accounts: [
        { id: "inactive", provider: "antigravity", isActive: false, authType: "oauth", hasAccessToken: true },
        { id: "cooled", provider: "antigravity", isActive: true, authType: "oauth", hasAccessToken: true, rateLimitedUntil: "2999-01-01T00:00:00.000Z" },
        { id: "ag-eligible", provider: "antigravity", isActive: true, authType: "oauth", hasAccessToken: true },
      ],
    });

    const { getAntigravityAccountPoolSelection } = loadDbReader(dataDir);

    expect(getAntigravityAccountPoolSelection("gemini-3-pro")?.id).toBe("ag-eligible");
  });

  it("preserves current Antigravity MITM forwarding when the pool is disabled", async () => {
    writePoolSnapshot(dataDir, {
      settings: { antigravityAccountPoolEnabled: false },
      accounts: [{ id: "ag-1", provider: "antigravity", isActive: true, authType: "oauth", hasAccessToken: true }],
    });
    const fetchRouter = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const handler = await loadAntigravityHandler(dataDir, fetchRouter);
    const headers = { "user-agent": "antigravity", "x-existing": "1" };

    await handler.intercept(makeReq(headers), makeRes(), Buffer.from(JSON.stringify({ model: "old" })), "ag/model");

    expect(fetchRouter).toHaveBeenCalledWith(
      { model: "ag/model" },
      "/v1/chat/completions",
      headers,
    );
  });

  it("forwards selected Antigravity account as x-connection-id when pool is enabled", async () => {
    writePoolSnapshot(dataDir, {
      settings: { antigravityAccountPoolEnabled: true },
      accounts: [{ id: "ag-eligible", provider: "antigravity", isActive: true, authType: "oauth", hasAccessToken: true }],
    });
    const fetchRouter = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const handler = await loadAntigravityHandler(dataDir, fetchRouter);

    await handler.intercept(makeReq({ "user-agent": "antigravity" }), makeRes(), Buffer.from(JSON.stringify({ model: "old" })), "ag/model");

    expect(fetchRouter).toHaveBeenCalledWith(
      { model: "ag/model" },
      "/v1/chat/completions",
      expect.objectContaining({ "x-connection-id": "ag-eligible" }),
    );
  });

  it("passes x-connection-id to chat credential selection as preferredConnectionId", async () => {
    vi.resetModules();
    const getProviderCredentials = vi.fn().mockResolvedValue(null);
    vi.doMock("../../src/sse/services/auth.js", () => ({
      getProviderCredentials,
      markAccountUnavailable: vi.fn(),
      clearAccountError: vi.fn(),
      extractApiKey: vi.fn(() => null),
      getApiKeyAuthResult: vi.fn(async () => ({ valid: true })),
    }));
    vi.doMock("@/lib/localDb", () => ({ getSettings: vi.fn(async () => ({ requireApiKey: false })) }));
    vi.doMock("../services/model.js", () => ({}));
    vi.doMock("../../src/sse/services/model.js", () => ({
      getModelInfo: vi.fn(async () => ({ provider: "antigravity", model: "gemini-3-pro" })),
      getComboModels: vi.fn(async () => null),
    }));
    vi.doMock("open-sse/handlers/chatCore.js", () => ({ handleChatCore: vi.fn() }));
    vi.doMock("open-sse/utils/claudeHeaderCache.js", () => ({ cacheClaudeHeaders: vi.fn() }));
    vi.doMock("open-sse/utils/error.js", () => ({
      errorResponse: vi.fn((status, message) => new Response(message, { status })),
      unavailableResponse: vi.fn((status, message) => new Response(message, { status })),
    }));
    vi.doMock("open-sse/services/combo.js", () => ({ handleComboChat: vi.fn(), handleFusionChat: vi.fn() }));
    vi.doMock("open-sse/utils/bypassHandler.js", () => ({ handleBypassRequest: vi.fn(() => null) }));
    vi.doMock("open-sse/config/runtimeConfig.js", async (importOriginal) => ({
      ...(await importOriginal()),
      HTTP_STATUS: { BAD_REQUEST: 400, NOT_FOUND: 404, SERVICE_UNAVAILABLE: 503, UNAUTHORIZED: 401 },
    }));
    vi.doMock("open-sse/translator/formats.js", async (importOriginal) => ({
      ...(await importOriginal()),
      detectFormatByEndpoint: vi.fn(() => null),
    }));
    vi.doMock("../../src/sse/services/tokenRefresh.js", () => ({ updateProviderCredentials: vi.fn(), checkAndRefreshToken: vi.fn() }));
    vi.doMock("open-sse/services/projectId.js", () => ({ getProjectIdForConnection: vi.fn() }));
    vi.doMock("@/lib/headroom/detect", () => ({ DEFAULT_HEADROOM_URL: "http://localhost:8787" }));

    const { handleChat } = await import("../../src/sse/handlers/chat.js");
    const request = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-connection-id": "ag-eligible" },
      body: JSON.stringify({ model: "antigravity/gemini-3-pro", messages: [{ role: "user", content: "hi" }] }),
    });

    await handleChat(request);

    expect(getProviderCredentials).toHaveBeenCalledWith(
      "antigravity",
      expect.any(Set),
      "gemini-3-pro",
      { preferredConnectionId: "ag-eligible" },
    );
  }, 10_000);

  it("keeps native SQLite and lowdb imports out of standalone MITM modules", () => {
    const mitmFiles = [
      "src/mitm/dbReader.js",
      "src/mitm/handlers/antigravity.js",
      "src/mitm/handlers/base.js",
    ];

    for (const relativePath of mitmFiles) {
      const content = fs.readFileSync(path.resolve("..", relativePath), "utf8");
      expect(content).not.toMatch(/better-sqlite3|node:sqlite|lowdb|db\.json|@\/lib\/localDb|db\/repos/);
    }
  });

  it("records Antigravity pool success metadata after a successful request", async () => {
    vi.resetModules();
    const connection = {
      id: "ag-1",
      provider: "antigravity",
      consecutiveStrikes: 2,
      modelStrikes: { "gemini-3-pro": 2 },
      lastPoolError: "429 quota failure",
      lastPoolErrorAt: "2026-01-01T00:00:00.000Z",
    };
    const { updateProviderConnection } = mockChatDependencies({
      settings: { antigravityAccountPoolEnabled: true },
      credentialsQueue: [{ connectionId: "ag-1", connectionName: "A", accessToken: "token", _connection: connection }],
      chatResults: [{ success: true, response: new Response("{}", { status: 200 }) }],
      connections: [connection],
    });

    const { handleChat } = await import("../../src/sse/handlers/chat.js");
    await handleChat(chatRequest());

    expect(updateProviderConnection).toHaveBeenCalledWith(
      "ag-1",
      expect.objectContaining({ consecutiveStrikes: 0, lastUsedAt: expect.any(String) }),
    );
    expect(updateProviderConnection.mock.calls.at(-1)[1].lastPoolError).toBeUndefined();
  });

  it("records Antigravity quota strikes and cooldown metadata on 429/503 failures", async () => {
    vi.resetModules();
    const connection = {
      id: "ag-1",
      provider: "antigravity",
      consecutiveStrikes: 2,
      modelStrikes: { "gemini-3-pro": 2 },
    };
    const { updateProviderConnection } = mockChatDependencies({
      settings: { antigravityAccountPoolEnabled: true, antigravityCooldownStrikeThreshold: 3, antigravityDefaultCooldownMs: 60_000 },
      credentialsQueue: [{ connectionId: "ag-1", connectionName: "A", accessToken: "token", _connection: connection }, null],
      chatResults: [{ success: false, status: 429, error: "quota" }],
      connections: [connection],
    });

    const { handleChat } = await import("../../src/sse/handlers/chat.js");
    await handleChat(chatRequest());

    expect(updateProviderConnection).toHaveBeenCalledWith(
      "ag-1",
      expect.objectContaining({
        consecutiveStrikes: 3,
        modelStrikes: { "gemini-3-pro": 3 },
        rateLimitedUntil: expect.any(String),
        modelCooldowns: { "gemini-3-pro": expect.any(String) },
        lastPoolError: "429 quota failure",
        lastPoolErrorAt: expect.any(String),
      }),
    );
  });

  it("records Antigravity auth cooldown metadata on 401/403 failures", async () => {
    vi.resetModules();
    const connection = { id: "ag-1", provider: "antigravity", consecutiveStrikes: 2 };
    const { updateProviderConnection } = mockChatDependencies({
      settings: { antigravityAccountPoolEnabled: true, antigravityDefaultCooldownMs: 60_000 },
      credentialsQueue: [{ connectionId: "ag-1", connectionName: "A", accessToken: "token", _connection: connection }, null],
      chatResults: [{ success: false, status: 401, error: "auth" }],
      connections: [connection],
    });

    const { handleChat } = await import("../../src/sse/handlers/chat.js");
    await handleChat(chatRequest());

    expect(updateProviderConnection).toHaveBeenCalledWith(
      "ag-1",
      expect.objectContaining({
        authCooldownUntil: expect.any(String),
        consecutiveStrikes: 0,
        lastPoolError: "401 auth failure",
        lastPoolErrorAt: expect.any(String),
      }),
    );
  });

  it("bounds Antigravity fallback attempts by antigravity503RetryCount", async () => {
    vi.resetModules();
    const connections = [
      { id: "ag-1", provider: "antigravity" },
      { id: "ag-2", provider: "antigravity" },
      { id: "ag-3", provider: "antigravity" },
    ];
    const { updateProviderConnection } = mockChatDependencies({
      settings: { antigravityAccountPoolEnabled: true, antigravity503RetryCount: 1 },
      credentialsQueue: [
        { connectionId: "ag-1", connectionName: "A", accessToken: "token", _connection: connections[0] },
        { connectionId: "ag-2", connectionName: "B", accessToken: "token", _connection: connections[1] },
      ],
      chatResults: [
        { success: false, status: 503, error: "temporary" },
        { success: false, status: 503, error: "temporary" },
      ],
      connections,
    });

    const { handleChat } = await import("../../src/sse/handlers/chat.js");
    const response = await handleChat(chatRequest());

    expect(response.status).toBe(503);
    const poolErrorUpdates = updateProviderConnection.mock.calls.filter(([, data]) => data.lastPoolError === "503 quota failure");
    expect(poolErrorUpdates).toHaveLength(2);
    expect(poolErrorUpdates.map(([id]) => id)).toEqual(["ag-1", "ag-2"]);
  });

  it("does not write Antigravity pool metadata when Account Pool is disabled", async () => {
    vi.resetModules();
    const connection = {
      id: "ag-1",
      provider: "antigravity",
      consecutiveStrikes: 2,
      modelStrikes: { "gemini-3-pro": 2 },
      lastPoolError: "429 quota failure",
    };
    const { updateProviderConnection } = mockChatDependencies({
      settings: { antigravityAccountPoolEnabled: false },
      credentialsQueue: [{ connectionId: "ag-1", connectionName: "A", accessToken: "token", _connection: connection }],
      chatResults: [{ success: true, response: new Response("{}", { status: 200 }) }],
      connections: [connection],
    });

    const { handleChat } = await import("../../src/sse/handlers/chat.js");
    await handleChat(chatRequest());

    expect(updateProviderConnection).not.toHaveBeenCalledWith(
      "ag-1",
      expect.objectContaining({ lastPoolError: undefined, consecutiveStrikes: 0 }),
    );
  });

  it("keeps non-Antigravity fallback behavior unchanged", async () => {
    vi.resetModules();
    const connection = { id: "cc-1", provider: "claude" };
    const { updateProviderConnection } = mockChatDependencies({
      provider: "claude",
      model: "claude-sonnet",
      credentialsQueue: [{ connectionId: "cc-1", connectionName: "C", accessToken: "token", _connection: connection }, null],
      chatResults: [{ success: false, status: 429, error: "quota" }],
      connections: [connection],
    });

    const { handleChat } = await import("../../src/sse/handlers/chat.js");
    await handleChat(chatRequest("claude/claude-sonnet"));

    expect(updateProviderConnection).toHaveBeenCalledWith(
      "cc-1",
      expect.objectContaining({ testStatus: "unavailable", errorCode: 429 }),
    );
    expect(updateProviderConnection.mock.calls.flatMap(([, data]) => Object.keys(data))).not.toContain("lastPoolError");
  });
});
