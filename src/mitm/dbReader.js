// CJS reader for MITM standalone process. Reads mitmAlias from JSON cache
// at $DATA_DIR/mitm/aliases.json (synced by app from SQLite on startup + writes).
// JSON-only: no SQLite native binding required in MITM bundle.
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./paths");

const CACHE_FILE = path.join(DATA_DIR, "mitm", "aliases.json");
const ANTIGRAVITY_POOL_FILE = path.join(DATA_DIR, "mitm", "antigravity-account-pool.json");

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  } catch { return null; }
}

function getMitmAlias(toolName) {
  const all = readCache();
  return all?.[toolName] || null;
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch { return null; }
}

function toTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isFuture(value, now) {
  const time = toTime(value);
  return time !== null && time > now;
}

function isEligibleAntigravityAccount(account, model, now) {
  if (!account || account.provider !== "antigravity") return false;
  if (account.isActive !== true) return false;
  if (account.authType !== "oauth") return false;
  if (account.hasAccessToken !== true) return false;
  if (isFuture(account.rateLimitedUntil, now)) return false;
  if (isFuture(account.authCooldownUntil, now)) return false;
  if (model && isFuture(account.modelCooldowns?.[model], now)) return false;
  return true;
}

function getAntigravityAccountPoolSelection(model) {
  const snapshot = readJson(ANTIGRAVITY_POOL_FILE);
  if (snapshot?.settings?.antigravityAccountPoolEnabled !== true) return null;

  const now = Date.now();
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  const eligible = accounts.filter((account) => isEligibleAntigravityAccount(account, model, now));
  return eligible[0] || null;
}

module.exports = { getMitmAlias, getAntigravityAccountPoolSelection };
