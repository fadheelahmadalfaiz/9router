/**
 * Direct verification that `preferredConnectionId` is no longer an orphan variable
 * in src/sse/handlers/chat.js.
 *
 * Before the fix, the const declaration was deleted by the upstream auto-merge
 * while the usages inside the arrow functions passed to withCapacityAdapterStripping
 * survived, so evaluating those closures threw:
 *   ReferenceError: preferredConnectionId is not defined
 *
 * This test drives handleChat through the combo path (which is where the arrow
 * function carrying preferredConnectionId lives) and asserts the value reaches
 * credential selection.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const captured = { preferredConnectionId: Symbol("unset") };

function makeRequest(body, headers = {}) {
  return {
    url: "http://local/v1/chat/completions",
    headers: new Headers({ "content-type": "application/json", ...headers }),
    json: async () => body,
  };
}

function bootstrap() {
  vi.resetModules();

  vi.doMock("../../src/sse/services/auth.js", () => ({
    extractApiKey: () => "key-1",
    getApiKeyAuthResult: async () => ({ valid: true }),
    isValidApiKey: async () => true,
    checkApiKeyAuth: async () => ({ allowed: true }),
    getProviderCredentials: vi.fn(async (provider, exclude, model, opts) => {
      captured.preferredConnectionId = opts?.preferredConnectionId;
      return null;
    }),
    markAccountUnavailable: vi.fn(async () => ({ shouldFallback: true })),
    clearAccountError: vi.fn(async () => {}),
  }));

  vi.doMock("../../src/sse/services/tokenRefresh.js", () => ({
    updateProviderCredentials: vi.fn(),
    checkAndRefreshToken: vi.fn(async () => null),
  }));

  vi.doMock("../../src/sse/services/antigravityQuota.js", () => ({
    handleAntigravityQuotaError: vi.fn(async () => null),
    clearAntigravityStrikes: vi.fn(),
  }));

  vi.doMock("@/lib/localDb", () => ({
    getSettings: async () => ({
      requireApiKey: false,
      comboStrategy: "fallback",
      comboStickyRoundRobinLimit: 0,
    }),
    getProviderConnections: async () => [],
  }));

  vi.doMock("../../src/sse/services/model.js", () => ({
    getModelInfo: async () => ({ provider: "antigravity", model: "gemini-3-pro" }),
    getComboModels: async () => ["antigravity/gemini-3-pro"],
  }));

  vi.doMock("../../src/sse/utils/logger.js", () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    maskKey: (k) => k,
  }));

  vi.doMock("open-sse/services/combo.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      detectRequiredCapabilities: () => new Set(),
      handleComboChat: async ({ handleSingleModel }) => {
        // This is the closure that captured preferredConnectionId.
        await handleSingleModel({ model: "antigravity/gemini-3-pro" }, "antigravity/gemini-3-pro");
        return new Response("ok", { status: 200 });
      },
      handleFusionChat: async () => new Response("ok", { status: 200 }),
    };
  });

  vi.doMock("open-sse/services/capacityAdapter.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      augmentModelsWithCapacityAdapter: (models) => models,
      getActiveAdapterStrategy: () => "fallback",
      getCapabilitiesForModel: () => ({ contextWindow: 1000 }),
      stripHistoryForContext: (b) => b,
    };
  });

  vi.doMock("open-sse/handlers/chatCore.js", () => ({
    handleChatCore: async () => ({ success: true, response: new Response("ok", { status: 200 }) }),
  }));
}

describe("preferredConnectionId scope", () => {
  beforeEach(() => {
    captured.preferredConnectionId = Symbol("unset");
    bootstrap();
  });

  it("does not throw ReferenceError and forwards x-connection-id to credential selection", async () => {
    const { handleChat } = await import("../../src/sse/handlers/chat.js");

    const res = await handleChat(
      makeRequest(
        { model: "my-combo", messages: [{ role: "user", content: "hi" }] },
        { "x-connection-id": "ag-eligible" }
      )
    );

    // The bug surfaced as an unhandled throw from inside the closure.
    expect(res).toBeDefined();
    expect(captured.preferredConnectionId).toBe("ag-eligible");
  });

  it("passes null when the header is absent", async () => {
    const { handleChat } = await import("../../src/sse/handlers/chat.js");

    await handleChat(
      makeRequest({ model: "my-combo", messages: [{ role: "user", content: "hi" }] })
    );

    expect(captured.preferredConnectionId).toBe(null);
  });
});
