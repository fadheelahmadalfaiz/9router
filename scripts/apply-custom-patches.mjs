#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const files = {
  providersRoute: 'src/app/api/providers/route.js',
  config: 'src/shared/constants/config.js',
  colors: 'src/shared/constants/colors.js',
  globals: 'src/app/globals.css',
  serialModelTests: 'src/shared/utils/serialModelTests.js',
  serialModelTestsTest: 'tests/unit/serialModelTests.test.js',
  providerPage: 'src/app/(dashboard)/dashboard/providers/[id]/page.js',
  modelRow: 'src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js',
  syncWorkflow: '.github/workflows/sync-upstream.yml',
};

function filePath(relativePath) {
  return path.join(root, relativePath);
}

function readRequired(relativePath) {
  const target = filePath(relativePath);
  if (!fs.existsSync(target)) {
    console.error(`Missing expected file: ${target}`);
    process.exit(1);
  }
  // Normalize CRLF -> LF so anchor matching is line-ending agnostic.
  return fs.readFileSync(target, 'utf8').replace(/\r\n/g, "\n");
}

function writeIfChanged(relativePath, contents, label) {
  const target = filePath(relativePath);
  const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  // Preserve the file's original line endings (CRLF stays CRLF, LF stays LF).
  if (before !== null && before.includes("\r\n") && !contents.includes("\r\n")) {
    contents = contents.replace(/\n/g, "\r\n");
  }
  if (before === contents) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  console.log(`Applied custom patch: ${label}.`);
  return true;
}

function replaceAllLiteral(input, search, replacement) {
  return input.split(search).join(replacement);
}

function replaceRequiredLiteral(relativePath, source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) {
    console.error(`Missing expected anchor in ${relativePath}: ${label}`);
    process.exit(1);
  }
  console.log(`Applied custom patch: ${label}.`);
  return replaceAllLiteral(source, search, replacement);
}

function replaceRequiredPattern(relativePath, source, pattern, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!pattern.test(source)) {
    console.error(`Missing expected anchor in ${relativePath}: ${label}`);
    process.exit(1);
  }
  console.log(`Applied custom patch: ${label}.`);
  return source.replace(pattern, replacement);
}

function replaceRequiredLiteralIfMissing(relativePath, source, search, replacement, requiredNeedle, label = requiredNeedle) {
  if (source.includes(requiredNeedle)) return source;
  return replaceRequiredLiteral(relativePath, source, search, replacement, label);
}

function replaceRequiredLiteralIfMissingPattern(relativePath, source, search, replacement, requiredPattern, label) {
  if (requiredPattern.test(source)) return source;
  return replaceRequiredLiteral(relativePath, source, search, replacement, label);
}

function replaceRequiredPatternIfMissing(relativePath, source, pattern, replacement, requiredPattern, label) {
  if (requiredPattern.test(source)) return source;
  if (!pattern.test(source)) {
    console.error(`Missing expected anchor in ${relativePath}: ${label}`);
    process.exit(1);
  }
  console.log(`Applied custom patch: ${label}.`);
  return source.replace(pattern, replacement);
}

function assertContains(relativePath, source, needle, label) {
  if (!source.includes(needle)) {
    console.error(`Custom patch verification failed in ${relativePath}: ${label}`);
    process.exit(1);
  }
}

function removeCompatibleSingleConnectionLimits(source) {
  let out = source;

  // Older upstream versions had explicit single-connection guards for compatible nodes.
  // Keep this patch idempotent so custom-patch can be regenerated from master every hour.
  const guards = [
    `      const existingConnections = await getProviderConnections({ provider });\n      if (existingConnections.length > 0) {\n        return NextResponse.json({ error: "Only one connection is allowed for this OpenAI Compatible node" }, { status: 400 });\n      }\n`,
    `      const existingConnections = await getProviderConnections({ provider });\n      if (existingConnections.length > 0) {\n        return NextResponse.json({ error: "Only one connection is allowed for this Anthropic Compatible node" }, { status: 400 });\n      }\n`,
    // Historical patch removed this too; keep it here in case upstream reintroduces it.
    `      const existingConnections = await getProviderConnections({ provider });\n      if (existingConnections.length > 0) {\n        return NextResponse.json({ error: "Only one connection is allowed for this Custom Embedding node" }, { status: 400 });\n      }\n`,
    // Broken intermediate state from the original manual patch; safe no-op on current code.
    `      const existingConnections = await getProviderConnections({ provider });\n      if (existingConnections.length > 0) {\n        return NextResponse.json({ error: "Only one connection is allowed for this Custom Embedding node" }, { status: 400 });\n      }\n      }\n`,
  ];

  for (const guard of guards) out = replaceAllLiteral(out, guard, '');
  return out;
}

function patchProvidersRoute() {
  const before = readRequired(files.providersRoute);
  const after = removeCompatibleSingleConnectionLimits(before);
  if (after !== before) {
    writeIfChanged(files.providersRoute, after, 'removed compatible provider single-connection limits');
  } else {
    console.log('Custom patch already applied / not needed on this upstream version: compatible provider single-connection limits.');
  }
}

