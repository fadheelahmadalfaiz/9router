export const DEFAULT_ANTIGRAVITY_POOL_SETTINGS = {
  antigravityAccountPoolStrategy: "round-robin",
  antigravityCooldownStrikeThreshold: 3,
  antigravityDefaultCooldownMs: 120_000,
  antigravity503RetryCount: 3,
};

function settingsWithDefaults(settings = {}) {
  return { ...DEFAULT_ANTIGRAVITY_POOL_SETTINGS, ...settings };
}

function toTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function nowMs(now = new Date()) {
  const time = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Number.isFinite(time) ? time : Date.now();
}

function nowIso(now = new Date()) {
  return new Date(nowMs(now)).toISOString();
}

function addMsIso(now, durationMs) {
  return new Date(nowMs(now) + durationMs).toISOString();
}

function isActiveUntil(value, now) {
  const time = toTime(value);
  return time !== null && time > nowMs(now);
}

function withoutKey(object, key) {
  if (!object || typeof object !== "object") return {};
  const copy = { ...object };
  delete copy[key];
  return copy;
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

export function getAntigravityAccountUnavailabilityReasons(connection, options = {}) {
  const reasons = [];
  const model = options.model;
  const now = options.now ?? new Date();

  if (!connection || typeof connection !== "object") {
    return [{ code: "missing_connection", message: "Connection is missing" }];
  }

  if (connection.provider !== "antigravity") {
    reasons.push({ code: "not_antigravity", message: "Connection provider is not Antigravity" });
  }

  if (connection.isActive !== true) {
    reasons.push({ code: "inactive", message: "Connection is inactive" });
  }

  if (connection.authType !== "oauth") {
    reasons.push({ code: "not_oauth", message: "Connection auth type is not OAuth" });
  }

  if (!connection.accessToken) {
    reasons.push({ code: "missing_access_token", message: "Connection is missing an access token" });
  }

  const expiresAt = toTime(connection.expiresAt);
  if (expiresAt !== null && expiresAt <= nowMs(now) && !connection.refreshToken) {
    reasons.push({
      code: "expired_token_without_refresh_token",
      message: "Connection token is expired and cannot be refreshed",
      until: connection.expiresAt,
    });
  }

  if (isActiveUntil(connection.rateLimitedUntil, now)) {
    reasons.push({
      code: "rate_limited",
      message: "Connection is in quota cooldown",
      until: connection.rateLimitedUntil,
    });
  }

  if (isActiveUntil(connection.authCooldownUntil, now)) {
    reasons.push({
      code: "auth_cooldown",
      message: "Connection is in auth cooldown",
      until: connection.authCooldownUntil,
    });
  }

  const modelCooldownUntil = model ? connection.modelCooldowns?.[model] : undefined;
  if (isActiveUntil(modelCooldownUntil, now)) {
    reasons.push({
      code: "model_cooldown",
      message: "Connection is in model quota cooldown",
      model,
      until: modelCooldownUntil,
    });
  }

  return reasons;
}

export function isEligibleAntigravityAccount(connection, options = {}) {
  return getAntigravityAccountUnavailabilityReasons(connection, options).length === 0;
}

export function getEligibleAntigravityAccounts(connections, options = {}) {
  return (connections || []).filter((connection) => isEligibleAntigravityAccount(connection, options));
}

function connectionId(connection) {
  return connection?.id;
}

function selectFromCursor(eligible, cursor) {
  if (cursor === undefined || cursor === null) return eligible[0] ?? null;
  const startIndex = Number(cursor);
  if (!Number.isInteger(startIndex) || eligible.length === 0) return eligible[0] ?? null;
  return eligible[((startIndex % eligible.length) + eligible.length) % eligible.length] ?? null;
}

function selectAfterPreviousId(connections, eligible, previousConnectionId) {
  if (!previousConnectionId) return eligible[0] ?? null;
  const previousIndex = connections.findIndex((connection) => connectionId(connection) === previousConnectionId);
  if (previousIndex < 0) return eligible[0] ?? null;

  for (let offset = 1; offset <= connections.length; offset += 1) {
    const candidate = connections[(previousIndex + offset) % connections.length];
    if (eligible.some((connection) => connection === candidate)) return candidate;
  }

  return null;
}

export function selectEligibleAntigravityAccount(connections, options = {}) {
  const source = connections || [];
  const settings = settingsWithDefaults(options.settings);
  const eligible = getEligibleAntigravityAccounts(source, options);
  if (eligible.length === 0) return null;

  if (options.cursor !== undefined || options.cursorIndex !== undefined) {
    return selectFromCursor(eligible, options.cursor ?? options.cursorIndex);
  }

  if (settings.antigravityAccountPoolStrategy === "round-robin") {
    return selectAfterPreviousId(source, eligible, options.previousConnectionId ?? options.previousId);
  }

  return eligible[0];
}

export function recordAntigravityAccountSuccess(connection, options = {}) {
  const model = options.model;
  const updatedModelStrikes = model ? withoutKey(connection.modelStrikes, model) : { ...(connection.modelStrikes || {}) };

  return compactObject({
    ...connection,
    consecutiveStrikes: 0,
    modelStrikes: Object.keys(updatedModelStrikes).length > 0 ? updatedModelStrikes : undefined,
    lastPoolError: undefined,
    lastPoolErrorAt: undefined,
    lastUsedAt: nowIso(options.now),
  });
}

export function recordAntigravityQuotaFailure(connection, options = {}) {
  const settings = settingsWithDefaults(options.settings);
  const model = options.model;
  const nextAccountStrikes = (Number(connection.consecutiveStrikes) || 0) + 1;
  const currentModelStrikes = { ...(connection.modelStrikes || {}) };
  const nextModelStrikes = model ? (Number(currentModelStrikes[model]) || 0) + 1 : 0;
  const thresholdReached = nextAccountStrikes >= settings.antigravityCooldownStrikeThreshold;
  const cooldownUntil = thresholdReached
    ? addMsIso(options.now, settings.antigravityDefaultCooldownMs)
    : undefined;

  if (model) currentModelStrikes[model] = nextModelStrikes;

  return compactObject({
    ...connection,
    consecutiveStrikes: nextAccountStrikes,
    modelStrikes: Object.keys(currentModelStrikes).length > 0 ? currentModelStrikes : undefined,
    rateLimitedUntil: thresholdReached ? cooldownUntil : connection.rateLimitedUntil,
    modelCooldowns:
      thresholdReached && model
        ? { ...(connection.modelCooldowns || {}), [model]: cooldownUntil }
        : connection.modelCooldowns,
    lastPoolError: `${options.statusCode ?? "quota"} quota failure`,
    lastPoolErrorAt: nowIso(options.now),
  });
}

export function recordAntigravityAuthFailure(connection, options = {}) {
  const settings = settingsWithDefaults(options.settings);

  return compactObject({
    ...connection,
    authCooldownUntil: addMsIso(options.now, settings.antigravityDefaultCooldownMs),
    consecutiveStrikes: 0,
    lastPoolError: `${options.statusCode ?? "auth"} auth failure`,
    lastPoolErrorAt: nowIso(options.now),
  });
}
