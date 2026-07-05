export const API_KEY_LIMIT_FIELDS = ["inputTokens5h", "inputTokens24h", "cost5h", "cost24h"];

export const API_KEY_LIMIT_WINDOWS = [
  { label: "15 min", ms: 15 * 60 * 1000 },
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "5 hours", ms: 5 * 60 * 60 * 1000 },
  { label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function positiveNumber(value) {
  const number = typeof value === "string" ? Number(value.trim()) : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function formatLimitDuration(ms) {
  const minutes = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${minutes} min`;
}

export function validateLimitWindow(window) {
  if (!window || typeof window !== "object" || Array.isArray(window)) {
    return { valid: false, error: "Window must be an object" };
  }

  const durationMs = positiveNumber(window.durationMs);
  if (!durationMs || durationMs < 60 * 1000) {
    return { valid: false, error: "durationMs must be at least 1 minute" };
  }
  if (durationMs > MAX_WINDOW_MS) {
    return { valid: false, error: "durationMs cannot exceed 30 days" };
  }

  const inputTokens = positiveNumber(window.inputTokens);
  const cost = positiveNumber(window.cost);
  if (!inputTokens && !cost) {
    return { valid: false, error: "Window must include inputTokens or cost" };
  }

  return { valid: true };
}

export function normalizeApiKeyLimits(limits, existingLimits = null) {
  if (limits === null) return null;
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
    throw new Error("limits must be an object or null");
  }

  const normalized = { ...(existingLimits || {}) };

  for (const field of API_KEY_LIMIT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(limits, field)) continue;
    const value = limits[field];
    if (value === null || value === undefined || value === "" || value === 0) {
      delete normalized[field];
      continue;
    }
    const number = positiveNumber(value);
    if (!number) throw new Error(`Invalid limit value for ${field}: must be null or positive number`);
    normalized[field] = number;
  }

  if (Object.prototype.hasOwnProperty.call(limits, "windows")) {
    if (limits.windows === null) {
      delete normalized.windows;
    } else if (Array.isArray(limits.windows)) {
      const windows = limits.windows.map((window) => {
        const validation = validateLimitWindow(window);
        if (!validation.valid) throw new Error(`Invalid window: ${validation.error}`);
        const durationMs = positiveNumber(window.durationMs);
        return {
          durationMs,
          label: window.label || formatLimitDuration(durationMs),
          inputTokens: positiveNumber(window.inputTokens),
          cost: positiveNumber(window.cost),
        };
      });
      if (windows.length > 0) normalized.windows = windows;
      else delete normalized.windows;
    } else {
      throw new Error("windows must be an array or null");
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}