const configContents = `import pkg from "../../../package.json" with { type: "json" };

// App configuration
export const APP_CONFIG = {
  name: "IzRouter Proxy",
  description: "AI Infrastructure Management",
  version: pkg.version,
};

// GitHub configuration
export const GITHUB_CONFIG = {
  changelogUrl: "https://raw.githubusercontent.com/decolua/9router/refs/heads/master/CHANGELOG.md",
  donateUrl: "https://9router.com/api/donate",
};

// Updater configuration
export const UPDATER_CONFIG = {
  npmPackageName: "9router",
  installCmd: "npm i -g 9router",
  installCmdLatest: "npm i -g 9router@latest --prefer-online",
  shutdownCountdownSec: 3,
  exitDelayMs: 500,
  statusPort: 20129,
  statusPollIntervalMs: 1000,
  statusLogTailLines: 8,
  installRetries: 3,
  installRetryDelayMs: 5000,
  lingerAfterDoneMs: 30000,
  waitForExitMinMs: 5000,
  waitForExitMaxMs: 20000,
  waitForExitCheckMs: 500,
  appPort: 20128,
};

// Theme configuration
export const THEME_CONFIG = {
  storageKey: "theme",
  defaultTheme: "system", // "light" | "dark" | "system"
};

// Subscription
export const SUBSCRIPTION_CONFIG = {
  price: 1.0,
  currency: "USD",
  interval: "month",
  planName: "Pro Plan",
};

// API endpoints
export const API_ENDPOINTS = {
  users: "/api/users",
  providers: "/api/providers",
  payments: "/api/payments",
  auth: "/api/auth",
};

export const CONSOLE_LOG_CONFIG = {
  maxLines: 200,
  pollIntervalMs: 1000,
};

// Client-side store TTL: how long fetched data stays fresh before re-fetching
export const CLIENT_STORE_TTL_MS = 60000;

// Quota auto-ping: keep 5h windows warm by sending a tiny request right after reset.
export const QUOTA_AUTOPING_CONFIG = {
  tickIntervalMs: 60000,                // scheduler tick
  pingLeadMs: 5000,                     // fire once reset passes (within tolerance)
  refreshAheadMs: 300000,               // refetch usage when within 5min of reset
  failureCooldownMs: 900000,            // avoid failed ping spam while upstream/auth is unhealthy
  providers: {
    claude: {
      settingsKey: "claudeAutoPing",    // preserve existing settings contract
      quotaKey: "session (5h)",         // quota key returned by usage handler
      pingModel: "claude-haiku-4-5-20251001",
      pingText: "hi",
      pingMaxTokens: 1,
    },
    codex: {
      settingsKey: "codexAutoPing",
      quotaKey: "session",
      pingWhenResetAtSlides: true,
      resetAtDriftMs: 30000,
      minPingIntervalMs: 600000,
      skipWhenBlockingQuotaExhausted: true,
      // Free and Plus Codex accounts both expose gpt-5.5; avoid fallback probes that waste requests.
      pingModel: "gpt-5.5",
      pingText: "hi",
      pingInstructions: "Reply with OK.",
      pingReasoningEffort: "none",
    },
  },
};

// Re-export from providers.js for backward compatibility
export {
  FREE_PROVIDERS,
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
  AI_PROVIDERS,
  AUTH_METHODS,
} from "./providers.js";

// Re-export from models.js for backward compatibility
export {
  PROVIDER_MODELS,
  AI_MODELS,
} from "./models.js";
`;

const colorsContents = `// IzRouter color palette
// Light theme: warm neutral surfaces with citron primary
// Dark theme: deep neutral surfaces with violet secondary accent

export const COLORS = {
  // Primary - citron (#c4bf1f)
  primary: {
    DEFAULT: "#c4bf1f",
    hover: "#9d9919",
    light: "#d9d23c",
    dark: "#4f4d0d",
  },

  // Secondary - violet companion with accessible contrast
  secondary: {
    DEFAULT: "#2b245e",
    hover: "#423883",
    light: "#8c7cf7",
    lightHover: "#b8afff",
    dark: "#1d1845",
  },

  // Light theme backgrounds
  light: {
    bg: "#FBF9F6",
    bgAlt: "#F5F1ED",
    surface: "#FFFFFF",
    sidebar: "rgba(246, 246, 246, 0.8)",
    border: "rgba(0, 0, 0, 0.1)",
    textMain: "#383733",
    textMuted: "#75736E",
  },

  // Dark theme backgrounds
  dark: {
    bg: "#191918",
    bgAlt: "#1F1F1E",
    surface: "#242423",
    sidebar: "rgba(30, 30, 30, 0.8)",
    border: "rgba(255, 255, 255, 0.1)",
    textMain: "#ECEBE8",
    textMuted: "#9E9D99",
  },

  // Status colors
  status: {
    success: "#22C55E",
    successLight: "#DCFCE7",
    successDark: "#166534",
    warning: "#F59E0B",
    warningLight: "#FEF3C7",
    warningDark: "#92400E",
    error: "#EF4444",
    errorLight: "#FEE2E2",
    errorDark: "#991B1B",
    info: "#3B82F6",
    infoLight: "#DBEAFE",
    infoDark: "#1E40AF",
  },
};

// CSS Variables mapping for Tailwind
export const CSS_VARIABLES = {
  light: {
    "--color-primary": COLORS.primary.DEFAULT,
    "--color-primary-hover": COLORS.primary.hover,
    "--color-secondary": COLORS.secondary.DEFAULT,
    "--color-secondary-hover": COLORS.secondary.hover,
    "--color-bg": COLORS.light.bg,
    "--color-bg-alt": COLORS.light.bgAlt,
    "--color-surface": COLORS.light.surface,
    "--color-sidebar": COLORS.light.sidebar,
    "--color-border": COLORS.light.border,
    "--color-text-main": COLORS.light.textMain,
    "--color-text-muted": COLORS.light.textMuted,
  },
  dark: {
    "--color-primary": COLORS.primary.DEFAULT,
    "--color-primary-hover": COLORS.primary.light,
    "--color-secondary": COLORS.secondary.light,
    "--color-secondary-hover": COLORS.secondary.lightHover,
    "--color-bg": COLORS.dark.bg,
    "--color-bg-alt": COLORS.dark.bgAlt,
    "--color-surface": COLORS.dark.surface,
    "--color-sidebar": COLORS.dark.sidebar,
    "--color-border": COLORS.dark.border,
    "--color-text-main": COLORS.dark.textMain,
    "--color-text-muted": COLORS.dark.textMuted,
  },
};
`;

