// Pool egress geo — engine layer, shared by the dashboard UI (Proxy Fitness /
// Proxy Pools egress column) and any provider region policy that wants to
// pre-mark pools unfit by egress region.
//
// The probe transport is provider-agnostic: it fetches ipinfo.io THROUGH the
// pool itself (relay headers for vercel/cloudflare/deno, proxy URL for
// socks/http), so it works for every pool type and every provider.

// The probe transport is provider-agnostic: it fetches ipinfo.io THROUGH the
// pool itself (relay headers for vercel/cloudflare/deno, proxy URL for
// socks/http), so it works for every pool type and every provider.
//
// State lives on globalThis (same reason as proxyPoolFitness): the background
// probe and the /api/proxy-pools reader must share ONE cache across Next dev
// bundles.

const GEO_STATE_KEY = "__9routerPoolGeo__";
const geoCache = (globalThis[GEO_STATE_KEY] ??= new Map()); // poolId -> { ip, country, ..., ts, ipHistory }

export const POOL_GEO_TTL_MS = 60 * 60 * 1000;
// How many past egress IPs to remember for flapping detection.
export const POOL_GEO_IP_HISTORY_MAX = 8;

// Debounce probe-failure logs: one line per failing pool per hour — the probe
// runs every 30 min, so a broken relay must not spam the log every pass.
const probeFailLogs = new Map(); // proxyUrl -> lastLoggedAt
const PROBE_FAIL_LOG_INTERVAL_MS = 60 * 60 * 1000;

function logProbeFailure(kind, proxyUrl, detail) {
  const key = String(proxyUrl || "");
  const now = Date.now();
  if (probeFailLogs.has(key) && now - probeFailLogs.get(key) < PROBE_FAIL_LOG_INTERVAL_MS) return;
  probeFailLogs.set(key, now);
  console.log(`[GeoProbe] ${kind} ${key.slice(0, 60)}${detail ? ` | ${detail.slice(0, 120)}` : ""}`);
}

// Test helper: drop all cached geo (module state is globalThis-backed).
export function resetPoolGeo() {
  geoCache.clear();
}

// Attach stability classification: >=2 distinct egress IPs observed = flapping
// (typical for serverless relays — Vercel/Cloudflare egress varies per colo).
function withStability(entry) {
  const ips = new Set([entry?.ip, ...(entry?.ipHistory || []).map((h) => h.ip)]);
  ips.delete("");
  const ipCount = ips.size;
  return { ...entry, ipCount, isUnstable: ipCount >= 2 };
}

export function getPoolGeo(poolId) {
  const entry = geoCache.get(poolId);
  if (!entry) return null;
  if (entry.ts + POOL_GEO_TTL_MS < Date.now()) {
    geoCache.delete(poolId);
    return null;
  }
  return withStability(entry);
}

export function setPoolGeo(poolId, geo) {
  if (!poolId || !geo?.ip) return;
  const prev = geoCache.get(poolId);
  const ipHistory = prev?.ipHistory ? [...prev.ipHistory] : [];
  if (prev?.ip && prev.ip !== geo.ip) {
    // Record the IP we are leaving — the history tracks past egress IPs.
    ipHistory.push({ ip: prev.ip, ts: Date.now() });
    if (ipHistory.length > POOL_GEO_IP_HISTORY_MAX) ipHistory.shift();
  }
  geoCache.set(poolId, { ...geo, ts: Date.now(), ipHistory });
}

export function poolGeoSnapshot(now = Date.now()) {
  const out = {};
  for (const [poolId, entry] of geoCache) {
    if (entry.ts + POOL_GEO_TTL_MS <= now) {
      geoCache.delete(poolId);
      continue;
    }
    out[poolId] = withStability(entry);
  }
  return out;
}

// Sweep geo entries past their TTL (ipHistory rides along with the entry).
// Returns how many entries were removed.
export function pruneStaleGeo(now = Date.now()) {
  let removed = 0;
  for (const [poolId, entry] of geoCache) {
    if (entry.ts + POOL_GEO_TTL_MS <= now) {
      geoCache.delete(poolId);
      removed += 1;
    }
  }
  return removed;
}

// Probe the egress geo of one pool via ipinfo through the pool. Fail-open:
// returns null on any error/timeout. `pool` shape: { proxyUrl, type }.
export async function probePoolGeo(pool, timeoutMs = 15000) {
  const proxyUrl = pool?.proxyUrl;
  if (!proxyUrl) return null;
  const { proxyAwareFetch } = await import("../utils/proxyFetch.js");
  const isRelay = ["vercel", "cloudflare", "deno"].includes(pool?.type);
  const proxyOptions = isRelay
    ? { vercelRelayUrl: proxyUrl }
    : { connectionProxyEnabled: true, connectionProxyUrl: proxyUrl };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("geo probe timeout")), timeoutMs);
  try {
    const res = await proxyAwareFetch("https://ipinfo.io/json", { signal: ctrl.signal }, proxyOptions);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      logProbeFailure(`http ${res.status}`, proxyUrl, txt);
      return null;
    }
    const data = await res.json().catch(() => null);
    if (!data?.ip) {
      logProbeFailure("no-ip", proxyUrl, "");
      return null;
    }
    return {
      ip: data.ip || "",
      country: data.country || "",
      region: data.region || "",
      city: data.city || "",
      org: data.org || "",
      isDatacenter: /(cloudflare|vercel|amazon|aws|google|microsoft|azure|digitalocean|hetzner|ovh|contabo|leaseweb)/i.test(String(data.org || "")),
    };
  } catch (error) {
    logProbeFailure("fail", proxyUrl, `${error?.name}: ${error?.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