const serialModelTestsContents = `export async function runSerialModelTests(models, testOneModel, callbacks = {}, signal) {
  const results = [];

  for (const model of models) {
    if (signal?.aborted) {
      callbacks.onCancel?.(results);
      return { status: "cancelled", results };
    }

    callbacks.onStart?.(model);

    try {
      const result = await testOneModel(model, { signal });

      if (signal?.aborted) {
        callbacks.onCancel?.(results);
        return { status: "cancelled", results };
      }

      const entry = { id: model.id, status: result?.ok ? "ok" : "error", result };
      results.push(entry);
      callbacks.onResult?.(entry, model);
    } catch (error) {
      if (signal?.aborted) {
        callbacks.onCancel?.(results);
        return { status: "cancelled", results };
      }

      const entry = { id: model.id, status: "error", error };
      results.push(entry);
      callbacks.onResult?.(entry, model);
    }
  }

  callbacks.onComplete?.(results);
  return { status: "complete", results };
}
`;

const serialModelTestsTestContents = `import { describe, expect, it, vi } from "vitest";
import { runSerialModelTests } from "@/shared/utils/serialModelTests.js";

function createDeferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("runSerialModelTests", () => {
  it("runs model tests in input order", async () => {
    const calls = [];
    const runOne = vi.fn(async (model) => {
      calls.push(model.id);
      return { ok: true };
    });

    const outcome = await runSerialModelTests([
      { id: "model-a" },
      { id: "model-b" },
      { id: "model-c" },
    ], runOne);

    expect(calls).toEqual(["model-a", "model-b", "model-c"]);
    expect(outcome).toEqual({
      status: "complete",
      results: [
        { id: "model-a", status: "ok", result: { ok: true } },
        { id: "model-b", status: "ok", result: { ok: true } },
        { id: "model-c", status: "ok", result: { ok: true } },
      ],
    });
  });

  it("does not start the next model before the current model resolves", async () => {
    const first = createDeferred();
    const events = [];
    const runOne = vi.fn((model) => {
      events.push(["start", model.id]);
      if (model.id === "model-a") return first.promise;
      return Promise.resolve({ ok: true });
    });

    const runPromise = runSerialModelTests([{ id: "model-a" }, { id: "model-b" }], runOne, {
      onResult: (entry) => events.push(["result", entry.id]),
    });

    await Promise.resolve();

    expect(events).toEqual([["start", "model-a"]]);
    expect(runOne).toHaveBeenCalledTimes(1);

    first.resolve({ ok: true });
    await runPromise;

    expect(events).toEqual([
      ["start", "model-a"],
      ["result", "model-a"],
      ["start", "model-b"],
      ["result", "model-b"],
    ]);
  });

  it("records false ok responses and thrown errors as errors while continuing", async () => {
    const runOne = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "not available" })
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce({ ok: true });

    const outcome = await runSerialModelTests([
      { id: "model-a" },
      { id: "model-b" },
      { id: "model-c" },
    ], runOne);

    expect(runOne).toHaveBeenCalledTimes(3);
    expect(outcome.status).toBe("complete");
    expect(outcome.results).toMatchObject([
      { id: "model-a", status: "error", result: { ok: false, error: "not available" } },
      { id: "model-b", status: "error" },
      { id: "model-c", status: "ok", result: { ok: true } },
    ]);
    expect(outcome.results[1].error).toBeInstanceOf(Error);
  });

  it("stops before starting the next model when aborted", async () => {
    const controller = new AbortController();
    const runOne = vi.fn(async () => {
      controller.abort();
      return { ok: true };
    });
    const onCancel = vi.fn();

    const outcome = await runSerialModelTests(
      [{ id: "model-a" }, { id: "model-b" }],
      runOne,
      { onCancel },
      controller.signal,
    );

    expect(runOne).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ status: "cancelled", results: [] });
    expect(onCancel).toHaveBeenCalledWith([]);
  });

  it("passes the abort signal to each model test", async () => {
    const controller = new AbortController();
    const runOne = vi.fn(async () => ({ ok: true }));

    await runSerialModelTests([{ id: "model-a" }], runOne, {}, controller.signal);

    expect(runOne).toHaveBeenCalledWith({ id: "model-a" }, { signal: controller.signal });
  });

  it("emits lifecycle callbacks in order", async () => {
    const events = [];

    const outcome = await runSerialModelTests(
      [{ id: "model-a" }],
      async () => ({ ok: true, latencyMs: 12 }),
      {
        onStart: (model) => events.push(["start", model.id]),
        onResult: (entry, model) => events.push(["result", entry.id, model.id, entry.status]),
        onComplete: (results) => events.push(["complete", results.length]),
      },
    );

    expect(outcome.status).toBe("complete");
    expect(events).toEqual([
      ["start", "model-a"],
      ["result", "model-a", "model-a", "ok"],
      ["complete", 1],
    ]);
  });
});
`;

const modelRowContents = `import PropTypes from "prop-types";
import { CapacityBadges } from "@/shared/components";

export default function ModelRow({ model, fullModel, alias, copied, onCopy, testStatus, isCustom, isFree, onDeleteAlias, onTest, isTesting, isTestDisabled, onDisable, caps }) {
  const borderColor = testStatus === "ok"
    ? "border-green-500/40"
    : testStatus === "error"
    ? "border-red-500/40"
    : "border-border";

  const iconColor = testStatus === "ok"
    ? "#22c55e"
    : testStatus === "error"
    ? "#ef4444"
    : undefined;

  return (
    <div className={\`group min-w-0 max-w-full rounded-lg border px-3 py-2 \${borderColor} hover:bg-sidebar/50\`}>
      <div className="flex min-w-0 items-start gap-2 sm:items-center">
        <span
          className="material-symbols-outlined shrink-0 text-base"
          style={iconColor ? { color: iconColor } : undefined}
        >
          {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <code className="max-w-[72vw] truncate rounded bg-sidebar px-1.5 py-0.5 font-mono text-xs text-text-muted sm:max-w-[360px]">{fullModel}</code>
          <span className="flex min-w-0 items-center text-[9px] gap-1 pl-1">
            {model.name && <span className="truncate text-[9px] italic text-text-muted/70">{model.name}</span>}
            <CapacityBadges caps={caps} colorOverride="text-text-muted/70" size={12} />
          </span>
        </div>
        {onTest && (
          <div className="relative shrink-0 group/btn">
            <button
              onClick={onTest}
              disabled={isTesting || isTestDisabled}
              className={\`rounded p-0.5 text-text-muted transition-opacity hover:bg-sidebar hover:text-primary \${isTesting ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}\`}
            >
              <span className="material-symbols-outlined text-sm" style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}>
                {isTesting ? "progress_activity" : "science"}
              </span>
            </button>
            <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {isTesting ? "Testing..." : "Test"}
            </span>
          </div>
        )}
        <div className="relative shrink-0 group/btn">
          <button
            onClick={() => onCopy(fullModel, \`model-\${model.id}\`)}
            className="rounded p-0.5 text-text-muted hover:bg-sidebar hover:text-primary"
          >
            <span className="material-symbols-outlined text-sm">
              {copied === \`model-\${model.id}\` ? "check" : "content_copy"}
            </span>
          </button>
          <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
            {copied === \`model-\${model.id}\` ? "Copied!" : "Copy"}
          </span>
        </div>
        {isCustom ? (
          <button
            onClick={onDeleteAlias}
            className="ml-auto rounded p-0.5 text-text-muted opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
            title="Remove custom model"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        ) : onDisable ? (
          <button
            onClick={onDisable}
            className="ml-auto rounded p-0.5 text-text-muted opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
            title="Disable this model"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

ModelRow.propTypes = {
  model: PropTypes.shape({
    id: PropTypes.string.isRequired,
  }).isRequired,
  fullModel: PropTypes.string.isRequired,
  alias: PropTypes.string,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  testStatus: PropTypes.oneOf(["ok", "error"]),
  isCustom: PropTypes.bool,
  isFree: PropTypes.bool,
  onDeleteAlias: PropTypes.func,
  onTest: PropTypes.func,
  isTesting: PropTypes.bool,
  isTestDisabled: PropTypes.bool,
  onDisable: PropTypes.func,
  caps: PropTypes.object,
};
`;

function patchBranding() {
  writeIfChanged(files.config, configContents, 'restored IzRouter app config');
  writeIfChanged(files.colors, colorsContents, 'restored citron/violet color constants');

  let globals = readRequired(files.globals);
  // Idempotent: if the fork palette is already present (e.g. sync-mibp branch
  // already carries it, or a previous run applied it), skip the replace.
  if (!globals.includes("--color-brand-500: #c4bf1f;")) {
    globals = replaceRequiredPattern(
      files.globals,
      globals,
      /\/\* ============================================================\r?\n   (?:9Router|IzRouter) palette[\s\S]*?\.dark \{[\s\S]*?\r?\n\}/,
    `/* ============================================================
   IzRouter palette - citron primary, violet companion accent,
   neutral warm bases
   ============================================================ */
:root {
  /* Brand scale (light) - centered on citron #c4bf1f */
  --color-brand-50: #fbfae8;
  --color-brand-100: #f3f1b9;
  --color-brand-200: #e7e37a;
  --color-brand-300: #d9d23c;
  --color-brand-400: #cec826;
  --color-brand-500: #c4bf1f;
  --color-brand-600: #9d9919;
  --color-brand-700: #747113;
  --color-brand-800: #4f4d0d;
  --color-brand-900: #2c2a07;

  /* Secondary scale - violet companion with contrast against citron and dark surfaces */
  --color-secondary-50: #f1efff;
  --color-secondary-100: #ddd8ff;
  --color-secondary-200: #b8afff;
  --color-secondary-300: #8c7cf7;
  --color-secondary-400: #6d5bd6;
  --color-secondary-500: #4d3fa7;
  --color-secondary-600: #423883;
  --color-secondary-700: #2b245e;
  --color-secondary-800: #241e50;
  --color-secondary-900: #1d1845;

  /* Primary (legacy alias for backward compat with existing components) */
  --color-primary: var(--color-brand-500);
  --color-primary-hover: var(--color-brand-600);
  --color-primary-rgb: 196, 191, 31;
  --color-secondary: var(--color-secondary-700);
  --color-secondary-hover: var(--color-secondary-600);
  --color-secondary-rgb: 43, 36, 94;

  /* Surfaces & backgrounds (light) */
  --color-bg: #FDFAF6;
  --color-bg-alt: #F7F3EE;
  --color-surface: #ffffff;
  --color-surface-2: #f4f4f5;
  --color-surface-3: #e7e7e9;
  --color-sidebar: rgba(244, 241, 236, 0.85);

  /* Borders */
  --color-border: #e5e7eb;
  --color-border-subtle: #f1f1f3;

  /* Text */
  --color-text: #0a0a0a;
  --color-text-main: #0a0a0a;
  --color-text-muted: #6B7280;
  --color-text-subtle: #9CA3AF;

  /* Status */
  --color-danger: #cf222e;
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-info: #3B82F6;

  /* Radius */
  --radius-brand: 10px;
  --radius-brand-lg: 14px;

  /* Shadows */
  --shadow-soft: 0 1px 2px 0 rgba(0,0,0,0.04);
  --shadow-warm: 0 2px 12px -2px rgba(var(--color-secondary-rgb), 0.18);
  --shadow-elevated: 0 12px 28px -4px rgba(60, 50, 45, 0.06);
  --shadow-elev:
    inset 0 1px 0 0 rgba(255,255,255,0.8),
    0 1px 2px rgba(15,23,42,0.04),
    0 12px 36px -8px rgba(15,23,42,0.10);
  --shadow-focus: 0 0 0 3px rgba(var(--color-secondary-rgb), 0.22);

  color-scheme: light;
}

.dark {
  /* Brand scale (dark) - same citron identity for consistent utilities */
  --color-brand-50: #fbfae8;
  --color-brand-100: #f3f1b9;
  --color-brand-200: #e7e37a;
  --color-brand-300: #d9d23c;
  --color-brand-400: #cec826;
  --color-brand-500: #c4bf1f;
  --color-brand-600: #9d9919;
  --color-brand-700: #747113;
  --color-brand-800: #4f4d0d;
  --color-brand-900: #2c2a07;

  --color-secondary-50: #f1efff;
  --color-secondary-100: #ddd8ff;
  --color-secondary-200: #b8afff;
  --color-secondary-300: #8c7cf7;
  --color-secondary-400: #6d5bd6;
  --color-secondary-500: #4d3fa7;
  --color-secondary-600: #423883;
  --color-secondary-700: #2b245e;
  --color-secondary-800: #241e50;
  --color-secondary-900: #1d1845;

  --color-primary: #c4bf1f;
  --color-primary-hover: #d9d23c;
  --color-primary-rgb: 196, 191, 31;
  --color-secondary: #8c7cf7;
  --color-secondary-hover: #b8afff;
  --color-secondary-rgb: 140, 124, 247;

  /* Surfaces (dark - Claude-like neutral warm) */
  --color-bg: #1a1a1a;
  --color-bg-alt: #1F1F1E;
  --color-surface: #262626;
  --color-surface-2: #303030;
  --color-surface-3: #3a3a3a;
  --color-sidebar: rgba(30, 30, 30, 0.85);

  --color-border: #333333;
  --color-border-subtle: #2a2a2a;

  --color-text: #ededed;
  --color-text-main: #ededed;
  --color-text-muted: #9ca3af;
  --color-text-subtle: #6b7280;

  --color-danger: #ef4444;
  --color-success: #22c55e;
  --color-warning: #fbbf24;
  --color-info: #60a5fa;

  --shadow-soft: 0 1px 2px 0 rgba(0,0,0,0.3);
  --shadow-warm: 0 2px 12px -2px rgba(var(--color-secondary-rgb), 0.25);
  --shadow-elevated: 0 12px 28px -4px rgba(0, 0, 0, 0.45);
  --shadow-elev:
    inset 0 1px 0 0 rgba(255,255,255,0.06),
    0 1px 2px rgba(0,0,0,0.4),
    0 16px 48px -8px rgba(0,0,0,0.55);
  --shadow-focus: 0 0 0 3px rgba(var(--color-secondary-rgb), 0.24);

  color-scheme: dark;
}`,
      'restored citron/violet global palette',
    );
    writeIfChanged(files.globals, globals, 'restored citron/violet global palette');
  }

  assertContains(files.config, readRequired(files.config), 'name: "IzRouter Proxy"', 'IzRouter app name');
  assertContains(files.colors, readRequired(files.colors), '#c4bf1f', 'citron primary color');
  assertContains(files.colors, readRequired(files.colors), '#2b245e', 'violet secondary color');
  assertContains(files.globals, readRequired(files.globals), '--color-brand-500: #c4bf1f;', 'citron CSS variable');
  assertContains(files.globals, readRequired(files.globals), '--color-secondary-700: #2b245e;', 'violet CSS variable');
}

function patchProviderPage() {
  let source = readRequired(files.providerPage);

  source = replaceRequiredLiteralIfMissing(
    files.providerPage,
    source,
    'import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";\n',
    'import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";\nimport { runSerialModelTests } from "@/shared/utils/serialModelTests";\n',
    'import { runSerialModelTests } from "@/shared/utils/serialModelTests";',
    'added serial model test import',
  );

  source = replaceRequiredLiteralIfMissing(
    files.providerPage,
    source,
    `function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
`,
    `function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createInitialModelAutoTestProgress() {
  return {
    total: 0,
    completed: 0,
    passed: 0,
    failed: 0,
    stopped: false,
    currentModelId: null,
  };
}
`,
    'function createInitialModelAutoTestProgress()',
    'added auto-test progress initializer',
  );

  source = replaceRequiredLiteralIfMissing(
    files.providerPage,
    source,
    `  const [modelTestResults, setModelTestResults] = useState({});
  const [modelsTestError, setModelsTestError] = useState("");
  const [testingModelIds, setTestingModelIds] = useState(() => new Set());
`,
    `  const [modelTestResults, setModelTestResults] = useState({});
  const [modelsTestError, setModelsTestError] = useState("");
  const [testingModelIds, setTestingModelIds] = useState(() => new Set());
  const [autoTestingModels, setAutoTestingModels] = useState(false);
  const [autoTestProgress, setAutoTestProgress] = useState(createInitialModelAutoTestProgress);
  const autoTestAbortRef = useRef(null);
`,
    'const [autoTestingModels, setAutoTestingModels] = useState(false);',
    'added auto-test state',
  );

  // Upstream refactored `renderModelsSection` (newer versions inline the model
  // list logic directly instead of a `getNonCompatibleLlmModelRows()` helper).
  // Two possible shapes are supported:
  //
  //  (A) OLD: a `getNonCompatibleLlmModelRows` helper returns the object and
  //      `renderModelsSection` destructures it.  -> just add testableModels.
  //
  //  (B) NEW: the logic lives inline inside `renderModelsSection`:
  //        const allModels = [...];
  //        const disabledSet = ...;
  //        const displayModels = ...;
  //        const disabledDisplayModels = ...;
  //        const customModelRows = getProviderCustomModelRows({...});
  //
  //        return (
  //      In this case we (re)introduce a helper that returns the same object --
  //      including testableModels -- and make renderModelsSection call it. This
  //      keeps every downstream patch (which expects `getNonCompatibleLlmModelRows`)
  //      working unchanged.
  //
  // Idempotency: if the required needle is already present we skip entirely.

  const helperNeedle = 'return { displayModels, disabledDisplayModels, customModelRows, testableModels };';

  if (!source.includes(helperNeedle)) {
    // ---- Shape (B): new inline structure -------------------------------------
    const NEW_INLINE_BLOCK =
`    const allModels = [
      ...models,
      ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
    ].filter((m) => { const k = getModelKind(m); return !k || k === "llm"; });
    const disabledSet = new Set(disabledModelIds);
    const displayModels = allModels.filter((m) => !disabledSet.has(m.id));
    const disabledDisplayModels = allModels.filter((m) => disabledSet.has(m.id));
    const customModelRows = getProviderCustomModelRows({
      customModels,
      modelAliases,
      providerAlias: providerStorageAlias,
      builtInModels: models,
      type: "llm",
    });

    return (
`;
    const NEW_INLINE_REPLACEMENT =
`    const { displayModels, disabledDisplayModels, customModelRows } = getNonCompatibleLlmModelRows();

    return (
`;

    if (source.includes(NEW_INLINE_BLOCK)) {
      // 1) Replace the inline block inside renderModelsSection with a helper call.
      source = replaceAllLiteral(source, NEW_INLINE_BLOCK, NEW_INLINE_REPLACEMENT);

      // 2) Inject the helper right before `const renderModelsSection = () => {`.
      const HELPER = `  const getNonCompatibleLlmModelRows = () => {
    const allModels = [
      ...models,
      ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
    ].filter((m) => { const k = getModelKind(m); return !k || k === "llm"; });
    const disabledSet = new Set(disabledModelIds);
    const displayModels = allModels.filter((m) => !disabledSet.has(m.id));
    const disabledDisplayModels = allModels.filter((m) => disabledSet.has(m.id));
    const customModelRows = getProviderCustomModelRows({
      customModels,
      modelAliases,
      providerAlias: providerStorageAlias,
      builtInModels: models,
      type: "llm",
    });
    const testableModels = [];
    const seenIds = new Set();

    for (const model of [...customModelRows, ...displayModels]) {
      if (!model.id || seenIds.has(model.id)) continue;
      seenIds.add(model.id);
      testableModels.push({ id: model.id });
    }

    return { displayModels, disabledDisplayModels, customModelRows, testableModels };
  };

`;
      const sectionAnchor = '  const renderModelsSection = () => {\n';
      if (!source.includes(sectionAnchor)) {
        console.error(`Missing expected anchor in ${files.providerPage}: renderModelsSection declaration`);
        process.exit(1);
      }
      source = replaceAllLiteral(source, sectionAnchor, HELPER + sectionAnchor);
      console.log('Applied custom patch: added testable model list (inline->helper refactor).');
    } else {
      // ---- Shape (A): old helper structure -----------------------------------
      source = replaceRequiredLiteralIfMissing(
        files.providerPage,
        source,
        `    const customModelRows = getProviderCustomModelRows({
      customModels,
      modelAliases,
      providerAlias: providerStorageAlias,
      builtInModels: models,
      type: "llm",
    });

    return { displayModels, disabledDisplayModels, customModelRows };
`,
        `    const customModelRows = getProviderCustomModelRows({
      customModels,
      modelAliases,
      providerAlias: providerStorageAlias,
      builtInModels: models,
      type: "llm",
    });
    const testableModels = [];
    const seenIds = new Set();

    for (const model of [...customModelRows, ...displayModels]) {
      if (!model.id || seenIds.has(model.id)) continue;
      seenIds.add(model.id);
      testableModels.push({ id: model.id });
    }

    return { displayModels, disabledDisplayModels, customModelRows, testableModels };
`,
        helperNeedle,
        'added testable model list',
      );
    }
  }

  source = replaceRequiredLiteralIfMissing(
    files.providerPage,
    source,
    `  const handleTestModel = async (modelId) => {
    if (testingModelIds.has(modelId)) return;
`,
    `  const handleTestModel = async (modelId) => {
    if (testingModelIds.has(modelId) || autoTestingModels) return;
`,
    'if (testingModelIds.has(modelId) || autoTestingModels) return;',
    'blocked single model tests during auto-test',
  );

  source = replaceRequiredLiteralIfMissing(
    files.providerPage,
    source,
    `  const renderModelsSection = () => {
`,
    `  const testOneAvailableModel = async (modelId, { signal } = {}) => {
    const res = await fetch("/api/models/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: \`\${providerStorageAlias}/\${modelId}\` }),
      signal,
    });
    return res.json();
  };

  const handleAutoTestAvailableModels = async () => {
    if (autoTestingModels || testingModelIds.size > 0 || isCompatible) return;

    const { testableModels } = getNonCompatibleLlmModelRows();
    if (testableModels.length === 0) return;

    const controller = new AbortController();
    autoTestAbortRef.current = controller;
    setAutoTestingModels(true);
    setModelsTestError("");
    setAutoTestProgress({ ...createInitialModelAutoTestProgress(), total: testableModels.length });
    setModelTestResults((prev) => {
      const next = { ...prev };
      for (const model of testableModels) delete next[model.id];
      return next;
    });

    try {
      const outcome = await runSerialModelTests(
        testableModels,
        (model, options) => testOneAvailableModel(model.id, options),
        {
          onStart: (model) => {
            setTestingModelIds(new Set([model.id]));
            setAutoTestProgress((prev) => ({ ...prev, currentModelId: model.id }));
          },
          onResult: (entry) => {
            setModelTestResults((prev) => ({ ...prev, [entry.id]: entry.status }));
            setAutoTestProgress((prev) => ({
              ...prev,
              completed: prev.completed + 1,
              passed: entry.status === "ok" ? prev.passed + 1 : prev.passed,
              failed: entry.status === "error" ? prev.failed + 1 : prev.failed,
            }));
          },
          onCancel: (results) => {
            setAutoTestProgress((prev) => ({
              ...prev,
              completed: results.length,
              passed: results.filter((entry) => entry.status === "ok").length,
              failed: results.filter((entry) => entry.status === "error").length,
              stopped: true,
              currentModelId: null,
            }));
          },
        },
        controller.signal,
      );

      if (outcome.status === "complete") {
        setAutoTestProgress((prev) => ({ ...prev, currentModelId: null }));
      }
    } finally {
      if (autoTestAbortRef.current === controller) {
        autoTestAbortRef.current = null;
      }
      setTestingModelIds(new Set());
      setAutoTestingModels(false);
    }
  };

  const handleStopAutoTestAvailableModels = () => {
    autoTestAbortRef.current?.abort();
  };

  const renderModelsSection = () => {
`,
    'const handleAutoTestAvailableModels = async () => {',
    'added auto-test handlers',
  );

  source = replaceRequiredPatternIfMissing(
    files.providerPage,
    source,
    /(\n\s+isTesting=\{testingModelIds\.has\(model\.id\)\}\r?\n)(\s+)isCustom/,
    '$1$2isTestDisabled={autoTestingModels}\n$2isCustom',
    /isTestDisabled=\{autoTestingModels\}\r?\n\s+isCustom/,
    'disabled custom model tests during auto-test',
  );

  source = replaceRequiredPatternIfMissing(
    files.providerPage,
    source,
    /(\n\s+isTesting=\{testingModelIds\.has\(model\.id\)\}\r?\n)(\s+)isFree=\{model\.isFree\}/,
    '$1$2isTestDisabled={autoTestingModels}\n$2isFree={model.isFree}',
    /isTestDisabled=\{autoTestingModels\}\r?\n\s+isFree=\{model\.isFree\}/,
    'disabled built-in model tests during auto-test',
  );

  source = replaceRequiredLiteralIfMissing(
    files.providerPage,
    source,
    `  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:gap-8 sm:px-0">
`,
    `  const autoTestCurrentPosition = Math.min(autoTestProgress.completed + 1, autoTestProgress.total);
  const autoTestProgressLabel = autoTestProgress.stopped
    ? \`Stopped after \${autoTestProgress.completed} of \${autoTestProgress.total}\`
    : autoTestingModels
    ? \`Testing \${autoTestCurrentPosition} of \${autoTestProgress.total}\`
    : \`Completed \${autoTestProgress.completed} of \${autoTestProgress.total}\`;

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:gap-8 sm:px-0">
`,
    'const autoTestProgressLabel = autoTestProgress.stopped',
    'added auto-test progress label',
  );

  // "Auto Test All" button. Two upstream shapes again:
  //  (A) OLD: const { displayModels } = getNonCompatibleLlmModelRows(); ... gap-2
  //  (B) NEW: const allIds = [...]; const activeIds = allIds.filter(...); ... gap-2
  // Detect whichever shape is present and inject the Auto Test All buttons.
  if (!source.includes('const canRunAutoTest = (connections.length > 0 || isFreeNoAuth) && testableModels.length > 0;')) {
    const AUTO_TEST_BUTTONS = `                {canRunAutoTest && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="science"
                    onClick={handleAutoTestAvailableModels}
                    disabled={autoTestingModels || testingModelIds.size > 0}
                    loading={autoTestingModels}
                  >
                    {autoTestingModels ? "Testing..." : "Auto Test All"}
                  </Button>
                )}
                {autoTestingModels && (
                  <Button size="sm" variant="secondary" icon="stop_circle" onClick={handleStopAutoTestAvailableModels}>
                    Stop
                  </Button>
                )}
`;

    const OLD_BLOCK = `          {!isCompatible && (() => {
            const { displayModels } = getNonCompatibleLlmModelRows();
            const activeIds = displayModels.map((model) => model.id);
            return (
              <div className="flex flex-wrap gap-2">
`;
    const NEW_BLOCK = `          {!isCompatible && (() => {
            const { displayModels, testableModels } = getNonCompatibleLlmModelRows();
            const activeIds = displayModels.map((model) => model.id);
            const canRunAutoTest = (connections.length > 0 || isFreeNoAuth) && testableModels.length > 0;
            return (
              <div className="flex flex-wrap gap-2">
`;

    if (source.includes(OLD_BLOCK)) {
      source = replaceAllLiteral(source, OLD_BLOCK, NEW_BLOCK);
      console.log('Applied custom patch: added Auto Test All button.');
    } else {
      // Shape (B): inline allIds/activeIds inside render area.
      const OLD_INLINE = `          {!isCompatible && (() => {
            const allIds = [
              ...models,
              ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
            ].filter((m) => { const k = getModelKind(m); return !k || k === "llm"; }).map((m) => m.id);
            const activeIds = allIds.filter((id) => !disabledModelIds.includes(id));
            return (
`;
      const NEW_INLINE = `          {!isCompatible && (() => {
            const { testableModels } = getNonCompatibleLlmModelRows();
            const allIds = [
              ...models,
              ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
            ].filter((m) => { const k = getModelKind(m); return !k || k === "llm"; }).map((m) => m.id);
            const activeIds = allIds.filter((id) => !disabledModelIds.includes(id));
            const canRunAutoTest = (connections.length > 0 || isFreeNoAuth) && testableModels.length > 0;
            return (
`;
      if (!source.includes(OLD_INLINE)) {
        console.error(`Missing expected anchor in ${files.providerPage}: added Auto Test All button`);
        process.exit(1);
      }
      source = replaceAllLiteral(source, OLD_INLINE, NEW_INLINE);

      // The inline shape uses `<div className="flex gap-2">` (not "flex-wrap").
      // Insert the buttons as the first children of that div.
      const INLINE_DIV = `              <div className="flex gap-2">
                {disabledModelIds.length > 0 && (
`;
      const INLINE_DIV_REPLACEMENT = `              <div className="flex flex-wrap gap-2">
${AUTO_TEST_BUTTONS}                {disabledModelIds.length > 0 && (
`;
      if (!source.includes(INLINE_DIV)) {
        console.error(`Missing expected anchor in ${files.providerPage}: added Auto Test All button (inline div)`);
        process.exit(1);
      }
      source = replaceAllLiteral(source, INLINE_DIV, INLINE_DIV_REPLACEMENT);
      console.log('Applied custom patch: added Auto Test All button (inline).');
    }
  }

  // Auto-test progress UI: insert the status bar right before renderModelsSection().
  // Anchor on the stable `{renderModelsSection()}` call (the surrounding
  // modelsTestError markup varies between upstream versions).
  const PROGRESS_UI = `        {!isCompatible && autoTestProgress.total > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs" role="status" aria-live="polite">
            <span className="inline-flex items-center gap-1 font-semibold text-text-main">
              <span className="material-symbols-outlined text-[16px]">
                {autoTestProgress.stopped ? "stop_circle" : autoTestingModels ? "progress_activity" : "task_alt"}
              </span>
              {autoTestProgressLabel}
            </span>
            {autoTestProgress.currentModelId && (
              <span className="min-w-0 truncate text-text-muted">
                Current: <span className="font-mono text-text-main">{autoTestProgress.currentModelId}</span>
              </span>
            )}
            <span className="text-green-600 dark:text-green-400">Passed: {autoTestProgress.passed}</span>
            <span className="text-red-600 dark:text-red-400">Failed: {autoTestProgress.failed}</span>
          </div>
        )}
`;
  const progressNeedle = 'role="status" aria-live="polite"';
  if (!source.includes(progressNeedle)) {
    const RENDER_CALL = '        {renderModelsSection()}\n';
    if (!source.includes(RENDER_CALL)) {
      console.error(`Missing expected anchor in ${files.providerPage}: added auto-test progress UI`);
      process.exit(1);
    }
    source = replaceAllLiteral(source, RENDER_CALL, PROGRESS_UI + RENDER_CALL);
    console.log('Applied custom patch: added auto-test progress UI.');
  }

  writeIfChanged(files.providerPage, source, 'restored Auto Test All provider page wiring');

  const patched = readRequired(files.providerPage);
  assertContains(files.providerPage, patched, 'runSerialModelTests', 'serial model test import');
  assertContains(files.providerPage, patched, 'autoTestingModels', 'auto-test state');
  assertContains(files.providerPage, patched, 'handleAutoTestAvailableModels', 'auto-test handler');
  assertContains(files.providerPage, patched, 'Auto Test All', 'auto-test button');
  assertContains(files.providerPage, patched, 'isTestDisabled={autoTestingModels}', 'row test disable prop');
}

function patchAutoTestFiles() {
  writeIfChanged(files.serialModelTests, serialModelTestsContents, 'restored serial model test runner');
  writeIfChanged(files.serialModelTestsTest, serialModelTestsTestContents, 'restored serial model test coverage');
  writeIfChanged(files.modelRow, modelRowContents, 'restored ModelRow auto-test disable support');
  patchProviderPage();

  const modelRow = readRequired(files.modelRow);
  assertContains(files.modelRow, modelRow, 'isTestDisabled', 'ModelRow test disable prop');
  assertContains(files.modelRow, modelRow, 'disabled={isTesting || isTestDisabled}', 'ModelRow disabled test button');
}

function patchWorkflow() {
  let source = readRequired(files.syncWorkflow);
  const stagedFilesBlock = `            git add \\
              src/app/api/providers/route.js \\
              src/shared/constants/config.js \\
              src/shared/constants/colors.js \\
              src/app/globals.css \\
              src/shared/utils/serialModelTests.js \\
              tests/unit/serialModelTests.test.js \\
              'src/app/(dashboard)/dashboard/providers/[id]/page.js' \\
              'src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js' \\
              scripts/apply-custom-patches.mjs \\
              .github/workflows/sync-upstream.yml
`;
  if (!source.includes("'src/app/(dashboard)/dashboard/providers/[id]/page.js'")) {
    source = replaceRequiredPattern(
      files.syncWorkflow,
      source,
      /^            git add .*\.github\/workflows\/sync-upstream\.yml\r?$/m,
      stagedFilesBlock.trimEnd(),
      'staged all regenerated custom patch files',
    );
  }
  writeIfChanged(files.syncWorkflow, source, 'updated upstream sync staging list');
}

patchProvidersRoute();
patchBranding();
patchAutoTestFiles();
patchWorkflow();

console.log('Patch script finished. Build/CI will validate the Next.js route and dashboard.');
